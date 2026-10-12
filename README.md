# SEYSES · Centro de Control Integral

Aplicación Streamlit conectada a Supabase para gestión de trabajadores, procesos, diferencias, archivos y auditoría.

## Mejoras de interfaz incluidas
- Diseño responsive con navegación lateral y jerarquía visual corporativa.
- Panel ejecutivo con indicadores consultados desde Supabase.
- Gráficos interactivos de tendencia de procesos y distribución de diferencias.
- Vistas de trabajadores, procesos, diferencias, archivos y auditoría.
- Extractor PDF de Previred con vista previa y descarga Excel; registra metadatos de trazabilidad sin guardar el PDF original en Storage.
- Flujo de importación y conciliación de Excel para nómina y accesos con vista previa, detección de RUT inválidos/duplicados, diferencias y confirmación explícita.
- Registro de proceso, hashes SHA-256 de los archivos fuente y metadatos en Supabase; los archivos originales no se almacenan en Storage en esta etapa.
- Protección contra la repetición automática de la misma pareja de archivos y clave única de RUT para evitar duplicar trabajadores.
- Filtros de búsqueda, descarga CSV de resultados y actualización manual.
- Acceso con Supabase Auth y permisos basados en perfiles.
- Mensajes de error que evitan mostrar detalles internos de la base de datos.

## Estado real
Esta es una versión de avance para revisión, no una declaración de producción lista. El dashboard consulta datos reales disponibles y muestra estados vacíos si todavía no existen registros. La conciliación de nómina y accesos está implementada en la rama de trabajo, pero requiere pasar CI y una prueba funcional autenticada antes de usarse con información real. El extractor PDF de Previred ya está disponible en el nuevo panel, pero requiere validación con muestras reales de formatos de Previred; PDF escaneados sin capa de texto pueden necesitar OCR. La carga/descarga de archivos privados mediante Supabase Storage, pruebas completas de autorización por rol, respaldos y despliegue público siguen pendientes.

## Requisitos
- Python 3.10+
- Proyecto Supabase activo
- Usuario en Supabase Authentication con un perfil correspondiente en `public.user_profiles`

## Pruebas automáticas

GitHub Actions compila los módulos Python y ejecuta pruebas unitarias del motor de conciliación en cada actualización de la rama y en solicitudes de integración.

## Configuración local
1. Instala las dependencias: `pip install -r requirements.txt`.
2. Configura `SUPABASE_URL` y `SUPABASE_KEY` como variables de entorno o en `.streamlit/secrets.toml`.
3. Crea el usuario en Supabase Authentication.
4. Crea el perfil con el mismo UUID en `public.user_profiles`, con un rol permitido: `admin`, `operator` o `auditor`.
5. Ejecuta `streamlit run app.py`.

## Seguridad
- No ejecutar `app_previred.py` como aplicación principal: es una interfaz heredada con usuarios y datos de demostración en memoria. La entrada de trabajo es `app.py`.
- Nunca subas `.env` ni `.streamlit/secrets.toml` al repositorio.
- No incluyas claves service-role en la aplicación.
- Mantén RLS activado y prueba cada rol antes de cargar datos personales reales.
- La aplicación no debe considerarse lista para datos productivos hasta validar permisos, auditoría y flujos de importación.

## Despliegue
Supabase aporta autenticación y base de datos, pero no aloja directamente la interfaz Streamlit. La aplicación todavía necesita un hosting compatible con Python para disponer de una URL pública.