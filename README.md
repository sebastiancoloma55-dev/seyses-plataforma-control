# SEYSES · Centro de Control Integral

Aplicación Streamlit conectada a Supabase para gestión de trabajadores, procesos, diferencias, archivos y auditoría.

## Mejoras de interfaz incluidas
- Diseño responsive con navegación lateral y jerarquía visual corporativa.
- Panel ejecutivo con indicadores consultados desde Supabase.
- Gráficos interactivos de tendencia de procesos y distribución de diferencias.
- Vistas de trabajadores, procesos, diferencias, archivos y auditoría.
- Filtros de búsqueda, descarga CSV de resultados y actualización manual.
- Acceso con Supabase Auth y permisos basados en perfiles.
- Mensajes de error que evitan mostrar detalles internos de la base de datos.

## Estado real
Esta es una versión de avance para revisión, no una declaración de producción lista. El dashboard consulta datos reales disponibles y muestra estados vacíos si todavía no existen registros. Los flujos completos de importación/conciliación, carga/descarga de archivos privados, pruebas de autorización por rol, respaldo y despliegue público siguen pendientes.

## Requisitos
- Python 3.10+
- Proyecto Supabase activo
- Usuario en Supabase Authentication con un perfil correspondiente en `public.user_profiles`

## Configuración local
1. Instala las dependencias: `pip install -r requirements.txt`.
2. Configura `SUPABASE_URL` y `SUPABASE_KEY` como variables de entorno o en `.streamlit/secrets.toml`.
3. Crea el usuario en Supabase Authentication.
4. Crea el perfil con el mismo UUID en `public.user_profiles`, con un rol permitido: `admin`, `operator` o `auditor`.
5. Ejecuta `streamlit run app.py`.

## Seguridad
- Nunca subas `.env` ni `.streamlit/secrets.toml` al repositorio.
- No incluyas claves service-role en la aplicación.
- Mantén RLS activado y prueba cada rol antes de cargar datos personales reales.
- La aplicación no debe considerarse lista para datos productivos hasta validar permisos, auditoría y flujos de importación.

## Despliegue
Supabase aporta autenticación y base de datos, pero no aloja directamente la interfaz Streamlit. La aplicación todavía necesita un hosting compatible con Python para disponer de una URL pública.