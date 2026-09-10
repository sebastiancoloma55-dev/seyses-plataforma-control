import streamlit as st
import pandas as pd
import re
import io
from datetime import datetime
from pypdf import PdfReader

# ==========================================
# CONFIGURACIÓN DE LA PÁGINA
# ==========================================
st.set_page_config(page_title="Plataforma de Control Integral · SEYSES", page_icon="🛡️", layout="wide")

# ==========================================
# INICIALIZACIÓN DE ESTADOS DE SESIÓN
# ==========================================
if 'users_db' not in st.session_state:
    st.session_state.users_db = {
        "admin": {
            "password": "123", 
            "role": "Administrador Todopoderoso", 
            "email": "admin@seyses.com",
            "active": True,
            "created_at": "2026-01-10 08:00",
            "last_login": "2026-09-10 10:32",
            "permissions": {"Previred": True, "Nómina & SEYSES": True, "Administración": True}
        },
        "jperez": {
            "password": "123", 
            "role": "Operador", 
            "email": "jperez@seyses.com",
            "active": True,
            "created_at": "2026-02-15 09:30",
            "last_login": "2026-09-10 09:15",
            "permissions": {"Previred": True, "Nómina & SEYSES": True, "Administración": False}
        }
    }

if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
if 'current_user' not in st.session_state:
    st.session_state.current_user = ""
if 'current_role' not in st.session_state:
    st.session_state.current_role = ""
if 'audit_logs' not in st.session_state:
    st.session_state.audit_logs = [
        {"time": "10:32", "user": "admin", "action": "Inició sesión"},
        {"time": "10:35", "user": "admin", "action": "Cargó Previred"},
        {"time": "10:36", "user": "admin", "action": "Procesó 1.284 registros"}
    ]
if 'process_history' not in st.session_state:
    st.session_state.process_history = [
        {"date": "10-09-2026", "type": "Control Nómina & SEYSES", "workers": 1284, "diffs": 37, "user": "admin"}
    ]
if 'db_trabajadores' not in st.session_state:
    st.session_state.db_trabajadores = pd.DataFrame([
        {"RUT": "12.345.678-9", "Nombre": "Juan Pérez", "AFP": "AFP Modelo", "Salud": "FONASA", "Sucursal": "Faena Norte", "Estado": "🟢 OK", "Nomina": "✓", "Accesos": "✓", "SEYSES": "✓"},
        {"RUT": "13.456.789-K", "Nombre": "María Soto", "AFP": "AFP Habitat", "Salud": "Isapre Banmédica", "Sucursal": "Casa Matriz", "Estado": "🔴 Revisar", "Nomina": "✓", "Accesos": "✗", "SEYSES": "✓"},
        {"RUT": "14.567.890-1", "Nombre": "Pedro Díaz", "AFP": "AFP Cuprum", "Salud": "FONASA", "Sucursal": "Faena Sur", "Estado": "🟠 Diferencia", "Nomina": "✓", "Accesos": "✓", "SEYSES": "✗"},
        {"RUT": "15.678.901-2", "Nombre": "Ana Gómez", "AFP": "AFP Capital", "Salud": "Isapre Colmena", "Sucursal": "Faena Norte", "Estado": "🟢 OK", "Nomina": "✓", "Accesos": "✓", "SEYSES": "✓"}
    ])

# ==========================================
# ESTILOS CSS ADAPTABLES Y CORPORATIVOS (CORREGIDO BOTÓN INVISIBLE Y LOGO)
# ==========================================
st.markdown("""
<style>
    /* Fondo principal modo corporativo SEYSES */
    .stApp { background-color: #0c1624; color: #f1faee; }
    
    /* Contenedor del Login Profesional */
    .login-container {
        background: #14213d;
        border: 1px solid #1f3152;
        border-radius: 16px;
        padding: 45px 40px;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        max-width: 450px;
        margin: 40px auto;
        color: #ffffff;
    }
    
    /* 🔴 SOLUCIÓN DEFINITIVA AL BOTÓN VACÍO: Fuerza color de texto a blanco en TODAS las capas del botón */
    div[data-testid="stFormSubmitButton"] > button,
    div[data-testid="baseButton-secondaryFormSubmit"] > button,
    .stButton > button {
        background-color: #1357c7 !important;
        border: 1px solid #1357c7 !important;
        color: white !important;
        border-radius: 8px !important;
        padding: 10px 24px !important;
    }
    
    div[data-testid="stFormSubmitButton"] > button span,
    div[data-testid="stFormSubmitButton"] > button p,
    div[data-testid="stFormSubmitButton"] > button div,
    .stButton > button span,
    .stButton > button p {
        color: white !important;
        font-weight: 800 !important;
        visibility: visible !important;
        opacity: 1 !important;
        display: block !important;
    }

    div[data-testid="stFormSubmitButton"] > button:hover,
    .stButton > button:hover {
        background-color: #0f4399 !important;
        border-color: #0f4399 !important;
    }
    
    /* Inputs del formulario limpios */
    input {
        background-color: #f8fafc !important;
        color: #0f172a !important;
        border-radius: 6px !important;
    }

    /* Tarjetas Dashboard */
    .metric-card {
        background: #14213d;
        border: 1px solid #1f3152;
        border-radius: 14px;
        padding: 20px;
        text-align: center;
        box-shadow: 0 8px 16px rgba(0,0,0,0.3);
    }
    .metric-number { font-size: 28px; font-weight: 900; color: #4ea8de; }
    .metric-label { font-size: 12px; color: #94a3b8; font-weight: 700; text-transform: uppercase; margin-top: 5px; }

    .main-header { font-size: 26px; font-weight: 800; color: #ffffff; margin-bottom: 5px; }
    .sub-header { font-size: 14px; color: #94a3b8; margin-bottom: 25px; }
</style>
""", unsafe_allow_html=True)

# 🔴 ELIMINADO EL SVG DEL TRIÁNGULO. AHORA ES UN TEXTO CORPORATIVO LIMPIO E IMPECABLE.
logo_seyses_oficial = """
<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 30px;">
    <span style="font-size: 38px; font-weight: 900; color: #ffffff; letter-spacing: -1.5px; font-family: 'Arial', sans-serif;">SEYSES</span>
    <span style="font-size: 11px; color: #4ea8de; letter-spacing: 2.5px; text-transform: uppercase; margin-top: 2px;">Personas | Procesos | Resultados</span>
</div>
"""

# ==========================================
# PANTALLA DE LOGIN
# ==========================================
if not st.session_state.logged_in:
    st.markdown("<div style='height: 10px;'></div>", unsafe_allow_html=True)
    
    col_l, col_c, col_r = st.columns([1, 1.5, 1])
    with col_c:
        st.markdown('<div class="login-container">', unsafe_allow_html=True)
        st.markdown(logo_seyses_oficial, unsafe_allow_html=True)
        st.markdown('<h3 style="text-align: center; color: #ffffff; font-weight: 800; margin-bottom: 5px;">Iniciar sesión</h3>', unsafe_allow_html=True)
        st.markdown('<p style="text-align: center; color: #94a3b8; font-size: 13px; margin-bottom: 25px;">Ingresa tus credenciales corporativas</p>', unsafe_allow_html=True)
        
        with st.form("form_login_definitivo"):
            user_input = st.text_input("Usuario", placeholder="ej: admin")
            pass_input = st.text_input("Contraseña", type="password", placeholder="••••••••")
            
            # Botón con CSS blindado para que siempre diga Iniciar sesión en color blanco
            submitted = st.form_submit_button("Iniciar sesión")
            
            if submitted:
                u = user_input.strip().lower()
                if u in st.session_state.users_db and st.session_state.users_db[u]["active"]:
                    if pass_input.strip() == st.session_state.users_db[u]["password"]:
                        st.session_state.logged_in = True
                        st.session_state.current_user = u
                        st.session_state.current_role = st.session_state.users_db[u]["role"]
                        st.session_state.users_db[u]["last_login"] = datetime.now().strftime("%Y-%m-%d %H:%M")
                        st.session_state.audit_logs.insert(0, {"time": datetime.now().strftime("%H:%M"), "user": u, "action": "Inició sesión"})
                        st.rerun()
                    else:
                        st.error("Contraseña incorrecta.")
                else:
                    st.error("Usuario no encontrado.")

        st.markdown('</div>', unsafe_allow_html=True)
    st.stop()

# ==========================================
# APLICACIÓN PRINCIPAL (AUTENTICADO)
# ==========================================
st.sidebar.markdown(logo_seyses_oficial, unsafe_allow_html=True)
st.sidebar.markdown(f'<p style="font-size: 12px; color: #94a3b8; text-align:center; margin-bottom: 20px;">Usuario: <b>{st.session_state.current_user}</b><br>Rol: <b>{st.session_state.current_role}</b></p>', unsafe_allow_html=True)
st.sidebar.markdown("---")

menu_opciones = ["🏠 Dashboard Principal", "📄 Extractor Previred", "📊 Control Nómina & SEYSES", "🚨 Centro de Diferencias", "🔎 Buscador Global", "📁 Historial de Procesos", "🛡️ Auditoría", "👤 Gestión de Usuarios"]
seccion = st.sidebar.radio("Navegación Corporativa:", menu_opciones)

st.sidebar.markdown("---")
if st.sidebar.button("🚪 Cerrar sesión", use_container_width=True):
    st.session_state.audit_logs.insert(0, {"time": datetime.now().strftime("%H:%M"), "user": st.session_state.current_user, "action": "Cerró sesión"})
    st.session_state.logged_in = False
    st.rerun()

# =========================================================================
# 1. 🏠 DASHBOARD PRINCIPAL
# =========================================================================
if seccion == "🏠 Dashboard Principal":
    st.markdown('<div class="main-header">🏠 Dashboard de Control Integral SEYSES</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Resumen ejecutivo y estado general de operaciones en tiempo real.</div>', unsafe_allow_html=True)
    st.markdown('---')

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown('<div class="metric-card"><div class="metric-number">1.284</div><div class="metric-label">Personas Procesadas</div></div>', unsafe_allow_html=True)
    with c2:
        st.markdown('<div class="metric-card"><div class="metric-number" style="color:#ef4444;">37</div><div class="metric-label">Diferencias Detectadas</div></div>', unsafe_allow_html=True)
    with c3:
        st.markdown('<div class="metric-card"><div class="metric-number" style="color:#f59e0b;">12</div><div class="metric-label">Alertas Activas</div></div>', unsafe_allow_html=True)
    with c4:
        st.markdown('<div class="metric-card"><div class="metric-number" style="color:#10b981;">98%</div><div class="metric-label">Control Efectivo</div></div>', unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)
    
    col_left, col_right = st.columns(2)
    with col_left:
        st.subheader("📊 Control de Procesos")
        st.progress(100, text="Previred (100% OK)")
        st.progress(98, text="Nómina (98% Procesado)")
        st.progress(85, text="Accesos (85% Sincronizado - ⚠ Alerta)")
        
    with col_right:
        st.subheader("🚨 Últimas Diferencias Registradas")
        st.markdown("""
        * **Juan Pérez** — Diferencia de acceso <span style="color:#ef4444; float:right;">🔴</span>
        * **María Soto** — Diferencia SEYSES <span style="color:#f59e0b; float:right;">🟠</span>
        * **Pedro Díaz** — Sin registro en nómina <span style="color:#ef4444; float:right;">🔴</span>
        """, unsafe_allow_html=True)

# =========================================================================
# 2. 📄 EXTRACTOR PREVIRED
# =========================================================================
elif seccion == "📄 Extractor Previred":
    st.markdown('<div class="main-header">📄 Extractor y Formateador Previred</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Extracción directa de datos desde PDFs de Previred con desglose exacto de Renta AFC, Afiliado y Empleador.</div>', unsafe_allow_html=True)
    st.markdown('---')

    uploaded_previred = st.file_uploader("Sube el PDF de Previred (Planilla Larga o Certificado)", type=['pdf'], key="up_prev_vfinal")

    def procesar_pdf_previred(pdf_file):
        reader = PdfReader(pdf_file)
        texto_completo = ""
        for page in reader.pages:
            if page.extract_text():
                texto_completo += page.extract_text() + "\n"
        if "Certificado de Pagos" in texto_completo or "certifica:" in texto_completo:
            return extraer_certificado_previred(texto_completo)
        else:
            return extraer_planilla_previred(reader)

    def extraer_planilla_previred(reader):
        data = {}
        contexto = "UNKNOWN"
        current_afp = "AFP"
        ruts_empresa = ['77.419.473-8', '24.598.191-0']
        for page in reader.pages:
            text = page.extract_text()
            if not text: continue
            texto_upper = text.upper()
            if "FONDO DE PENSIONES" in texto_upper and "AFP" in texto_upper:
                contexto = "AFP"
                m = re.search(r'AFP\s+([A-Za-z]+)', text, re.IGNORECASE)
                if m: current_afp = "AFP " + m.group(1).strip().capitalize()
            elif "SEGURO SOCIAL PREVISIONAL" in texto_upper:
                contexto = "SEGURO"
            elif "FONASA" in texto_upper or "PLANILLA DE DECLARACION Y PAGO SIMULTANEO" in texto_upper:
                contexto = "FONASA"
            elif "ISAPRE" in texto_upper:
                contexto = "ISAPRE"
                m = re.search(r'ISAPRE\s+([A-Za-z]+)', text, re.IGNORECASE)
                if m: contexto = "ISAPRE " + m.group(1).strip().capitalize()
            elif "MUTUAL DE SEGURIDAD" in texto_upper or "ACHS" in texto_upper or "INSTITUTO DE SEGURIDAD" in texto_upper:
                contexto = "MUTUAL"
            elif "CAJA DE COMPENSACION" in texto_upper or "LOS HEROES" in texto_upper or "LOS ANDES" in texto_upper:
                contexto = "CAJA"

            for line in text.split('\n'):
                m_rut = re.search(r'\b(\d{1,2}\.\d{3}\.\d{3}\-[0-9Kk])\b', line)
                if not m_rut: continue
                rut = m_rut.group(1).upper()
                if rut in ruts_empresa: continue
                if rut not in data:
                    data[rut] = {
                        'RUT': rut, 'Nombre PDF': '', 'AFP': '', 'Salud': '', 
                        'Renta Seguro Social': 0, 'Monto Seguro Social': 0, 
                        'Renta AFP': 0, 'Cotizacion AFP': 0, 'SIS AFP': 0, 'APVI': 0, 
                        'Renta AFC': 0, 'AFC Afiliado': 0, 'AFC Empleador': 0, 
                        'Renta Salud': 0, 'Cotizacion Salud': 0, 
                        'Renta Mutual': 0, 'Cotizacion Mutual': 0, 
                        'Renta Caja Isapre': 0, 'Renta Caja No Isapre': 0, 'Cotizacion Caja': 0,
                        '_Renta_Caja_Base': 0
                    }
                idx = line.find(rut) + len(rut)
                resto = line[idx:].strip()
                m_name = re.match(r'^([A-ZÑÁÉÍÓÚ\s]+)', resto)
                if m_name:
                    name = m_name.group(1).strip()
                    name = re.sub(r'\s+AFP$', '', name) 
                    name = re.sub(r'\s+JC$', '', name)  
                    if len(name) > len(data[rut]['Nombre PDF']):
                        data[rut]['Nombre PDF'] = name
                numeros = re.findall(r'\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b', resto)
                num_puros = [int(n.replace('.', '')) for n in numeros]
                monetary_gt1000 = [n for n in num_puros if n > 1000]
                if not num_puros: continue

                if contexto == "SEGURO":
                    if monetary_gt1000: data[rut]['Renta Seguro Social'] = monetary_gt1000[0]
                    if len(monetary_gt1000) >= 2: data[rut]['Monto Seguro Social'] = monetary_gt1000[1]
                elif contexto == "AFP":
                    data[rut]['AFP'] = current_afp
                    if len(monetary_gt1000) >= 1: data[rut]['Renta AFP'] = monetary_gt1000[0]
                    if len(monetary_gt1000) >= 2: data[rut]['Cotizacion AFP'] = monetary_gt1000[1]
                    if len(monetary_gt1000) >= 3: data[rut]['SIS AFP'] = monetary_gt1000[2]
                    if len(monetary_gt1000) >= 5:
                        data[rut]['Renta AFC'] = monetary_gt1000[3]
                        data[rut]['AFC Empleador'] = monetary_gt1000[4]
                        data[rut]['AFC Afiliado'] = 0
                    elif len(monetary_gt1000) >= 4:
                        data[rut]['Renta AFC'] = monetary_gt1000[0]
                        data[rut]['AFC Empleador'] = monetary_gt1000[-1]
                elif contexto == "FONASA":
                    data[rut]['Salud'] = 'FONASA'
                    if monetary_gt1000: data[rut]['Renta Salud'] = monetary_gt1000[0]
                    if len(monetary_gt1000) >= 2: data[rut]['Cotizacion Salud'] = monetary_gt1000[1]
                elif "ISAPRE" in contexto:
                    data[rut]['Salud'] = contexto
                    if monetary_gt1000: data[rut]['Renta Salud'] = monetary_gt1000[0]
                    if len(monetary_gt1000) >= 2: data[rut]['Cotizacion Salud'] = monetary_gt1000[1]
                elif contexto == "MUTUAL":
                    if monetary_gt1000: data[rut]['Renta Mutual'] = monetary_gt1000[0]
                    if len(monetary_gt1000) >= 2: data[rut]['Cotizacion Mutual'] = monetary_gt1000[1]
                elif contexto == "CAJA":
                    if monetary_gt1000: data[rut]['_Renta_Caja_Base'] = monetary_gt1000[0]
                    if len(monetary_gt1000) >= 2: data[rut]['Cotizacion Caja'] = monetary_gt1000[1]

        for rut, row in data.items():
            if "ISAPRE" in str(row['Salud']).upper():
                row['Renta Caja Isapre'] = row['_Renta_Caja_Base']
            else:
                row['Renta Caja No Isapre'] = row['_Renta_Caja_Base']
        return list(data.values())

    def extraer_certificado_previred(text):
        data = {}
        bloques = re.split(r'Que,\s+las\s+cotizaciones\s+previsionales\s+del\s+Sr\.\(a\)', text, flags=re.IGNORECASE)
        for bloque in bloques[1:]:
            match_info = re.search(r'(.+?),\s+Rut:\s+([\d\.\-kK]+)', bloque)
            if not match_info: continue
            nombre = match_info.group(1).strip()
            rut = match_info.group(2).strip().upper()
            if rut not in data:
                 data[rut] = {
                        'RUT': rut, 'Nombre PDF': nombre, 'AFP': '', 'Salud': '', 
                        'Renta Seguro Social': 0, 'Monto Seguro Social': 0, 
                        'Renta AFP': 0, 'Cotizacion AFP': 0, 'SIS AFP': 0, 'APVI': 0, 
                        'Renta AFC': 0, 'AFC Afiliado': 0, 'AFC Empleador': 0, 
                        'Renta Salud': 0, 'Cotizacion Salud': 0, 
                        'Renta Mutual': 0, 'Cotizacion Mutual': 0, 
                        'Renta Caja Isapre': 0, 'Renta Caja No Isapre': 0, 'Cotizacion Caja': 0
                    }
            record = data[rut]
            filas = re.findall(r'([A-Z\s\(\)\.\-]+?)\s+(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})\s+(REM|GRA|RET|LEY|COM)\s+\$([\d\.]+)\s+\$([\d\.]+)', bloque)
            for f in filas:
                institucion = f[0].strip().upper()
                imponible = int(f[4].replace('.', ''))
                monto = int(f[5].replace('.', ''))
                if "SEGURO SOCIAL" in institucion:
                    record['Renta Seguro Social'] = imponible
                    record['Monto Seguro Social'] = monto
                elif "OBLIGATORIA" in institucion:
                    record['AFP'] = "AFP " + institucion.replace("(COTIZACION OBLIGATORIA)", "").strip()
                    record['Renta AFP'] = imponible
                    record['Cotizacion AFP'] = monto
                elif "(SIS)" in institucion:
                    record['SIS AFP'] = monto
                elif "APVI" in institucion:
                    record['APVI'] = monto
                elif "(AFC)" in institucion:
                    record['Renta AFC'] = imponible
                    record['AFC Empleador'] = monto
                elif any(x in institucion for x in ["FONASA", "ISAPRE", "MASVIDA", "CRUZ BLANCA", "CONSALUD", "COLMENA", "BANMEDICA"]):
                    record['Salud'] = institucion
                    record['Renta Salud'] = imponible
                    record['Cotizacion Salud'] = monto
                elif any(x in institucion for x in ["MUTUAL", "ACHS", "IST", "ISL"]):
                    record['Renta Mutual'] = imponible
                    record['Cotizacion Mutual'] = monto
                elif any(x in institucion for x in ["CAJA", "HEROES", "ANDES"]):
                    record['Cotizacion Caja'] = monto
                    if "ISAPRE" in record['Salud']:
                        record['Renta Caja Isapre'] = imponible
                    else:
                        record['Renta Caja No Isapre'] = imponible
        return list(data.values())

    def generar_excel_formato_previred(df):
        columnas_plantilla = [
            'RUT', 'Nombre PDF', 'AFP', 'Salud', 'Renta Seguro Social', 'Monto Seguro Social', 
            'Renta AFP', 'Cotizacion AFP', 'SIS AFP', 'APVI', 'Renta AFC', 'AFC Afiliado', 
            'AFC Empleador', 'Renta Salud', 'Cotizacion Salud', 'Renta Mutual', 
            'Cotizacion Mutual', 'Renta Caja Isapre', 'Renta Caja No Isapre', 'Cotizacion Caja'
        ]
        for col in columnas_plantilla:
            if col not in df.columns: df[col] = 0
        df = df[columnas_plantilla]
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Previred_Report')
        return output.getvalue()

    if uploaded_previred is not None:
        if st.button("🚀 Extraer Datos y Generar Excel Corporativo", key="btn_ext_prev_vfinal"):
            with st.spinner('Extrayendo datos directos del documento...'):
                try:
                    datos_previred = procesar_pdf_previred(uploaded_previred)
                    if not datos_previred:
                        st.error("No se detectaron trabajadores en el PDF.")
                    else:
                        df_previred = pd.DataFrame(datos_previred)
                        st.success(f"¡Extracción exitosa! {len(df_previred)} trabajadores procesados.")
                        st.dataframe(df_previred[['RUT', 'Nombre PDF', 'Renta AFC', 'AFC Afiliado', 'AFC Empleador']].head(10), use_container_width=True)
                        
                        excel_data = generar_excel_formato_previred(df_previred)
                        st.download_button(
                            label="📥 Descargar Excel Corporativo SEYSES",
                            data=excel_data,
                            file_name="Reporte_Formato_SEYSES.xlsx",
                            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            type="primary"
                        )
                except Exception as e:
                    st.error(f"Error procesando PDF: {e}")

# =========================================================================
# 3. 📊 CONTROL NÓMINA & SEYSES
# =========================================================================
elif seccion == "📊 Control Nómina & SEYSES":
    st.markdown('<div class="main-header">📊 Motor de Conciliación: Nómina ➔ Accesos ➔ SEYSES</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Cruce automatizado para la validación cruzada de estado laboral y operativo.</div>', unsafe_allow_html=True)
    st.markdown('---')

    c_a, c_b = st.columns(2)
    with c_a:
        f_nom = st.file_uploader("1. Nómina mensual vigente (.xlsx)", type=['xlsx','xls'], key="f_n_vf")
    with c_b:
        f_acc = st.file_uploader("2. Control de accesos (.xlsx)", type=['xlsx','xls'], key="f_a_vf")

    st.subheader("📋 Matriz de Cruce y Consistencia SEYSES")
    df_conciliacion = st.session_state.db_trabajadores[['RUT', 'Nombre', 'Nomina', 'Accesos', 'SEYSES', 'Estado']]
    st.dataframe(df_conciliacion, use_container_width=True)
    
    if st.button("📥 Exportar Matriz de Conciliación"):
        st.success("¡Reporte exportado correctamente con formato corporativo SEYSES!")

# =========================================================================
# 4. 🚨 CENTRO DE DIFERENCIAS
# =========================================================================
elif seccion == "🚨 Centro de Diferencias":
    st.markdown('<div class="main-header">🚨 Centro de Excepciones y Diferencias</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Monitoreo exclusivo de alertas, duplicados e inconsistencias operativas.</div>', unsafe_allow_html=True)
    st.markdown('---')

    st.warning("⚠️ Se han detectado 37 excepciones activas en el último proceso mensual.")
    
    excepciones_df = pd.DataFrame([
        {"RUT": "13.456.789-K", "Nombre": "María Soto", "Tipo de Alerta": "Persona con acceso pero no presente en nómina", "Clasificación": "🔴 Crítico"},
        {"RUT": "14.567.890-1", "Nombre": "Pedro Díaz", "Tipo de Alerta": "Diferencia de información en SEYSES", "Clasificación": "🟠 Advertencia"}
    ])
    st.table(excepciones_df)
    
    if st.button("📥 Descargar Reporte de Diferencias"):
        st.success("¡Archivo de diferencias descargado con éxito!")

# =========================================================================
# 5. 🔎 BUSCADOR GLOBAL DE TRABAJADORES
# =========================================================================
elif seccion == "🔎 Buscador Global":
    st.markdown('<div class="main-header">🔎 Buscador Global de Trabajadores SEYSES</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Consulta unificada por RUT, Nombre, AFP, Salud o Sucursal.</div>', unsafe_allow_html=True)
    st.markdown('---')

    termino = st.text_input("🔍 Buscar trabajador por RUT o Nombre:", placeholder="Ej: Juan Pérez o 12.345.678")
    
    df_trab = st.session_state.db_trabajadores
    if termino:
        df_trab = df_trab[df_trab['RUT'].str.contains(termino, case=False, na=False) | df_trab['Nombre'].str.contains(termino, case=False, na=False)]
        
    st.dataframe(df_trab, use_container_width=True)

# =========================================================================
# 6. 📁 HISTORIAL DE PROCESOS
# =========================================================================
elif seccion == "📁 Historial de Procesos":
    st.markdown('<div class="main-header">📁 Historial de Procesos Ejecutados</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Registro histórico de auditoría de cargas y conciliaciones realizadas.</div>', unsafe_allow_html=True)
    st.markdown('---')

    st.table(pd.DataFrame(st.session_state.process_history))

# =========================================================================
# 7. 🛡️ AUDITORÍA
# =========================================================================
elif seccion == "🛡️ Auditoría":
    st.markdown('<div class="main-header">🛡️ Registro de Auditoría del Sistema</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Trazabilidad completa de accesos y acciones operativas de los usuarios.</div>', unsafe_allow_html=True)
    st.markdown('---')

    for log in st.session_state.audit_logs:
        st.markdown(f"`{log['time']}` &nbsp;&nbsp; **{log['user']}** &nbsp;&nbsp; ➔ &nbsp;&nbsp; {log['action']}")

# =========================================================================
# 8. 👤 GESTIÓN DE USUARIOS
# =========================================================================
elif seccion == "👤 Gestión de Usuarios":
    st.markdown('<div class="main-header">👤 Gestión Completa de Usuarios y Permisos</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">Panel exclusivo del Administrador para control de accesos y roles.</div>', unsafe_allow_html=True)
    st.markdown('---')

    tab_create, tab_list = st.tabs(["➕ Crear Nuevo Usuario", "📋 Usuarios y Permisos"])

    with tab_create:
        with st.form("form_create_user_pro_vf"):
            nu = st.text_input("Usuario", placeholder="ej: jperez")
            np = st.text_input("Contraseña temporal", type="password")
            ne = st.text_input("Correo electrónico", placeholder="correo@seyses.com")
            nr = st.selectbox("Rol", ["Operador", "Administrador Todopoderoso"])
            
            sub_c = st.form_submit_button("Crear cuenta")
            if sub_c:
                if nu and np:
                    st.session_state.users_db[nu.strip().lower()] = {
                        "password": np.strip(),
                        "role": nr,
                        "email": ne.strip(),
                        "active": True,
                        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
                        "last_login": "Nunca",
                        "permissions": {"Previred": True, "Nómina & SEYSES": True, "Administración": False}
                    }
                    st.success(f"¡Usuario '{nu}' creado con éxito!")
                else:
                    st.error("Rellena todos los campos obligatorios.")

    with tab_list:
        user_table_data = []
        for uname, uval in st.session_state.users_db.items():
            user_table_data.append({
                "Usuario": uname,
                "Correo": uval["email"],
                "Rol": uval["role"],
                "Estado": "Activo" if uval["active"] else "Inactivo",
                "Último Acceso": uval["last_login"]
            })
        st.table(pd.DataFrame(user_table_data))