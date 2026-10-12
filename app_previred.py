"""Punto de entrada legado deshabilitado por seguridad.

El login anterior usaba usuarios/datos de demostración guardados en memoria.
Usa la aplicación principal, conectada a Supabase, con: streamlit run app.py.
El extractor reutilizable se conserva en seyses_previred.py.
"""
import streamlit as st

st.set_page_config(page_title="SEYSES · Módulo legado", page_icon="◈", layout="centered")
st.title("Módulo anterior retirado")
st.warning("Esta interfaz utilizaba usuarios y cifras de demostración. Se deshabilitó para evitar confundir esos datos con información real.")
st.markdown("Abre la aplicación principal para iniciar sesión con Supabase Auth.")
st.code("streamlit run app.py", language="bash")
st.stop()
