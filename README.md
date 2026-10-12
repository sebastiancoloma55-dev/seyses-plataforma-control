# SEYSES · Control Integral

Aplicación Streamlit con autenticación Supabase y base de datos independiente.

## Estado
Esta rama incorpora una primera interfaz conectada a Supabase para autenticación, panel de estado, consulta de trabajadores, historial de procesos y auditoría por rol. La importación real de Previred, el almacenamiento privado de archivos y la gestión administrativa completa aún requieren integración y pruebas antes de uso productivo.

## Requisitos
- Python 3.10+
- Proyecto Supabase activo
- Usuario creado en Supabase Authentication
- Perfil correspondiente en `public.user_profiles`

## Configuración local
1. Instala dependencias: `pip install -r requirements.txt`
2. Configura secretos mediante variables de entorno `SUPABASE_URL` y `SUPABASE_KEY`, o en `.streamlit/secrets.toml`.
3. Crea una cuenta en Supabase Authentication.
4. Copia el UUID de la cuenta y crea un perfil en `public.user_profiles` con `user_id`, `display_name`, `role` y `active=true`. Los roles permitidos son `admin`, `operator` y `auditor`.
5. Ejecuta: `streamlit run app.py`

## Seguridad
- No usar contraseñas de prueba ni subir archivos de secretos al repositorio.
- No colocar la clave service-role en la aplicación.
- No cargar datos personales reales hasta completar pruebas de permisos, almacenamiento privado y flujos de importación.
- Las políticas RLS de Supabase deben permanecer habilitadas.

## Despliegue
El repositorio no incluye todavía un despliegue público. Streamlit necesita un servicio de alojamiento compatible con Python; Supabase proporciona autenticación y base de datos, no aloja directamente esta interfaz Streamlit.
