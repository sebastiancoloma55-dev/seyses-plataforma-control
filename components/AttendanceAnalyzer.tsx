"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { getSupabase } from "@/lib/supabase";

type RawRow = Record<string, unknown>;
type FieldKey =
  | "worker_rut" | "worker_id" | "worker_name" | "branch" | "job_title" | "supervisor" | "contract_hours_weekly" | "on_payroll" | "permission_note" | "work_date"
  | "shift_name" | "scheduled_duration" | "scheduled_start" | "scheduled_end" | "actual_start"
  | "actual_end" | "worked_duration" | "overtime_duration" | "overtime_duration_secondary" | "break_duration" | "attendance_status";
type AttendanceRow = {
  source_row: number;
  worker_key: string;
  worker_rut: string;
  worker_name: string;
  branch: string;
  job_title: string;
  supervisor: string;
  contract_hours_weekly: number;
  on_payroll: string;
  permission_note: string;
  work_date: string;
  shift_name: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string;
  actual_end: string;
  scheduled_minutes: number;
  worked_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  attendance_status: string;
};
type ImportInfo = { id: string; original_filename: string; erp_name: string; period_start: string; period_end: string; rows_total: number; rows_valid: number; rows_rejected: number; status: string; created_at: string };
type WorkerSummary = {key:string;rut:string;name:string;branch:string;days:Set<string>;rows:number;assigned:Set<string>;scheduled:number;worked:number;overtime:number;late:number};
function aggregateAttendance(rows: AttendanceRow[]): WorkerSummary[] {
  const map = new Map<string,WorkerSummary>();
  for (const r of rows) {
    const key = r.worker_key;
    if (!map.has(key)) map.set(key,{key,rut:r.worker_rut,name:r.worker_name,branch:r.branch,days:new Set(),rows:0,assigned:new Set(),scheduled:0,worked:0,overtime:0,late:0});
    const g = map.get(key)!; g.days.add(r.work_date); g.rows++;
    if (r.shift_name) g.assigned.add(r.shift_name); else if (r.scheduled_start || r.scheduled_end) g.assigned.add(`${r.scheduled_start.slice(0,5) || "?"}–${r.scheduled_end.slice(0,5) || "?"}`);
    g.scheduled += Number(r.scheduled_minutes)||0; g.worked += Number(r.worked_minutes)||0; g.overtime += Number(r.overtime_minutes)||0; g.late += Number(r.late_minutes)||0;
    if (!g.branch && r.branch) g.branch = r.branch;
  }
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"es"));
}
const FIELDS: { key: FieldKey; label: string; required?: boolean; aliases: string[] }[] = [
  { key: "worker_rut", label: "RUT / DNI / documento", aliases: ["rut","run","dni","documento","cedula","identificacion","identificación","numero documento","número documento"] },
  { key: "worker_id", label: "ID / código trabajador", aliases: ["employee id","id empleado","codigo empleado","código empleado","legajo","matricula","matrícula","numero empleado","numero trabajador","worker id"] },
  { key: "worker_name", label: "Nombre trabajador", aliases: ["nombre","trabajador","nombre completo","full name","employee name","colaborador","empleado","worker name","nombre empleado"] },
  { key: "branch", label: "Sucursal / sede", aliases: ["sucursal","local","tienda","branch","site","location","centro costo","centro de costo","departamento","department"] },
  { key: "job_title", label: "Cargo", aliases: ["cargo","puesto","job title","position","rol laboral"] },
  { key: "supervisor", label: "Jefe / supervisor", aliases: ["jefe","supervisor","manager","responsable directo"] },
  { key: "contract_hours_weekly", label: "Horas contrato semanal", aliases: ["horas contrato nomina","horas contrato nomina","horas contrato semanal","weekly contract hours","contract hours"] },
  { key: "on_payroll", label: "En nómina", aliases: ["en nomina","en nómina","in payroll","payroll status"] },
  { key: "permission_note", label: "Permiso / justificación", aliases: ["permiso","justificacion","justificación","leave note","permission"] },
  { key: "work_date", label: "Fecha del registro", required: true, aliases: ["fecha","fecha asistencia","date","dia","día","fecha turno","fecha marcacion","fecha marcación","work date"] },
  { key: "shift_name", label: "Turno asignado", aliases: ["turno","shift","turno asignado","jornada","codigo turno","código turno","shift name","assigned shift"] },
  { key: "scheduled_duration", label: "Horas asignadas (total diario)", aliases: ["horas asign","horas asignadas","assigned hours","planned hours","scheduled hours","planned duration"] },
  { key: "scheduled_start", label: "Inicio turno planificado", aliases: ["entrada turno","entrada planificada","hora inicio turno","inicio turno","scheduled start","shift start","entrada programada","hora entrada programada","inicio programado"] },
  { key: "scheduled_end", label: "Fin turno planificado", aliases: ["salida turno","salida programada","hora salida turno","fin turno","scheduled end","shift end","fin programado"] },
  { key: "actual_start", label: "Primera entrada real", aliases: ["entrada","marcacion entrada","marcación entrada","check in","punch in","hora ingreso","hora entrada real","first in","actual start","entrada real"] },
  { key: "actual_end", label: "Última salida real", aliases: ["salida","marcacion salida","marcación salida","check out","punch out","hora salida","ultima salida","última salida","last out","actual end","salida real"] },
  { key: "worked_duration", label: "Horas trabajadas (si vienen totalizadas)", aliases: ["horas trabajadas","horas asis","horas asistencia","horas asistidas","horas totales","total horas","worked hours","horas ordinarias","duration","total hrs","horas efectivas","worked duration","total trabajado"] },
  { key: "overtime_duration", label: "Horas extra (primera columna)", aliases: ["horas extra","hora extra","overtime","overtime hours","hhee","he 50","he 100","extra hours"] },
  { key: "overtime_duration_secondary", label: "Horas extra (segunda columna, opcional)", aliases: ["horas extra 50","horas extra 30","overtime 2","second overtime","he 50 segundo"] },
  { key: "break_duration", label: "Colación / descanso", aliases: ["colacion","colación","descanso","break","break minutes","minutos colacion","duracion descanso","duración descanso"] },
  { key: "attendance_status", label: "Estado / incidencia", aliases: ["estado","asistencia","status","incidencia","ausentismo","novedad","observacion","observación"] }
];
const ERP_OPTIONS = ["ERP genérico / mapeo automático","Talana","Buk","GeoVictoria","Rankmi","Rex+","Control iD / ZKTeco","SAP SuccessFactors","UKG / Kronos","Workday","ADP","Oracle HCM","Cegid / Meta4","Sesame HR","Softland","Otro"];

function norm(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function text(v: unknown): string { return v === null || v === undefined ? "" : String(v).trim(); }
function findHeader(headers: string[], aliases: string[]): string {
  const target = aliases.map(norm);
  return headers.find(h => target.includes(norm(h))) || headers.find(h => target.some(a => norm(h).includes(a))) || "";
}
function parseDate(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 90000) {
    const d = new Date(Date.UTC(1899,11,30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0,10);
  }
  const s = text(v);
  if (!s) return "";
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10);
}
function parseTimeMinutes(v: unknown): number | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.getHours()*60 + v.getMinutes();
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v >= 0 && v < 1) return Math.round(v * 1440);
    if (v >= 0 && v < 24) return Math.round(v * 60);
  }
  const s = text(v).toLowerCase();
  if (!s) return null;
  const m = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) return Number(m[1])*60 + Number(m[2]);
  const decimal = s.replace(",",".").match(/^(\d+(?:\.\d+)?)\s*(?:h|hrs?|horas?)?$/);
  if (decimal) {
    const n = Number(decimal[1]);
    return n >= 0 && n <= 24 ? Math.round(n*60) : null;
  }
  return null;
}
function parseDuration(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v >= 0 && v < 1) return Math.round(v*1440);
    return v >= 0 ? Math.round(v*60) : null;
  }
  const s = text(v).toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,4}):(\d{1,2})(?::\d{1,2})?$/);
  if (m) return Number(m[1])*60 + Number(m[2]);
  const cleaned = s.replace(",",".").replace(/\s*(h|hrs?|horas?)\s*/g,"").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n*60) : null;
}
function durationBetween(start: unknown, end: unknown): number {
  const a = parseTimeMinutes(start), b = parseTimeMinutes(end);
  if (a === null || b === null) return 0;
  return b >= a ? b-a : 1440-a+b;
}
function asTime(v: unknown): string {
  const m = parseTimeMinutes(v);
  if (m === null) return "";
  const clamped = m % 1440;
  return `${String(Math.floor(clamped/60)).padStart(2,"0")}:${String(clamped%60).padStart(2,"0")}:00`;
}
function fmtMinutes(v: number): string {
  const n = Math.max(0, Math.round(v));
  return `${Math.floor(n/60)} h ${String(n%60).padStart(2,"0")} min`;
}
function downloadCsv(rows: Record<string, string | number>[], filename: string) {
  const fields = Object.keys(rows[0] || {});
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const csv = "\uFEFF" + [fields.map(escape).join(";"), ...rows.map(r => fields.map(k => escape(r[k])).join(";"))].join("\r\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function currentMonthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
function currentMonthEnd() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(new Date(d.getFullYear(),d.getMonth()+1,0).getDate()).padStart(2,"0")}`; }

export default function AttendanceAnalyzer({ userId }: { userId: string }) {
  const [file, setFile] = useState<File|null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey,string>>>({});
  const [erp, setErp] = useState(ERP_OPTIONS[0]);
  const [customErp, setCustomErp] = useState("");
  const [periodStart, setPeriodStart] = useState(currentMonthStart);
  const [periodEnd, setPeriodEnd] = useState(currentMonthEnd);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [imports, setImports] = useState<ImportInfo[]>([]);
  const [savedRows, setSavedRows] = useState<AttendanceRow[]>([]);
  const [savedImport, setSavedImport] = useState<ImportInfo|null>(null);
  const [loadingSaved, setLoadingSaved] = useState(false);

  async function loadImports() {
    try {
      const {data,error:err} = await getSupabase().from("attendance_imports")
        .select("id,original_filename,erp_name,period_start,period_end,rows_total,rows_valid,rows_rejected,status,created_at")
        .order("created_at",{ascending:false}).limit(20);
      if (err) throw err;
      setImports((data ?? []) as ImportInfo[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar el historial de importaciones.");
    }
  }
  useEffect(() => { void loadImports(); }, []);

  async function viewSavedImport(item: ImportInfo) {
    setError(""); setNotice(""); setLoadingSaved(true);
    try {
      const {data,error:queryError} = await getSupabase().from("attendance_records")
        .select("source_row,worker_key,worker_rut,worker_name,branch,job_title,supervisor,contract_hours_weekly,on_payroll,permission_note,work_date,shift_name,scheduled_start,scheduled_end,actual_start,actual_end,scheduled_minutes,worked_minutes,overtime_minutes,late_minutes,attendance_status")
        .eq("import_id",item.id).order("work_date",{ascending:true}).limit(10000);
      if (queryError) throw queryError;
      setSavedRows((data ?? []) as unknown as AttendanceRow[]);
      setSavedImport(item);
      if (!data?.length) setNotice("Este reporte no tiene filas disponibles para mostrar.");
    } catch(e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar el detalle del reporte importado.");
    } finally { setLoadingSaved(false); }
  }

  function exportSavedSummary() {
    downloadCsv(savedGrouped.map(g=>({
      RUT:g.rut, trabajador:g.name, sucursal:g.branch, dias_con_registro:g.days.size, filas:g.rows,
      turnos_asignados:[...g.assigned].join(" | "), horas_programadas:fmtMinutes(g.scheduled),
      horas_trabajadas:fmtMinutes(g.worked), diferencia_minutos:g.worked-g.scheduled,
      horas_extra:fmtMinutes(g.overtime), atraso:fmtMinutes(g.late)
    })),`resumen_guardado_${savedImport?.period_start}_${savedImport?.period_end}.csv`);
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError(""); setNotice(""); setFile(selected); setHeaders([]); setRawRows([]); setMapping({});
    if (!selected) return;
    if (selected.size > 15*1024*1024) { setError("El archivo supera 15 MB. El máximo permitido es 15 MB."); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(selected.name)) { setError("Formato no compatible todavía. Usa Excel (.xlsx/.xls) o CSV (.csv); PDF y conectores ERP nativos requieren adaptadores separados."); return; }
    try {
      const bytes = await selected.arrayBuffer();
      const book = XLSX.read(bytes,{type:"array",cellDates:true});
      if (!book.SheetNames.length) throw new Error("El archivo no contiene hojas.");
      let cols: string[] = [];
      let objects: RawRow[] = [];
      let detailSheets: string[] = [];
      if (/\.csv$/i.test(selected.name)) {
        const parsed = XLSX.utils.sheet_to_json<RawRow>(book.Sheets[book.SheetNames[0]],{defval:"",raw:false,blankrows:false});
        if (!parsed.length) throw new Error("El CSV no contiene filas de datos.");
        cols = Object.keys(parsed[0]).map(String); objects = parsed;
        detailSheets = [book.SheetNames[0]];
      } else {
        const candidateSheets = book.SheetNames.map(sheetName => {
          const parsed = XLSX.utils.sheet_to_json<RawRow>(book.Sheets[sheetName],{defval:"",raw:false,blankrows:false});
          const candidateCols = parsed.length ? Object.keys(parsed[0]).map(String) : [];
          const dateColumn = findHeader(candidateCols,FIELDS.find(f=>f.key==="work_date")!.aliases);
          const personColumn = findHeader(candidateCols,[...FIELDS.find(f=>f.key==="worker_name")!.aliases,...FIELDS.find(f=>f.key==="worker_rut")!.aliases,...FIELDS.find(f=>f.key==="worker_id")!.aliases]);
          const hoursColumn = findHeader(candidateCols,[...FIELDS.find(f=>f.key==="worked_duration")!.aliases,...FIELDS.find(f=>f.key==="actual_start")!.aliases]);
          return {sheetName,parsed,candidateCols,valid: Boolean(dateColumn && personColumn && hoursColumn)};
        }).filter(s=>s.valid);
        if (candidateSheets.length) {
          const reference = candidateSheets[0].candidateCols;
          const referenceSignature = reference.map(norm).sort().join("|");
          const compatible = candidateSheets.filter(s=>s.candidateCols.map(norm).sort().join("|")===referenceSignature);
          detailSheets = compatible.map(s=>s.sheetName);
          cols = reference;
          objects = compatible.flatMap(s=>s.parsed);
        } else {
          const first = book.SheetNames[0];
          objects = XLSX.utils.sheet_to_json<RawRow>(book.Sheets[first],{defval:"",raw:false,blankrows:false});
          if (!objects.length) throw new Error("No se encontró una hoja con filas de datos.");
          cols = Object.keys(objects[0]).map(String);
          detailSheets = [first];
        }
      }
      if (!objects.length || !cols.length) throw new Error("No se detectaron encabezados y filas de asistencia.");
      if (objects.length > 150000) throw new Error("El reporte supera 150.000 filas. Divide el archivo por año o períodos más pequeños.");
      setHeaders(cols); setRawRows(objects);
      const next: Partial<Record<FieldKey,string>> = {};
      for (const field of FIELDS) {
        const found = findHeader(cols,field.aliases);
        if (found) next[field.key] = found;
      }
      setMapping(next);
      if (next.work_date) {
        const dates = objects.map(row=>parseDate(row[next.work_date!])).filter(Boolean).sort();
        if (dates.length) {
          setPeriodStart(dates[0]);
          setPeriodEnd(dates[dates.length-1]);
        }
      }
      setNotice(`Archivo leído: ${objects.length.toLocaleString("es-CL")} filas · ${detailSheets.length} hoja(s) de detalle: ${detailSheets.slice(0,4).join(", ")}${detailSheets.length>4?"…":""}. Se ignoraron hojas de resumen que no tienen registros diarios compatibles. Revisa el mapeo antes de guardar.`);
    } catch(e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  }
  function choose(field: FieldKey, value: string) {
    setMapping(prev => ({...prev,[field]:value || undefined}));
  }

  const mapped = useMemo(() => rawRows.flatMap((row,index) => {
    const value = (field: FieldKey) => mapping[field] ? row[mapping[field]!] : "";
    const rut = text(value("worker_rut"));
    const employeeId = text(value("worker_id"));
    const name = text(value("worker_name"));
    const date = parseDate(value("work_date"));
    if (!date || (!rut && !employeeId && !name) || date < periodStart || date > periodEnd) return [];
    const plannedStart = asTime(value("scheduled_start"));
    const plannedEnd = asTime(value("scheduled_end"));
    const actualStart = asTime(value("actual_start"));
    const actualEnd = asTime(value("actual_end"));
    const breakMins = mapping.break_duration ? (parseDuration(value("break_duration")) ?? parseTimeMinutes(value("break_duration")) ?? 0) : 0;
    const rawScheduled = mapping.scheduled_duration ? parseDuration(value("scheduled_duration")) : null;
    const scheduled = rawScheduled !== null ? rawScheduled : (plannedStart && plannedEnd ? Math.max(0,durationBetween(plannedStart,plannedEnd)-breakMins) : 0);
    const rawWorked = mapping.worked_duration ? parseDuration(value("worked_duration")) : null;
    const worked = rawWorked !== null ? rawWorked : (actualStart && actualEnd ? Math.max(0,durationBetween(actualStart,actualEnd)-breakMins) : 0);
    const overtimePrimary = mapping.overtime_duration ? (parseDuration(value("overtime_duration")) ?? 0) : 0;
    const overtimeSecondary = mapping.overtime_duration_secondary ? (parseDuration(value("overtime_duration_secondary")) ?? 0) : 0;
    const rawOvertime = mapping.overtime_duration || mapping.overtime_duration_secondary ? overtimePrimary + overtimeSecondary : null;
    const contractHoursRaw = mapping.contract_hours_weekly ? Number(text(value("contract_hours_weekly")).replace(",", ".")) : 0;
    const contractHours = Number.isFinite(contractHoursRaw) ? contractHoursRaw : 0;
    const startDelta = plannedStart && actualStart ? (parseTimeMinutes(actualStart) ?? 0)-(parseTimeMinutes(plannedStart) ?? 0) : 0;
    const normalizedLate = startDelta < -720 ? startDelta + 1440 : startDelta > 720 ? startDelta - 1440 : startDelta;
    const late = plannedStart && actualStart ? Math.max(0,normalizedLate) : 0;
    const workerKey = rut || employeeId || name;
    return [{
      source_row:index+2,
      worker_key:workerKey,
      worker_rut:rut,
      worker_name:name || workerKey,
      branch:text(value("branch")),
      job_title:text(value("job_title")),
      supervisor:text(value("supervisor")),
      contract_hours_weekly:contractHours,
      on_payroll:text(value("on_payroll")),
      permission_note:text(value("permission_note")),
      work_date:date,
      shift_name:text(value("shift_name")),
      scheduled_start:plannedStart,
      scheduled_end:plannedEnd,
      actual_start:actualStart,
      actual_end:actualEnd,
      scheduled_minutes:scheduled,
      worked_minutes:Math.max(0,worked),
      overtime_minutes:Math.max(0,rawOvertime ?? (scheduled > 0 ? Math.max(0,worked-scheduled) : 0)),
      late_minutes:late,
      attendance_status:text(value("attendance_status"))
    } satisfies AttendanceRow];
  }),[rawRows,mapping,periodStart,periodEnd]);

  const invalidRows = rawRows.length - mapped.length;
  const grouped = useMemo(() => aggregateAttendance(mapped),[mapped]);
  const savedGrouped = useMemo(() => aggregateAttendance(savedRows),[savedRows]);

  async function save() {
    setError(""); setNotice("");
    if (!file) { setError("Primero selecciona un archivo."); return; }
    if (!periodStart || !periodEnd || periodEnd < periodStart) { setError("Revisa el período: la fecha final debe ser igual o posterior a la inicial."); return; }
    if (!mapping.work_date || !mapping.worker_name && !mapping.worker_rut && !mapping.worker_id) {
      setError("Debes mapear la fecha y al menos una identificación de trabajador (nombre, RUT/DNI o ID)."); return;
    }
    if (!mapped.length) { setError("No hay filas válidas dentro del período seleccionado. Revisa las columnas o las fechas."); return; }
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256",bytes);
      const hash = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
      const erpName = erp === "Otro" ? (customErp.trim() || "ERP genérico") : erp;
      const payload = {
        original_filename:file.name,
        erp_name:erpName,
        period_start:periodStart,
        period_end:periodEnd,
        file_sha256:hash,
        file_size_bytes:file.size,
        format:file.name.split(".").pop()?.toLowerCase(),
        rows_total:rawRows.length,
        rows_valid:mapped.length,
        rows_rejected:invalidRows,
        metadata:{ format:file.name.split(".").pop()?.toLowerCase(), mapping, columns:headers, imported_by:userId, filtered_to_period:true, chunk_size:2000 }
      };
      let importId: string | null = null;
      let lastResult: {id?:string;duplicate?:boolean;records_saved?:number;records_total?:number;resumed?:boolean;status?:string}|null = null;
      const batchSize = 2000;
      const batches = Math.ceil(mapped.length / batchSize);
      for (let batch=0; batch<batches; batch++) {
        const start = batch*batchSize;
        const records = mapped.slice(start,start+batchSize);
        const {data,error:rpcError} = await getSupabase().rpc("seyses_save_attendance_report_batch",{
          p_import:payload,
          p_records:records,
          p_replace_existing:replaceExisting && batch===0,
          p_import_id:importId,
          p_final:batch===batches-1
        });
        if (rpcError) throw new Error(`Lote ${batch+1}/${batches}: ${rpcError.message}`);
        const result = data as {id?:string;duplicate?:boolean;records_saved?:number;records_total?:number;resumed?:boolean;status?:string};
        lastResult=result;
        if (result?.duplicate) {
          setNotice(`Este archivo ya estaba cargado; no se duplicaron registros (${result.records_total ?? result.records_saved ?? 0} filas, reporte ${result.id ?? ""}).`);
          await loadImports();
          return;
        }
        if (result?.id) importId=result.id;
        setNotice(`Importando lote ${batch+1} de ${batches} · ${Math.min(start+records.length,mapped.length).toLocaleString("es-CL")} de ${mapped.length.toLocaleString("es-CL")} filas…`);
      }
      setNotice(lastResult?.resumed
        ? `Importación reanudada y finalizada: ${lastResult.records_total ?? mapped.length} filas · ${grouped.length} trabajadores · ${erpName} · ${periodStart} al ${periodEnd}.`
        : `Importación guardada correctamente: ${lastResult?.records_total ?? mapped.length} filas · ${grouped.length} trabajadores · ${erpName} · ${periodStart} al ${periodEnd}.`);
      await loadImports();
    } catch(e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el reporte. Verifica permisos de importación y vuelve a intentarlo.");
    } finally { setBusy(false); }
  }

  function exportSummary() {
    downloadCsv(grouped.map(g=>({
      RUT:g.rut, trabajador:g.name, sucursal:g.branch, dias_con_registro:g.days.size, filas:g.rows,
      turnos_asignados:[...g.assigned].join(" | "), horas_programadas:fmtMinutes(g.scheduled),
      horas_trabajadas:fmtMinutes(g.worked), diferencia_minutos:g.worked-g.scheduled,
      horas_extra:fmtMinutes(g.overtime), atraso:fmtMinutes(g.late)
    })),`resumen_asistencia_${periodStart}_${periodEnd}.csv`);
  }

  return <div className="attendance-module">
    <section className="panel">
      <div className="section-head"><h2>1. Cargar reporte de cualquier ERP</h2><span className="status">Excel / CSV</span></div>
      <p className="muted">Sube un archivo de asistencia exportado desde tu ERP o reloj biométrico. El analizador reconoce encabezados habituales y permite mapearlos manualmente; los conectores nativos específicos se incorporan por adaptador.</p>
      <div className="attendance-grid">
        <div className="field"><label htmlFor="attendance-erp">Sistema de origen</label><select id="attendance-erp" value={erp} onChange={e=>setErp(e.target.value)}>{ERP_OPTIONS.map(o=><option key={o}>{o}</option>)}</select></div>
        {erp==="Otro" && <div className="field"><label htmlFor="attendance-erp-custom">Nombre de ERP</label><input id="attendance-erp-custom" value={customErp} onChange={e=>setCustomErp(e.target.value)} placeholder="Nombre del sistema" /></div>}
        <div className="field"><label htmlFor="attendance-file">Reporte de asistencia</label><input id="attendance-file" type="file" accept=".xlsx,.xls,.csv" onChange={selectFile} /></div>
        <div className="field"><label htmlFor="attendance-start">Período desde</label><input id="attendance-start" type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)} required /></div>
        <div className="field"><label htmlFor="attendance-end">Período hasta</label><input id="attendance-end" type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)} required /></div>
      </div>
      {file && <div className="notice">{file.name} · {(file.size/1024).toFixed(1)} KB · ${rawRows.length.toLocaleString("es-CL")} filas leídas · Dentro del período: ${mapped.length.toLocaleString("es-CL")} · Excluidas/sin identificación/fecha válida: ${invalidRows.toLocaleString("es-CL")}</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {notice && <div className="notice success" role="status">{notice}</div>}
    </section>

    {headers.length>0 && <section className="panel">
      <div className="section-head"><h2>2. Confirmar equivalencias de columnas</h2><span className="muted">${headers.length} columnas detectadas</span></div>
      <p className="muted">El formato de cada ERP cambia. Confirma las asignaciones antes del cálculo para que las horas y los turnos no se atribuyan a una columna equivocada.</p>
      <div className="attendance-grid mappings">{FIELDS.map(field=><div className="field" key={field.key}><label htmlFor={`map-${field.key}`}>{field.label}{field.required?" *":""}</label><select id={`map-${field.key}`} value={mapping[field.key]??""} onChange={e=>choose(field.key,e.target.value)}><option value="">— No utilizar —</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></div>)}</div>
      <label className="attendance-check"><input type="checkbox" checked={replaceExisting} onChange={e=>setReplaceExisting(e.target.checked)} /> Reemplazar importaciones anteriores del mismo ERP y período exacto (elimina sus registros previos).</label>
      <div className="actions"><button className="btn primary" onClick={save} disabled={busy||mapped.length===0}>{busy?"Guardando en Supabase…":"Confirmar e importar reporte"}</button><button className="btn" onClick={exportSummary} disabled={!mapped.length}>Exportar resumen CSV</button></div>
    </section>}

    {mapped.length>0 && <section className="panel">
      <div className="section-head"><h2>3. Resumen por trabajador</h2><span className="status">${grouped.length} trabajadores</span></div>
      <div className="grid attendance-kpis">
        <Metric label="Horas trabajadas" value={fmtMinutes(mapped.reduce((s,r)=>s+r.worked_minutes,0))} foot="Total de filas del período"/>
        <Metric label="Horas programadas" value={fmtMinutes(mapped.reduce((s,r)=>s+r.scheduled_minutes,0))} foot="A partir del turno asignado"/>
        <Metric label="Horas extra" value={fmtMinutes(mapped.reduce((s,r)=>s+r.overtime_minutes,0))} foot="Columna del ERP o excedente calculado"/>
        <Metric label="Atrasos" value={fmtMinutes(mapped.reduce((s,r)=>s+r.late_minutes,0))} foot="Comparación planificado vs real"/>
      </div>
      <div className="table-wrap"><table><thead><tr><th>RUT / ID</th><th>Trabajador</th><th>Sucursal</th><th>Días con registro</th><th>Turnos asignados</th><th>Programadas</th><th>Trabajadas</th><th>Diferencia</th><th>H. extra</th><th>Atraso</th></tr></thead><tbody>{grouped.map(g=><tr key={g.key}><td>{g.rut||g.key}</td><td>{g.name}</td><td>{g.branch||"—"}</td><td>{g.days.size}</td><td>{[...g.assigned].join(", ")||"—"}</td><td>{fmtMinutes(g.scheduled)}</td><td>{fmtMinutes(g.worked)}</td><td>{fmtMinutes(Math.abs(g.worked-g.scheduled))}{g.worked<g.scheduled?" bajo programación":g.worked>g.scheduled?" sobre programación":""}</td><td>{fmtMinutes(g.overtime)}</td><td>{fmtMinutes(g.late)}</td></tr>)}</tbody></table></div>
      <p className="muted attendance-footnote">Las horas se calculan por registro y luego se totalizan por trabajador para el período seleccionado. Una fila representa un evento/turno reportado por el ERP; no se inventan turnos faltantes. Revisa el mapeo antes de guardar.</p>
    </section>}

    <section className="panel">
      <div className="section-head"><h2>Historial de reportes importados</h2><button className="btn" onClick={()=>void loadImports()}>Actualizar</button></div>
      {imports.length===0?<div className="empty"><strong>Sin reportes importados todavía</strong>Los reportes solo aparecen aquí después de confirmar la importación.</div>:<div className="table-wrap"><table><thead><tr><th>Fecha de carga</th><th>Archivo</th><th>ERP</th><th>Período revisado</th><th>Filas válidas</th><th>Observaciones</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{imports.map(i=><tr key={i.id}><td>{new Date(i.created_at).toLocaleString("es-CL")}</td><td>{i.original_filename}</td><td>{i.erp_name}</td><td>{i.period_start} al {i.period_end}</td><td>{i.rows_valid}</td><td>{i.rows_rejected}</td><td>{i.status}</td><td><button className="btn" onClick={()=>void viewSavedImport(i)} disabled={loadingSaved}>{loadingSaved?"Cargando…":"Ver trabajadores"}</button></td></tr>)}</tbody></table></div>}
    </section>
    {savedImport && <section className="panel">
      <div className="section-head"><div><h2>Detalle individual guardado</h2><p className="muted">{savedImport.original_filename} · {savedImport.erp_name} · {savedImport.period_start} al {savedImport.period_end}</p></div><div className="actions"><button className="btn" onClick={exportSavedSummary} disabled={!savedGrouped.length}>Exportar resumen</button><button className="btn" onClick={()=>{setSavedImport(null);setSavedRows([]);}}>Cerrar detalle</button></div></div>
      <div className="grid attendance-kpis">
        <Metric label="Trabajadores" value={String(savedGrouped.length)} foot="Con registros dentro del período"/>
        <Metric label="Horas trabajadas" value={fmtMinutes(savedRows.reduce((s,r)=>s+(Number(r.worked_minutes)||0),0))} foot="Suma de registros guardados"/>
        <Metric label="Horas extra" value={fmtMinutes(savedRows.reduce((s,r)=>s+(Number(r.overtime_minutes)||0),0))} foot="Horas extra informadas o calculadas"/>
        <Metric label="Atrasos" value={fmtMinutes(savedRows.reduce((s,r)=>s+(Number(r.late_minutes)||0),0))} foot="Minutos de atraso totalizados"/>
      </div>
      <div className="table-wrap"><table><thead><tr><th>RUT / ID</th><th>Trabajador</th><th>Sucursal</th><th>Días con registro</th><th>Turnos asignados</th><th>Programadas</th><th>Trabajadas</th><th>H. extra</th><th>Atraso</th></tr></thead><tbody>{savedGrouped.map(g=><tr key={g.key}><td>{g.rut||g.key}</td><td>{g.name}</td><td>{g.branch||"—"}</td><td>{g.days.size}</td><td>{[...g.assigned].join(", ")||"—"}</td><td>{fmtMinutes(g.scheduled)}</td><td>{fmtMinutes(g.worked)}</td><td>{fmtMinutes(g.overtime)}</td><td>{fmtMinutes(g.late)}</td></tr>)}</tbody></table></div>
    </section>}
  </div>;
}

function Metric({label,value,foot}:{label:string;value:string;foot:string}) {
  return <article className="card"><div className="metric-label">{label}</div><div className="metric-value" style={{fontSize:value.length>18?"1.1rem":undefined}}>{value}</div><div className="metric-foot">{foot}</div></article>;
}
