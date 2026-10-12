import streamlit as st
import pandas as pd
from datetime import datetime, timezone
from sesyes_supabase import sign_in, sign_out, log_event, get_audit_logs, get_client

st.set_page_config(page_title="SEYSES · Control Integral", page_icon="🟣", layout="wide")

st.markdown("""
<style>
.stApp { background: #f7f8fc; }
[data-testid="stSidebar"] { background: #f0eff8; }
.seyses-title { font-size: 2rem; font-weight: 800; color: #342e54; }
.seyses-subtitle { color: #6d6887; }
div[data-testid="stMetric"] { background: white; border: 1px solid #e7e5f2; padding: 18px; border-radius: 14px; }
</style>
""", unsafe_allow_html=True)

if "seyses_user" not in st.session_state:
    st.session_state.seyses_user = None
if "seyses_client" not in st.session_state:
    st.session_state.seyses_client = None

def show_login():
    left, center, right = st.columns([1, 1.25, 1])
    with center:
        st.markdown("<div style='height:8vh'></div>", unsafe_allow_html=True)
        st.markdown("<div class='seyses-title' style='text-align:center'>SEYSES</div>", unsafe_allow_html=True)
        st.markdown("<p class='seyses-subtitle' style='text-align:center'>Personas · Procesos · Resultados</p>", unsafe_allow_html=True)
        st.subheader("Iniciar sesión")
        with st.form("login_form"):
            email = st.text_input("Correo electrónico", placeholder="usuario@empresa.cl")
            password = st.text_input("Contraseña", type="password")
            submit = st.form_submit_button("Ingresar", use_container_width=True, type="primary")
        if submit:
            if not email.strip() or not password:
                st.error("Ingresa tu correo y contraseña.")
            else:
                try:
                    client, profile = sign_in(email.strip(), password)
                    st.session_state.seyses_client = client
                    st.session_state.seyses_user = profile
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))
        st.caption("Autenticación gestionada por Supabase. No existen usuarios ni contraseñas predeterminados en esta aplicación.")

def count_rows(client, table):
    try:
        response = client.table(table).select("id", count="exact").limit(1).execute()
        return int(response.count or 0)
    except Exception:
        return None

if not st.session_state.seyses_user:
    show_login()
    st.stop()

user = st.session_state.seyses_user
client = st.session_state.seyses_client
role = user.get("role", "operator")

with st.sidebar:
    st.markdown("## SEYSES")
    st.caption("Control Integral")
    st.write(user.get("display_name") or user.get("email"))
    st.caption(f"Perfil: {role}")
    section = st.radio("Navegación", ["Panel principal", "Trabajadores", "Procesos", "Auditoría", "Administración"])
    st.divider()
    if st.button("Cerrar sesión", use_container_width=True):
        try:
            log_event(client, user, "logout", "Autenticación")
            sign_out(client)
        finally:
            st.session_state.seyses_user = None
            st.session_state.seyses_client = None
            st.rerun()

st.markdown("<div class='seyses-title'>Control Integral SEYSES</div>", unsafe_allow_html=True)
st.markdown("<p class='seyses-subtitle'>Base de datos independiente · Auditoría de actividad · Acceso por roles</p>", unsafe_allow_html=True)
st.info("Versión inicial segura: la autenticación y las consultas utilizan Supabase. Los módulos que aún no están integrados no muestran datos inventados ni deben usarse para cargar información real.")

if section == "Panel principal":
    st.subheader("Estado de la plataforma")
    cols = st.columns(4)
    for col, table, label in zip(cols, ["workers", "process_runs", "discrepancies", "processed_files"],
                                 ["Trabajadores", "Procesos", "Diferencias", "Archivos registrados"]):
        value = count_rows(client, table)
        col.metric(label, "—" if value is None else value)
    st.markdown("### Próximos módulos")
    st.write("- Importación y conciliación de Previred con validaciones.")
    st.write("- Registro seguro de archivos en almacenamiento privado.")
    st.write("- Administración de usuarios, roles y permisos.")
    st.write("- Reportes de diferencias y exportaciones.")
    st.caption("Los contadores consultan la base actual y respetan las políticas RLS de Supabase.")

elif section == "Trabajadores":
    st.subheader("Maestro de trabajadores")
    try:
        response = client.table("workers").select(
            "rut, full_name, afp, health_provider, branch, employment_status, payroll_status, access_status, seyses_status, created_at"
        ).order("full_name").limit(500).execute()
        df = pd.DataFrame(response.data or [])
        if df.empty:
            st.info("Todavía no hay trabajadores cargados en la base de datos.")
        else:
            query = st.text_input("Buscar por RUT, nombre o sucursal")
            if query:
                mask = df.astype(str).apply(lambda col: col.str.contains(query, case=False, na=False)).any(axis=1)
                df = df[mask]
            st.dataframe(df, use_container_width=True, hide_index=True)
    except Exception:
        st.error("No fue posible consultar trabajadores. Revisa el perfil y las políticas RLS.")

elif section == "Procesos":
    st.subheader("Historial de procesos")
    try:
        response = client.table("process_runs").select(
            "created_at, process_type, status, source_filename, records_read, records_processed, differences_found, error_summary"
        ).order("created_at", desc=True).limit(200).execute()
        df = pd.DataFrame(response.data or [])
        if df.empty:
            st.info("No hay procesos registrados todavía.")
        else:
            st.dataframe(df, use_container_width=True, hide_index=True)
    except Exception:
        st.error("No fue posible consultar el historial. Revisa los permisos del perfil.")

elif section == "Auditoría":
    st.subheader("Registro de auditoría")
    if role not in ("admin", "auditor"):
        st.error("Tu perfil no tiene permiso para consultar la auditoría.")
    else:
        try:
            logs = get_audit_logs(client, 200)
            df = pd.DataFrame(logs)
            if df.empty:
                st.info("Todavía no hay eventos de auditoría.")
            else:
                st.dataframe(df, use_container_width=True, hide_index=True)
        except Exception:
            st.error("No fue posible consultar la auditoría. Revisa las políticas RLS.")

elif section == "Administración":
    st.subheader("Administración de usuarios")
    if role != "admin":
        st.error("Solo el perfil admin puede acceder a la administración.")
    else:
        st.markdown("Las cuentas se crean en Supabase Authentication. Luego se registra el perfil con el mismo UUID en public.user_profiles.")
        st.markdown("[Abrir Supabase Authentication](https://supabase.com/dashboard/project/isddbsunqyksqisoqjmd/auth/users)")
        st.warning("No se usa una clave service-role en esta aplicación. La creación de cuentas y asignación de roles se debe hacer con privilegios administrativos controlados.")

st.caption(f"SEYSES · Sesión iniciada · {datetime.now().strftime('%d-%m-%Y %H:%M')}")
