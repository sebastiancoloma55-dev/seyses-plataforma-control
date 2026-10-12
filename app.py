from datetime import datetime
import pandas as pd
import plotly.express as px
import streamlit as st

from sesyes_supabase import sign_in, sign_out, log_event, get_audit_logs
from sesyes_imports import read_spreadsheet, reconcile_sources, worker_payloads

st.set_page_config(
    page_title="SEYSES | Centro de control",
    page_icon="◈",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Design system: restrained indigo, lilac and white, responsive Streamlit layout.
st.markdown("""
<style>
:root { --ink:#211b3b; --muted:#77728f; --line:#e8e6f2; --surface:#ffffff; --accent:#6657d9; }
.stApp { background: #f6f7fc; color: var(--ink); }
[data-testid="stHeader"] { background: rgba(246,247,252,.88); }
[data-testid="stSidebar"] { background: linear-gradient(180deg,#211b3b 0%,#302650 100%); }
[data-testid="stSidebar"] * { color: #f6f4ff !important; }
[data-testid="stSidebar"] [data-testid="stRadio"] label { padding: 7px 10px; border-radius: 9px; }
[data-testid="stSidebar"] [data-testid="stRadio"] label:hover { background: rgba(255,255,255,.10); }
.block-container { padding-top: 1.6rem; padding-bottom: 2.5rem; max-width: 1500px; }
.seyses-brand { font-size: 1.45rem; font-weight: 850; letter-spacing: .13em; color: #fff; }
.seyses-brand span { color: #b9adff; }
.seyses-eyebrow { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .13em; color: #8177c9; }
.seyses-h1 { font-size: 2rem; line-height: 1.15; font-weight: 850; color: #211b3b; margin: .2rem 0 .4rem; }
.seyses-sub { color: #77728f; font-size: .94rem; }
.seyses-card { background: #fff; border: 1px solid #e8e6f2; border-radius: 18px; padding: 18px 20px; box-shadow: 0 5px 18px rgba(35,26,72,.035); }
.seyses-card-label { color:#77728f; font-size:.78rem; font-weight:700; margin-bottom:7px; }
.seyses-card-value { color:#211b3b; font-size:1.85rem; font-weight:850; line-height:1.1; }
.seyses-card-foot { color:#8c87a2; font-size:.76rem; margin-top:8px; }
.seyses-section { font-size:1.12rem; font-weight:800; color:#211b3b; margin: .5rem 0 .25rem; }
.seyses-panel { background:#fff; border:1px solid #e8e6f2; border-radius:18px; padding:18px 20px 12px; }
.seyses-chip { display:inline-block; background:#efedff; color:#5546c2; border-radius:999px; padding:5px 10px; font-size:.75rem; font-weight:750; }
div[data-testid="stForm"] { background:#fff; border:1px solid #e8e6f2; padding:1.25rem; border-radius:18px; }
.stButton > button[kind="primary"], .stFormSubmitButton > button[kind="primary"] { border-radius:10px; font-weight:750; border:0; }
div[data-testid="stDataFrame"] { border:1px solid #e8e6f2; border-radius:12px; overflow:hidden; }
hr { border-color:#e8e6f2; }
@media (max-width: 760px) { .seyses-h1 { font-size:1.55rem; } .seyses-card-value { font-size:1.4rem; } }
</style>
""", unsafe_allow_html=True)

if "seyses_user" not in st.session_state:
    st.session_state.seyses_user = None
if "seyses_client" not in st.session_state:
    st.session_state.seyses_client = None


def login_screen():
    _, center, _ = st.columns([1, 1.1, 1])
    with center:
        st.markdown("<div style='height:9vh'></div>", unsafe_allow_html=True)
        st.markdown("<div style='text-align:center;font-size:2.1rem;font-weight:900;letter-spacing:.18em;color:#302650'>SEYSES<span style='color:#7666e8'> ◈</span></div>", unsafe_allow_html=True)
        st.markdown("<p style='text-align:center;color:#77728f;margin-top:0'>CENTRO DE CONTROL INTEGRAL</p>", unsafe_allow_html=True)
        st.markdown("<div class='seyses-card'>", unsafe_allow_html=True)
        st.markdown("### Bienvenido")
        st.caption("Ingresa con tu cuenta corporativa autorizada.")
        with st.form("seyses_login", clear_on_submit=False):
            email = st.text_input("Correo electrónico", placeholder="nombre@empresa.cl")
            password = st.text_input("Contraseña", type="password")
            submit = st.form_submit_button("Ingresar de forma segura", type="primary", use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)
        if submit:
            if not email.strip() or not password:
                st.error("Completa el correo y la contraseña.")
            else:
                try:
                    from sesyes_supabase import sign_in
                    client, profile = sign_in(email.strip(), password)
                    st.session_state.seyses_client = client
                    st.session_state.seyses_user = profile
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))
        st.markdown("<p style='text-align:center;color:#8c87a2;font-size:.78rem'>Acceso protegido por Supabase Auth · Sin contraseñas predeterminadas</p>", unsafe_allow_html=True)


def safe_query(client, table, columns="*", limit=500, order_col=None, desc=False):
    try:
        q = client.table(table).select(columns).limit(limit)
        if order_col:
            q = q.order(order_col, desc=desc)
        result = q.execute()
        return pd.DataFrame(result.data or []), None
    except Exception as exc:
        # Do not surface SQL, tokens, or database internals to the user.
        return pd.DataFrame(), f"No fue posible consultar {table}. Revisa la conexión y los permisos del perfil."


def exact_count(client, table):
    try:
        return int(client.table(table).select("id", count="exact").limit(1).execute().count or 0)
    except Exception:
        return None


def metric_card(label, value, hint, icon):
    shown = "—" if value is None else f"{value:,}".replace(",", ".")
    st.markdown(
        f"<div class='seyses-card'><div class='seyses-card-label'>{icon} &nbsp; {label}</div>"
        f"<div class='seyses-card-value'>{shown}</div><div class='seyses-card-foot'>{hint}</div></div>",
        unsafe_allow_html=True,
    )


def empty_panel(message):
    st.markdown(f"<div class='seyses-panel'><span style='color:#77728f'>{message}</span></div>", unsafe_allow_html=True)


def style_chart(fig):
    fig.update_layout(
        template="plotly_white",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="Arial, sans-serif", color="#5e587a", size=12),
        margin=dict(l=10, r=10, t=24, b=10),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
        xaxis=dict(showgrid=False, linecolor="#e8e6f2"),
        yaxis=dict(showgrid=True, gridcolor="#efedf6", zeroline=False),
    )
    return fig


if not st.session_state.seyses_user:
    login_screen()
    st.stop()

user = st.session_state.seyses_user
client = st.session_state.seyses_client
role = user.get("role", "operator")
display_name = user.get("display_name") or user.get("email") or "Usuario"

with st.sidebar:
    st.markdown("<div class='seyses-brand'>SEYSES <span>◈</span></div>", unsafe_allow_html=True)
    st.caption("CENTRO DE CONTROL")
    st.divider()
    st.markdown(f"**{display_name}**")
    st.caption(f"Perfil autorizado: {role.upper()}")
    section = st.radio(
        "ESPACIOS DE TRABAJO",
        ["Resumen ejecutivo", "Importar y conciliar", "Trabajadores", "Procesos", "Diferencias", "Archivos", "Auditoría", "Administración"],
        label_visibility="visible",
    )
    st.divider()
    st.caption("Conectado a Supabase")
    if st.button("↪ Cerrar sesión", use_container_width=True):
        try:
            log_event(client, user, "logout", "Autenticación", "success")
            sign_out(client)
        finally:
            st.session_state.seyses_user = None
            st.session_state.seyses_client = None
            st.rerun()

top_left, top_right = st.columns([4, 1])
with top_left:
    st.markdown("<div class='seyses-eyebrow'>SEYSES / OPERACIONES</div>", unsafe_allow_html=True)
    page_titles = {
        "Resumen ejecutivo": ("Resumen ejecutivo", "Una vista clara de la operación, los procesos y las alertas."),
        "Importar y conciliar": ("Importación y conciliación", "Carga controlada de nómina y accesos con vista previa antes de guardar resultados."),
        "Trabajadores": ("Maestro de trabajadores", "Consulta y busca los registros disponibles en la base."),
        "Procesos": ("Control de procesos", "Seguimiento de ejecuciones, resultados y errores."),
        "Diferencias": ("Centro de diferencias", "Prioriza hallazgos y da seguimiento a su resolución."),
        "Archivos": ("Registro de archivos", "Trazabilidad de los archivos incorporados al sistema."),
        "Auditoría": ("Auditoría y trazabilidad", "Eventos de actividad disponibles para perfiles autorizados."),
        "Administración": ("Administración", "Información de acceso, roles y configuración."),
    }
    title, subtitle = page_titles[section]
    st.markdown(f"<div class='seyses-h1'>{title}</div><div class='seyses-sub'>{subtitle}</div>", unsafe_allow_html=True)
with top_right:
    st.markdown(f"<div style='text-align:right;color:#77728f;font-size:.8rem;padding-top:1.3rem'>{datetime.now().strftime('%d %b %Y')}<br><b>{datetime.now().strftime('%H:%M')}</b></div>", unsafe_allow_html=True)


if section == "Importar y conciliar":
    if role not in ("admin", "operator"):
        st.error("Tu perfil es de solo lectura. Solicita al administrador un perfil operador para cargar y conciliar archivos.")
    else:
        st.markdown("<div class='seyses-panel'><div class='seyses-section'>1. Cargar fuentes</div><p style='color:#77728f'>Selecciona los Excel de nómina y control de accesos. La aplicación valida columnas y duplicados antes de guardar.</p></div>", unsafe_allow_html=True)
        col_payroll, col_access = st.columns(2, gap="medium")
        with col_payroll:
            payroll_file = st.file_uploader("Nómina vigente (.xlsx)", type=["xlsx"], key="seyses_payroll_upload")
        with col_access:
            access_file = st.file_uploader("Control de accesos (.xlsx)", type=["xlsx"], key="seyses_access_upload")
        if st.button("Validar archivos y generar vista previa", type="primary", disabled=not (payroll_file and access_file), use_container_width=True):
            try:
                payroll_df, payroll_meta = read_spreadsheet(payroll_file)
                access_df, access_meta = read_spreadsheet(access_file)
                preview, payroll_info, access_info = reconcile_sources(payroll_df, access_df)
                st.session_state.seyses_reconciliation = {
                    "preview": preview,
                    "payroll_meta": payroll_meta,
                    "access_meta": access_meta,
                    "payroll_info": payroll_info,
                    "access_info": access_info,
                }
                st.success("Validación completada. Revisa la vista previa antes de confirmar.")
            except Exception as exc:
                st.session_state.seyses_reconciliation = None
                st.error(str(exc))
        state = st.session_state.get("seyses_reconciliation")
        if state:
            preview = state["preview"]
            payroll_info, access_info = state["payroll_info"], state["access_info"]
            st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Registros nómina", payroll_info["valid_unique_ruts"])
            m2.metric("Registros accesos", access_info["valid_unique_ruts"])
            m3.metric("Personas conciliadas", len(preview))
            m4.metric("Diferencias detectadas", int((preview["categoria"] != "").sum()))
            has_duplicates = bool(payroll_info["duplicate_ruts"] or access_info["duplicate_ruts"])
            if has_duplicates:
                st.warning("Se detectaron RUT duplicados. Se conservará la primera fila solo para la vista previa, pero no se permitirá guardar hasta corregir los duplicados en los archivos fuente.")
                with st.expander("Ver RUT duplicados"):
                    st.write({"Nómina": payroll_info["duplicate_ruts"], "Accesos": access_info["duplicate_ruts"]})
            if payroll_info["rows_without_rut"] or access_info["rows_without_rut"]:
                st.warning(f"Filas sin RUT válido descartadas: nómina {payroll_info['rows_without_rut']}, accesos {access_info['rows_without_rut']}.")
            st.markdown("<div class='seyses-panel'><div class='seyses-section'>2. Vista previa de conciliación</div></div>", unsafe_allow_html=True)
            status_filter = st.multiselect("Mostrar estados", sorted(preview["estado"].dropna().unique().tolist()), default=sorted(preview["estado"].dropna().unique().tolist()))
            visible = preview[preview["estado"].isin(status_filter)]
            st.dataframe(visible, use_container_width=True, hide_index=True)
            st.download_button("Descargar vista previa CSV", visible.to_csv(index=False).encode("utf-8-sig"), "seyses_vista_previa_conciliacion.csv", "text/csv")
            st.caption("Los archivos se procesan en memoria para la vista previa. La confirmación guarda los registros y metadatos de proceso; no se suben los archivos originales a Storage.")
            confirm_key = f"seyses_confirm_{state['payroll_meta']['sha256'][:8]}_{state['access_meta']['sha256'][:8]}"
            confirm = st.checkbox("Confirmo que revisé la vista previa y autorizo guardar los resultados en la base independiente de SEYSES.", key=confirm_key)
            if st.button("Confirmar y guardar en SEYSES", type="primary", disabled=(not confirm) or has_duplicates, use_container_width=True):
                process_id = None
                try:
                    existing = client.table("process_runs").select("id, status, created_at").contains("metadata", {
                        "payroll_sha256": state["payroll_meta"]["sha256"],
                        "access_sha256": state["access_meta"]["sha256"],
                    }).limit(1).execute()
                    if existing.data:
                        st.warning("Esta pareja de archivos ya figura en el historial. No se repetirá la carga automáticamente.")
                        st.stop()
                    run_result = client.table("process_runs").insert({
                        "created_by": user.get("user_id"),
                        "process_type": "conciliacion_nomina_accesos",
                        "status": "started",
                        "source_filename": f"{state['payroll_meta']['filename']} + {state['access_meta']['filename']}",
                        "records_read": int(state["payroll_meta"]["rows"] + state["access_meta"]["rows"]),
                        "metadata": {
                            "payroll_sha256": state["payroll_meta"]["sha256"],
                            "access_sha256": state["access_meta"]["sha256"],
                            "payroll_sheet": state["payroll_meta"]["sheet"],
                            "access_sheet": state["access_meta"]["sheet"],
                        },
                    }).execute()
                    if not run_result.data:
                        raise RuntimeError("No se pudo crear el registro de proceso.")
                    process_id = run_result.data[0]["id"]
                    workers = worker_payloads(preview, process_id)
                    if workers:
                        client.table("workers").upsert(workers, on_conflict="rut").execute()
                    differences = preview[preview["categoria"] != ""]
                    diff_payloads = [{
                        "process_run_id": process_id,
                        "rut": row["rut"],
                        "full_name": row["full_name"] or None,
                        "category": row["categoria"],
                        "severity": row["severidad"],
                        "description": row["descripcion"],
                        "status": "open",
                    } for _, row in differences.iterrows()]
                    if diff_payloads:
                        client.table("discrepancies").insert(diff_payloads).execute()
                    file_payloads = []
                    for meta, kind in [(state["payroll_meta"], "nomina"), (state["access_meta"], "accesos")]:
                        file_payloads.append({
                            "uploaded_by": user.get("user_id"),
                            "process_run_id": process_id,
                            "original_filename": meta["filename"],
                            "file_kind": kind,
                            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "file_size_bytes": meta["bytes"],
                            "checksum_sha256": meta["sha256"],
                            "status": "processed",
                            "metadata": {"sheet": meta["sheet"], "rows": meta["rows"]},
                        })
                    client.table("processed_files").insert(file_payloads).execute()
                    client.table("process_runs").update({
                        "status": "completed",
                        "records_processed": int(len(preview)),
                        "differences_found": int(len(diff_payloads)),
                    }).eq("id", process_id).execute()
                    log_event(client, user, "reconciliation_completed", "Importación y conciliación", "success", {
                        "process_id": process_id,
                        "records_processed": int(len(preview)),
                        "differences_found": int(len(diff_payloads)),
                    })
                    st.success(f"Conciliación guardada. Personas: {len(preview)} · Diferencias: {len(diff_payloads)}.")
                    st.session_state.seyses_reconciliation = None
                    st.rerun()
                except Exception:
                    if process_id:
                        try:
                            client.table("process_runs").update({
                                "status": "failed",
                                "error_summary": "Error durante el guardado; revisar registros y volver a validar antes de reintentar.",
                            }).eq("id", process_id).execute()
                        except Exception:
                            pass
                    log_event(client, user, "reconciliation_failed", "Importación y conciliación", "failure", {"process_id": process_id})
                    st.error("No se completó el guardado. El proceso quedó marcado como fallido si alcanzó a registrarse. Revisa los permisos y el historial antes de volver a intentar para evitar duplicar diferencias.")

elif section == "Resumen ejecutivo":
    if st.button("↻ Actualizar indicadores"):
        st.rerun()
    workers_count = exact_count(client, "workers")
    process_count = exact_count(client, "process_runs")
    discrepancies_count = exact_count(client, "discrepancies")
    files_count = exact_count(client, "processed_files")
    st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
    kpis = st.columns(4, gap="medium")
    with kpis[0]: metric_card("Trabajadores", workers_count, "Registros visibles", "♙")
    with kpis[1]: metric_card("Procesos", process_count, "Ejecuciones registradas", "↗")
    with kpis[2]: metric_card("Diferencias", discrepancies_count, "Hallazgos registrados", "◇")
    with kpis[3]: metric_card("Archivos", files_count, "Archivos trazados", "▤")

    st.markdown("<div style='height:18px'></div>", unsafe_allow_html=True)
    left, right = st.columns([1.25, 1], gap="medium")
    with left:
        st.markdown("<div class='seyses-panel'><div class='seyses-section'>Actividad de procesos</div><p style='color:#8c87a2;font-size:.82rem'>Evolución de los procesos registrados por fecha</p>", unsafe_allow_html=True)
        runs, err = safe_query(client, "process_runs", "id, created_at, process_type, status, records_processed, differences_found", 500, "created_at")
        if err:
            st.warning(err)
        elif runs.empty:
            empty_panel("Cuando se registren procesos, aquí aparecerá su evolución temporal.")
        else:
            runs["created_at"] = pd.to_datetime(runs["created_at"], errors="coerce", utc=True)
            runs = runs.dropna(subset=["created_at"])
            if not runs.empty:
                runs["Fecha"] = runs["created_at"].dt.strftime("%d-%m")
                trend = runs.groupby("Fecha", as_index=False).size().rename(columns={"size": "Procesos"})
                fig = px.line(trend, x="Fecha", y="Procesos", markers=True)
                fig.update_traces(line_color="#6c5ce7", line_width=3, marker_size=7)
                st.plotly_chart(style_chart(fig), use_container_width=True, config={"displayModeBar": False})
            else:
                empty_panel("No hay fechas válidas para construir el gráfico.")
        st.markdown("</div>", unsafe_allow_html=True)
    with right:
        st.markdown("<div class='seyses-panel'><div class='seyses-section'>Estado de las diferencias</div><p style='color:#8c87a2;font-size:.82rem'>Distribución según estado actual</p>", unsafe_allow_html=True)
        diffs, err = safe_query(client, "discrepancies", "id, status, severity, category, created_at", 1000)
        if err:
            st.warning(err)
        elif diffs.empty:
            empty_panel("Sin diferencias registradas. El gráfico aparecerá al procesar información.")
        else:
            by_status = diffs["status"].fillna("Sin estado").value_counts().rename_axis("Estado").reset_index(name="Cantidad")
            fig = px.pie(by_status, names="Estado", values="Cantidad", hole=.68)
            fig.update_traces(textposition="inside", textinfo="percent", marker=dict(colors=["#6c5ce7","#9b8af8","#f0b95c","#42b89b","#b9b5cc"]))
            st.plotly_chart(style_chart(fig), use_container_width=True, config={"displayModeBar": False})
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<div style='height:16px'></div>", unsafe_allow_html=True)
    left, right = st.columns([1, 1], gap="medium")
    with left:
        st.markdown("<div class='seyses-panel'><div class='seyses-section'>Últimos procesos</div>", unsafe_allow_html=True)
        recent, err = safe_query(client, "process_runs", "created_at, process_type, status, source_filename, records_processed, differences_found", 8, "created_at", True)
        if err: st.warning(err)
        elif recent.empty: empty_panel("Todavía no se han ejecutado procesos.")
        else: st.dataframe(recent, use_container_width=True, hide_index=True)
        st.markdown("</div>", unsafe_allow_html=True)
    with right:
        st.markdown("<div class='seyses-panel'><div class='seyses-section'>Atención prioritaria</div>", unsafe_allow_html=True)
        if not diffs.empty and "severity" in diffs.columns:
            critical = diffs[diffs["severity"].astype(str).str.lower().eq("critical")]
            open_diffs = diffs[diffs.get("status", pd.Series(index=diffs.index, dtype=str)).astype(str).str.lower().isin(["open", "in_review"])]
            a, b = st.columns(2)
            a.metric("Críticas", len(critical))
            b.metric("Pendientes", len(open_diffs))
            if not open_diffs.empty:
                st.dataframe(open_diffs[["category","severity","status","created_at"]].head(5), use_container_width=True, hide_index=True)
            else: st.success("No hay diferencias pendientes registradas.")
        elif err:
            st.warning(err)
        else:
            empty_panel("No hay hallazgos para priorizar.")
        st.markdown("</div>", unsafe_allow_html=True)

elif section == "Trabajadores":
    df, err = safe_query(client, "workers", "id, rut, full_name, afp, health_provider, branch, employment_status, payroll_status, access_status, seyses_status, created_at", 1000, "full_name")
    if err: st.error(err)
    elif df.empty: st.info("La base no tiene trabajadores cargados todavía.")
    else:
        q1, q2 = st.columns([2,1])
        search = q1.text_input("Buscar por nombre, RUT o sucursal")
        branches = ["Todas"] + sorted([str(x) for x in df["branch"].dropna().unique()]) if "branch" in df else ["Todas"]
        branch = q2.selectbox("Sucursal", branches)
        if search:
            mask = df.astype(str).apply(lambda c: c.str.contains(search, case=False, na=False)).any(axis=1)
            df = df[mask]
        if branch != "Todas" and "branch" in df: df = df[df["branch"].astype(str) == branch]
        st.caption(f"{len(df)} registro(s) en el resultado")
        st.dataframe(df.drop(columns=["id"], errors="ignore"), use_container_width=True, hide_index=True)
        st.download_button("Descargar resultado CSV", df.to_csv(index=False).encode("utf-8-sig"), "seyses_trabajadores.csv", "text/csv")

elif section == "Procesos":
    df, err = safe_query(client, "process_runs", "id, created_at, process_type, status, source_filename, records_read, records_processed, differences_found, error_summary", 1000, "created_at", True)
    if err: st.error(err)
    elif df.empty: st.info("Todavía no hay procesos registrados.")
    else:
        statuses = ["Todos"] + sorted(df["status"].dropna().astype(str).unique().tolist())
        chosen = st.selectbox("Filtrar por estado", statuses)
        if chosen != "Todos": df = df[df["status"].astype(str) == chosen]
        st.dataframe(df, use_container_width=True, hide_index=True)
        st.download_button("Exportar procesos CSV", df.to_csv(index=False).encode("utf-8-sig"), "seyses_procesos.csv", "text/csv")
        if "status" in df:
            st.plotly_chart(style_chart(px.bar(df["status"].value_counts().rename_axis("Estado").reset_index(name="Cantidad"), x="Estado", y="Cantidad", text_auto=True)), use_container_width=True, config={"displayModeBar":False})

elif section == "Diferencias":
    df, err = safe_query(client, "discrepancies", "id, created_at, rut, full_name, category, severity, description, status, resolution_notes", 1000, "created_at", True)
    if err: st.error(err)
    elif df.empty: st.info("No hay diferencias registradas.")
    else:
        c1, c2 = st.columns(2)
        status_opts = ["Todos"] + sorted(df["status"].dropna().astype(str).unique().tolist())
        sev_opts = ["Todas"] + sorted(df["severity"].dropna().astype(str).unique().tolist())
        status_filter = c1.selectbox("Estado", status_opts)
        severity_filter = c2.selectbox("Severidad", sev_opts)
        if status_filter != "Todos": df = df[df["status"].astype(str) == status_filter]
        if severity_filter != "Todas": df = df[df["severity"].astype(str) == severity_filter]
        st.dataframe(df.drop(columns=["id"], errors="ignore"), use_container_width=True, hide_index=True)
        st.download_button("Exportar diferencias CSV", df.to_csv(index=False).encode("utf-8-sig"), "seyses_diferencias.csv", "text/csv")

elif section == "Archivos":
    df, err = safe_query(client, "processed_files", "id, created_at, original_filename, file_kind, content_type, file_size_bytes, status, process_run_id", 1000, "created_at", True)
    if err: st.error(err)
    elif df.empty: st.info("Todavía no hay archivos registrados.")
    else:
        st.dataframe(df.drop(columns=["id"], errors="ignore"), use_container_width=True, hide_index=True)
        st.download_button("Exportar listado CSV", df.to_csv(index=False).encode("utf-8-sig"), "seyses_archivos.csv", "text/csv")
        st.caption("Este listado registra metadatos. La carga y descarga de archivos privados requiere integrar y probar Supabase Storage.")

elif section == "Auditoría":
    if role not in ("admin", "auditor"):
        st.error("Tu perfil no tiene autorización para ver el registro de auditoría.")
    else:
        try:
            logs = pd.DataFrame(get_audit_logs(client, 500))
            if logs.empty: st.info("Aún no hay eventos de auditoría.")
            else:
                c1, c2 = st.columns(2)
                action_filter = c1.text_input("Filtrar acción")
                module_filter = c2.text_input("Filtrar módulo")
                if action_filter and "action" in logs: logs = logs[logs["action"].astype(str).str.contains(action_filter, case=False, na=False)]
                if module_filter and "module" in logs: logs = logs[logs["module"].astype(str).str.contains(module_filter, case=False, na=False)]
                st.dataframe(logs, use_container_width=True, hide_index=True)
                st.download_button("Exportar auditoría CSV", logs.to_csv(index=False).encode("utf-8-sig"), "seyses_auditoria.csv", "text/csv")
        except Exception:
            st.error("No fue posible consultar la auditoría. Revisa las políticas de acceso de Supabase.")

elif section == "Administración":
    st.markdown("<div class='seyses-panel'><div class='seyses-section'>Tu sesión</div>", unsafe_allow_html=True)
    st.write(f"**Nombre:** {display_name}")
    st.write(f"**Correo:** {user.get('email', 'No informado')}")
    st.write(f"**Rol:** {role}")
    st.write(f"**Identificador:** {user.get('user_id', 'No informado')}")
    st.markdown("</div>", unsafe_allow_html=True)
    if role == "admin":
        st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)
        st.markdown("<div class='seyses-panel'><div class='seyses-section'>Gestión de cuentas</div><p>Las cuentas se crean en Supabase Authentication y luego se vinculan a <code>public.user_profiles</code> con el mismo UUID.</p></div>", unsafe_allow_html=True)
        st.link_button("Abrir usuarios de Supabase", "https://supabase.com/dashboard/project/isddbsunqyksqisoqjmd/auth/users")
    else:
        st.info("La administración de cuentas está reservada al rol admin.")

st.markdown("<div style='height:20px'></div><hr>", unsafe_allow_html=True)
st.markdown("<div style='display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#8c87a2;font-size:.76rem'><span>SEYSES · Centro de control integral</span><span>Datos sujetos a permisos de Supabase · No usar como sistema productivo hasta completar pruebas</span></div>", unsafe_allow_html=True)
