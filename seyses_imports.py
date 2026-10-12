"""Utilidades de importación y conciliación para SEYSES.
No escribe datos por sí sola: la interfaz debe mostrar vista previa y pedir confirmación.
"""
from __future__ import annotations

import hashlib
import io
import re
import unicodedata
from typing import Any

import pandas as pd


RUT_CANDIDATES = ("rut", "run", "documento", "identificacion", "id trabajador", "numero documento")
NAME_CANDIDATES = ("nombre", "trabajador", "nombre completo", "razon social", "empleado")
BRANCH_CANDIDATES = ("sucursal", "centro de costo", "centro costo", "local", "faena", "branch")
AFP_CANDIDATES = ("afp", "administradora de fondos")
HEALTH_CANDIDATES = ("salud", "isapre", "fonasa", "prevision salud")


def normalize_label(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def normalize_rut(value: Any) -> str:
    if pd.isna(value):
        return ""
    raw = str(value).strip().upper().replace(" ", "")
    raw = re.sub(r"\.0$", "", raw)
    raw = raw.replace(".", "")
    raw = raw.replace("—", "-").replace("–", "-")
    raw = re.sub(r"\.0$", "", raw)
    raw = raw.replace("-", "")
    if len(raw) < 2:
        return ""
    return f"{raw[:-1]}-{raw[-1]}"


def file_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def read_spreadsheet(uploaded_file) -> tuple[pd.DataFrame, dict]:
    content = uploaded_file.getvalue()
    if not content:
        raise ValueError("El archivo está vacío.")
    try:
        workbook = pd.ExcelFile(io.BytesIO(content))
        sheet = workbook.sheet_names[0]
        df = pd.read_excel(io.BytesIO(content), sheet_name=sheet, dtype=str)
    except Exception as exc:
        raise ValueError("No se pudo leer el Excel. Verifica que sea un .xlsx válido y no esté protegido.") from exc
    df.columns = [str(c).strip() for c in df.columns]
    df = df.dropna(how="all").copy()
    if df.empty:
        raise ValueError("La primera hoja del Excel no contiene filas con datos.")
    return df, {
        "filename": getattr(uploaded_file, "name", "archivo.xlsx"),
        "bytes": len(content),
        "sha256": file_sha256(content),
        "sheet": sheet,
        "rows": int(len(df)),
    }


def find_column(df: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    labels = {normalize_label(c): c for c in df.columns}
    for candidate in candidates:
        for normalized, original in labels.items():
            if normalized == candidate or candidate in normalized:
                return original
    return None


def _clean_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def prepare_source(df: pd.DataFrame, source_name: str) -> tuple[pd.DataFrame, dict]:
    rut_col = find_column(df, RUT_CANDIDATES)
    name_col = find_column(df, NAME_CANDIDATES)
    if not rut_col:
        raise ValueError(f"No identifiqué la columna RUT/ RUN en {source_name}. Renombra esa columna como RUT y vuelve a cargar.")
    branch_col = find_column(df, BRANCH_CANDIDATES)
    afp_col = find_column(df, AFP_CANDIDATES)
    health_col = find_column(df, HEALTH_CANDIDATES)
    result = pd.DataFrame()
    result["rut"] = df[rut_col].map(normalize_rut)
    result["full_name"] = df[name_col].map(_clean_text) if name_col else ""
    result["branch"] = df[branch_col].map(_clean_text) if branch_col else ""
    result["afp"] = df[afp_col].map(_clean_text) if afp_col else ""
    result["health_provider"] = df[health_col].map(_clean_text) if health_col else ""
    result = result[result["rut"] != ""].copy()
    duplicate_mask = result["rut"].duplicated(keep=False)
    duplicates = sorted(result.loc[duplicate_mask, "rut"].unique().tolist())
    result = result.drop_duplicates(subset=["rut"], keep="first")
    return result, {
        "rut_column": rut_col,
        "name_column": name_col,
        "rows_without_rut": int(df[rut_col].map(normalize_rut).eq("").sum()),
        "duplicate_ruts": duplicates,
        "source_rows": int(len(df)),
        "valid_unique_ruts": int(len(result)),
    }


def reconcile_sources(payroll_df: pd.DataFrame, access_df: pd.DataFrame) -> tuple[pd.DataFrame, dict, dict]:
    payroll, payroll_info = prepare_source(payroll_df, "nómina")
    access, access_info = prepare_source(access_df, "control de accesos")
    merged = payroll.merge(access, on="rut", how="outer", suffixes=("_nomina", "_accesos"), indicator=True)
    rows = []
    for _, row in merged.iterrows():
        source = row["_merge"]
        rut = row["rut"]
        name = _clean_text(row.get("full_name_nomina")) or _clean_text(row.get("full_name_accesos"))
        if source == "left_only":
            category, description, severity = "Sin acceso", "Trabajador presente en nómina, pero ausente en el archivo de accesos.", "warning"
        elif source == "right_only":
            category, description, severity = "Fuera de nómina", "Registro presente en accesos, pero ausente en la nómina cargada.", "critical"
        else:
            category, description, severity = "", "", ""
            nom_name = _clean_text(row.get("full_name_nomina"))
            acc_name = _clean_text(row.get("full_name_accesos"))
            if nom_name and acc_name and normalize_label(nom_name) != normalize_label(acc_name):
                category, description, severity = "Nombre distinto", "El nombre informado difiere entre nómina y control de accesos.", "warning"
        rows.append({
            "rut": rut,
            "full_name": name,
            "nomina": "Presente" if source != "right_only" else "Ausente",
            "accesos": "Presente" if source != "left_only" else "Ausente",
            "sucursal": _clean_text(row.get("branch_nomina")) or _clean_text(row.get("branch_accesos")),
            "categoria": category,
            "descripcion": description,
            "severidad": severity,
            "estado": "Con diferencia" if category else "Coincide",
        })
    result = pd.DataFrame(rows)
    return result, payroll_info, access_info


def worker_payloads(df: pd.DataFrame, process_id: str) -> list[dict]:
    payloads = []
    for _, row in df.iterrows():
        payloads.append({
            "rut": row.get("rut") or None,
            "full_name": _clean_text(row.get("full_name")) or "Nombre no informado",
            "branch": _clean_text(row.get("sucursal")) or None,
            "source_process_id": process_id,
            "metadata": {
                "source": "conciliacion_nomina_accesos",
                "payroll_status": _clean_text(row.get("nomina")) or None,
                "access_status": _clean_text(row.get("accesos")) or None,
                "seyses_status": _clean_text(row.get("estado")) or None,
            },
            "payroll_status": row.get("nomina"),
            "access_status": row.get("accesos"),
            "seyses_status": row.get("estado"),
        })
    return payloads
