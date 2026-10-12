"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import AttendanceAnalyzer from "@/components/AttendanceAnalyzer";
import PreviredExtractor from "@/components/PreviredExtractor";

type Profile = { user_id: string; display_name: string | null; role: string; active: boolean; email?: string };
type Row = Record<string, unknown>;
const modules = [
  { id: "Resumen ejecutivo", icon: "◈", title: "Resumen ejecutivo", desc: "Indicadores generales y estado de la operación." },
  { id: "Extractor Previred", icon: "▤", title: "Extractor Previred", desc: "Preparación de cotizaciones desde archivos PDF." },
  { id: "Importar y conciliar", icon: "⇄", title: "Importar y conciliar", desc: "Cruce de nómina y control de accesos." },
  { id: "Analizador universal de asistencia", icon: "◷", title: "Analizador de asistencia", desc: "Normaliza reportes de asistencia de distintos ERP y totaliza horas por trabajador." },
  { id: "Trabajadores", icon: "♙", title: "Trabajadores", desc: "Consulta del maestro de trabajadores." },
  { id: "Procesos", icon: "◷", title: "Procesos", desc: "Seguimiento de ejecuciones y resultados." },
  { id: "Diferencias", icon: "⚑", title: "Diferencias", desc: "Hallazgos y seguimiento de resolución." },
  { id: "Archivos", icon: "▧", title: "Archivos", desc: "Registro y trazabilidad de archivos." },
  { id: "Auditoría", icon: "⌁", title: "Auditoría", desc: "Eventos de actividad y trazabilidad." },
  { id: "Administración", icon: "⚙", title: "Administración", desc: "Información de perfil y administración de acceso." }
];
const tableByModule: Record<string, string> = {
  Trabajadores: "workers",
  Procesos: "process_runs",
  Diferencias: "discrepancies",
  Archivos: "processed_files",
  Auditoría: "audit_logs"
};
const descriptions: Record<string, string> = {
  "Resumen ejecutivo": "Una vista clara de la operación, los procesos y las alertas.",
  "Extractor Previred": "Extrae cotizaciones desde PDF de Previred y descarga el Excel de revisión en tu navegador.",
  "Importar y conciliar": "La interfaz web está preparada; el motor de conciliación Python debe portarse y validarse antes de guardar resultados.",
  "Analizador universal de asistencia": "Carga Excel o CSV de distintos ERP, ajusta el período, mapea sus columnas y calcula horas por trabajador.",
  Trabajadores: "Registros disponibles en la base de datos de SEYSES.",
  Procesos: "Seguimiento de ejecuciones, resultados y errores.",
  Diferencias: "Hallazgos que requieren revisión y seguimiento.",
  Archivos: "Metadatos y trazabilidad de archivos procesados.",
  Auditoría: "Eventos de actividad permitidos para tu usuario.",
  Administración: "Tu perfil de acceso y el estado de la sesión."
};
const labels: Record<string, string[]> = {
  workers: ["rut", "full_name", "branch", "afp", "health_provider"],
  process_runs: ["process_type", "status", "records_read", "records_processed", "created_at"],
  discrepancies: ["rut", "full_name", "category", "severity", "status", "created_at"],
  processed_files: ["original_filename", "file_kind", "status", "file_size_bytes", "created_at"],
  audit_logs: ["occurred_at", "actor_email", "action", "module", "outcome"]
};
function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [section, setSection] = useState("Resumen ejecutivo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    try {
      const supabase = getSupabase();
      supabase.auth.getSession().then(async ({ data }) => {
        if (!alive) return;
        const current = data.session?.user ?? null;
        setUser(current);
        if (current) await loadProfile(current);
        if (alive) setReady(true);
      }).catch(() => { if (alive) setReady(true); });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!alive) return;
        const current = session?.user ?? null;
        setUser(current);
        if (!current) setProfile(null);
        else window.setTimeout(() => { if (alive) void loadProfile(current); }, 0);
      });
      return () => { alive = false; listener.subscription.unsubscribe(); };
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo inicializar la aplicación.");
      setReady(true);
      return () => { alive = false; };
    }
    // Supabase client is a singleton; profile loading is intentionally local to auth changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = async (current: User) => {
    try {
      const supabase = getSupabase();
      const { data, error: profileError } = await supabase.from("user_profiles")
        .select("user_id, display_name, role, active").eq("user_id", current.id).maybeSingle();
      if (profileError) throw profileError;
      if (!data || data.active !== true) {
        await supabase.auth.signOut();
        setProfile(null);
        setError("La cuenta no tiene un perfil SEYSES activo. Solicita al administrador que revise user_profiles.");
        return;
      }
      setProfile({ ...data, email: current.email ?? "" });
      setError("");
    } catch {
      setError("No fue posible validar tu perfil SEYSES. Verifica las políticas RLS y la tabla user_profiles.");
      setProfile(null);
    }
  };

  const loadData = useCallback(async () => {
    if (!user || !profile) return;
    setLoadingData(true);
    setError("");
    try {
      const supabase = getSupabase();
      const names = ["workers", "process_runs", "discrepancies", "processed_files", "audit_logs", "attendance_imports", "attendance_records"];
      const results = await Promise.all(names.map(async (table) => {
        const { count, error: queryError } = await supabase.from(table).select("*", { count: "exact", head: true });
        return [table, queryError ? null : (count ?? 0)] as const;
      }));
      setCounts(Object.fromEntries(results));
      const table = tableByModule[section];
      if (table) {
        const columns = labels[table].join(",");
        const orderColumn = table === "audit_logs" ? "occurred_at" : "created_at";
        const query = await supabase.from(table).select(columns).order(orderColumn, { ascending: false }).limit(100);
        if (query.error) {
          const fallback = await supabase.from(table).select(columns).limit(100);
          if (fallback.error) throw fallback.error;
          setRows((fallback.data ?? []) as unknown as Row[]);
        } else setRows((query.data ?? []) as unknown as Row[]);
      } else setRows([]);
    } catch {
      setError("No se pudieron cargar algunos datos. Revisa las tablas y políticas RLS de Supabase; el acceso no se ha omitido.");
    } finally {
      setLoadingData(false);
    }
  }, [user, profile, section]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row => Object.values(row).some(value => show(value).toLowerCase().includes(term)));
  }, [rows, search]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      setPassword("");
      setMessage("Autenticación correcta. Validando el perfil SEYSES…");
    } catch {
      setError("No se pudo iniciar sesión. Revisa tus credenciales y la configuración de Supabase.");
    } finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true);
    try { await getSupabase().auth.signOut(); setUser(null); setProfile(null); setRows([]); setCounts({}); setSection("Resumen ejecutivo"); }
    catch { setError("No se pudo cerrar la sesión. Inténtalo nuevamente."); }
    finally { setBusy(false); }
  }

  if (!ready) return <div className="loading">Cargando SEYSES de forma segura…</div>;
  if (!user || !profile) return <main className="login-page"><section className="login-card">
    <div className="brand">SEYSES <span>◈</span><small>CENTRO DE CONTROL INTEGRAL</small></div>
    <h1>Bienvenido</h1><p>Ingresa con tu cuenta corporativa autorizada.</p>
    <form onSubmit={signIn}>
      <div className="field"><label htmlFor="email">Correo electrónico</label><input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@empresa.cl" required /></div>
      <div className="field"><label htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice success">{message}</div>}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? "Validando…" : "Ingresar de forma segura"}</button>
    </form><p style={{textAlign:"center",marginTop:16}}><Link href="/recuperar">¿Olvidaste tu contraseña?</Link></p><div className="muted" style={{fontSize:".76rem",textAlign:"center",marginTop:18}}>Acceso protegido por Supabase Auth · Sin contraseñas predeterminadas</div>
  </section></main>;

  const isAdmin = profile.role === "admin";
  const currentModule = modules.find(item => item.id === section) ?? modules[0];
  const count = (table: string) => counts[table] === undefined || counts[table] === null ? "—" : counts[table]!.toLocaleString("es-CL");
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand">SEYSES <span>◈</span><small>CENTRO DE CONTROL</small></div>
      <div className="profile"><strong>{profile.display_name || profile.email || "Usuario"}</strong><small>Perfil autorizado: {profile.role.toUpperCase()}</small></div>
      <div className="nav-label">ESPACIOS DE TRABAJO</div>
      <nav className="nav" aria-label="Navegación principal">{modules.map(item => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => {setSection(item.id);setSearch("");}}>{item.icon} &nbsp; {item.title}</button>)}</nav>
      <div className="sidebar-foot">◉ Conexión Supabase<br/>Sesión autenticada</div>
      <button className="btn" onClick={signOut} disabled={busy}>↪ Cerrar sesión</button>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">SEYSES / OPERACIONES</div><h1 className="page-title">{currentModule.title}</h1><div className="subtitle">{descriptions[section]}</div></div><span className="pill">◉ Conectado · {isAdmin ? "Administrador" : "Perfil autorizado"}</span></header>
      {error && <div className="notice error" role="alert">{error}</div>}
      {section === "Resumen ejecutivo" && <>
        <div className="grid">
          <Metric label="Trabajadores" value={count("workers")} foot="Maestro de trabajadores" />
          <Metric label="Procesos" value={count("process_runs")} foot="Ejecuciones registradas" />
          <Metric label="Diferencias" value={count("discrepancies")} foot="Hallazgos disponibles según permisos" />
          <Metric label="Archivos" value={count("processed_files")} foot="Metadatos y trazabilidad" />
        </div>
        <div className="grid">
          <Metric label="Reportes asistencia" value={count("attendance_imports")} foot="Importaciones normalizadas" />
          <Metric label="Registros asistencia" value={count("attendance_records")} foot="Filas por trabajador y fecha" />
        </div>
        <div className="panel"><div className="section-head"><h2>Espacios de trabajo</h2><span className="muted" style={{fontSize:".8rem"}}>Navegación por módulos</span></div><div className="module-grid">{modules.filter(m => m.id !== "Resumen ejecutivo").map(item => <button key={item.id} className="module-card" onClick={() => setSection(item.id)}><span className="status">{item.icon} Módulo</span><b>{item.title}</b><span>{item.desc}</span></button>)}</div></div>
      </>}
      {tableByModule[section] && <section className="panel">
        <div className="section-head"><h2>Datos de Supabase</h2><div className="actions"><input className="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar en resultados…" aria-label="Buscar en resultados"/><button className="btn" onClick={() => void loadData()} disabled={loadingData}>{loadingData ? "Actualizando…" : "↻ Actualizar"}</button></div></div>
        {loadingData ? <div className="empty">Consultando datos autorizados…</div> : filteredRows.length === 0 ? <div className="empty"><strong>No hay registros para mostrar</strong>{rows.length ? "No hay coincidencias con tu búsqueda." : "La tabla puede estar vacía o las políticas RLS pueden limitar tu acceso."}</div> : <div className="table-wrap"><table><thead><tr>{labels[tableByModule[section]].map(col => <th key={col}>{col.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{filteredRows.map((row,i)=><tr key={String(row.id ?? i)}>{labels[tableByModule[section]].map(col=><td key={col}>{show(row[col])}</td>)}</tr>)}</tbody></table></div>}
        <div className="muted" style={{fontSize:".76rem",marginTop:12}}>Se muestran hasta 100 registros. La visibilidad depende de las políticas RLS de Supabase.</div>
      </section>}
      {section === "Extractor Previred" && <PreviredExtractor />}
      {section === "Importar y conciliar" && <div className="panel"><h2>Importar y conciliar</h2><p className="muted">El motor de validación y conciliación está en Python. La interfaz web todavía no guarda conciliaciones; primero debe migrarse el análisis de Excel y validarse con datos de prueba.</p><div className="notice">Para evitar escrituras incompletas, la carga está deshabilitada en esta versión inicial de Vercel.</div></div>}
      {section === "Analizador universal de asistencia" && <AttendanceAnalyzer userId={user.id} />}
      {section === "Administración" && <div className="panel"><h2>Perfil y permisos</h2><div className="grid"><Metric label="Usuario" value={profile.display_name || "—"} foot={profile.email || ""}/><Metric label="Rol" value={profile.role} foot={isAdmin ? "Perfil administrador" : "Acceso limitado por rol"}/><Metric label="Cuenta" value={profile.active ? "Activa" : "Inactiva"} foot="Estado de user_profiles"/><Metric label="Autenticación" value="Supabase" foot="Sesión protegida"/></div><p className="muted">La administración de usuarios y la edición de roles deben hacerse desde los controles autorizados de Supabase hasta migrar el flujo administrativo completo.</p></div>}
      <footer className="muted" style={{fontSize:".75rem",marginTop:24}}>SEYSES · Centro de Control Integral · Datos sujetos a permisos de Supabase.</footer>
    </main>
  </div>;
}

function Metric({label,value,foot}:{label:string;value:string;foot:string}) {
  return <article className="card"><div className="metric-label">{label}</div><div className="metric-value" style={{fontSize:value.length>18?"1.1rem":undefined}}>{value}</div><div className="metric-foot">{foot}</div></article>;
}
