# SEYSES · Centro de Control Integral

Aplicación Streamlit conectada a Supabase para gestión de trabajadores, procesos, diferencias, archivos y auditoría.

## Versión web para Vercel

La rama `feat/vercel-nextjs-adaptacion` incluye una interfaz web inicial en Next.js para generar un deployment de vista previa en Vercel, manteniendo Supabase como backend. Consulta `VERCEL_DEPLOYMENT.md` para las variables de entorno y los pasos de configuración. Esta interfaz web todavía no sustituye todos los flujos Python: el extractor Previred y la conciliación deben migrarse y validarse antes de declarar paridad funcional o usar datos productivos.

## Mejoras de interfaz incluidas
- Diseño responsive con navegación lateral y jerarquía visual corporativa.
- Panel ejecutivo con indicadores consultados desde Supabase.
- Gráficos interactivos de tendencia de procesos y distribución de diferencias.
- Vistas de trabajadores, procesos, diferencias, archivos y auditoría.
- Analizador universal de asistencia: Excel/CSV, mapeo de columnas de ERP, combinación de hojas de detalle, períodos inclusivos, totalización por trabajador y carga reanudable por lotes hasta 150.000 filas.
- Extractor PDF de Previred con vista previa y descarga Excel; registra metadatos de trazabilidad sin guardar el PDF original en Storage.
- Flujo de importación y conciliación de Excel para nómina y accesos con vista previa, detección de RUT inválidos/duplicados, diferencias y confirmación explícita.
- Registro de proceso, hashes SHA-256 de los archivos fuente y metadatos en Supabase; los archivos originales no se almacenan en Storage en esta etapa.
- Protección contra la repetición automática de la misma pareja de archivos y clave única de RUT para evitar duplicar trabajadores.
- Filtros de búsqueda, descarga CSV de resultados y actualización manual.
- Acceso con Supabase Auth y permisos basados en perfiles.
- Mensajes de error que evitan mostrar detalles internos de la base de datos.

## Guía de módulos y datos
Consulta [`docs/GUIA_MODULOS_Y_DATOS_SEYSES.md`](docs/GUIA_MODULOS_Y_DATOS_SEYSES.md) para ver qué archivo necesita cada módulo, las columnas que reconoce el analizador y las limitaciones actuales de los adaptadores ERP.

## Estado real
Esta es una versión de avance para revisión, no una declaración de producción lista. El dashboard consulta datos reales disponibles y muestra estados vacíos si todavía no existen registros. La conciliación de nómina y accesos está implementada en la rama de trabajo, pero requiere una prueba funcional autenticada antes de usarse con información real. El analizador universal ha pasado TypeScript y build Next.js en GitHub Actions en el commit `53f01750`. Vercel sigue marcando `build-rate-limit` en el equipo, por lo que esta rama verificada aún no se considera publicada en Preview/producción hasta que Vercel marque `Ready`. El extractor PDF de Previred ya está disponible en el nuevo panel, pero requiere validación con muestras reales de formatos de Previred; PDF escaneados sin capa de texto pueden necesitar OCR. La carga/descarga de archivos privados mediante Supabase Storage, pruebas completas de autorización por rol, respaldos y despliegue público siguen pendientes.

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
4. Para el primer administrador, sigue `supabase/bootstrap_admin.sql.example` en el SQL Editor del proyecto SEYSES; reemplaza el UUID de ejemplo por el UUID real creado en Authentication. Para los siguientes usuarios, crea la cuenta en Authentication y registra su perfil con el mismo UUID en `public.user_profiles`; la pantalla Administración enlaza al panel de usuarios de Supabase, pero todavía no crea perfiles desde la propia aplicación.
5. Ejecuta `streamlit run app.py`.

## Seguridad
- `app_previred.py` quedó deshabilitado como punto de entrada de demostración; el extractor útil se conserva en `seyses_previred.py`. La entrada principal es `app.py`.
- Nunca subas `.env` ni `.streamlit/secrets.toml` al repositorio.
- No incluyas claves service-role en la aplicación.
- Mantén RLS activado y prueba cada rol antes de cargar datos personales reales.
- La aplicación no debe considerarse lista para datos productivos hasta validar permisos, auditoría y flujos de importación.

## Despliegue
Supabase aporta autenticación y base de datos, pero no aloja directamente la interfaz Streamlit. La aplicación original necesita un hosting compatible con Python; la interfaz Next.js de vista previa está documentada en `VERCEL_DEPLOYMENT.md`.
