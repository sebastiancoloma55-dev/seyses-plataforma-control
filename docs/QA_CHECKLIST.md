# Lista de validación funcional de SEYSES

## Antes de iniciar
- [ ] Configurar SUPABASE_URL y SUPABASE_KEY en el entorno local o en .streamlit/secrets.toml.
- [ ] Crear una cuenta en Supabase Authentication.
- [ ] Ejecutar el procedimiento de supabase/bootstrap_admin.sql.example con el UUID de esa cuenta.
- [ ] Confirmar que el usuario tiene rol admin y active=true en public.user_profiles.
- [ ] No usar datos personales reales durante las primeras pruebas.

## Arranque local
1. Instalar dependencias con pip install -r requirements.txt.
2. Ejecutar streamlit run app.py.
3. Iniciar sesión con la cuenta de prueba.
4. Confirmar que se ven las secciones Resumen ejecutivo, Extractor Previred, Importar y conciliar, Trabajadores, Procesos, Diferencias, Archivos, Auditoría y Administración.

## Extractor Previred
- [ ] Probar un PDF de Previred con texto seleccionable y formato conocido.
- [ ] Revisar que la vista previa tenga trabajadores y montos razonables.
- [ ] Descargar el Excel y comprobar que abre y contiene la hoja Previred_Report.
- [ ] Probar un PDF escaneado o dañado y confirmar que muestra un aviso sin bloquear el resto de la aplicación.
- [ ] Verificar que el historial guarda solo metadatos y hash; el PDF original no se almacena en Storage.

## Conciliación nómina vs. accesos
- [ ] Usar dos archivos .xlsx de prueba con una columna RUT o RUN.
- [ ] Confirmar que RUT válidos se normalizan y RUT con dígito verificador incorrecto se descartan.
- [ ] Confirmar que RUT duplicados bloquean el guardado.
- [ ] Revisar casos: persona presente en ambos, persona sin acceso, registro de acceso fuera de nómina y nombre distinto.
- [ ] Descargar la vista previa CSV y revisarla.
- [ ] Confirmar el guardado una sola vez y comprobar proceso, trabajadores, diferencias y metadatos en Supabase.
- [ ] Intentar repetir la misma pareja de archivos; debe bloquear la segunda ejecución.
- [ ] Forzar un fallo de validación y comprobar que la transacción no deja registros parciales.

## Seguridad y roles
- [ ] admin: acceso a panel, carga, conciliación, resolución de diferencias y auditoría.
- [ ] operator: carga, conciliación y resolución de diferencias; sin acceso a auditoría.
- [ ] auditor: lectura y auditoría; sin cambios de datos.
- [ ] Cerrar sesión y confirmar que se borran de la sesión las vistas previas y archivos cargados.
- [ ] Confirmar que la tabla user_profiles, audit_logs, process_runs, processed_files, workers y discrepancies mantienen RLS activado.

## Criterio de aceptación
No cargar datos reales hasta completar las pruebas anteriores con una cuenta autenticada de cada rol y revisar la estructura real de los archivos de Previred utilizados por la organización.
