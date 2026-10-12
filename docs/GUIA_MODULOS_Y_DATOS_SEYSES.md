# SEYSES — Guía de módulos y datos de entrada

## Estado de los datos y recuperación

SEYSES conserva el código de la aplicación Streamlit (app.py), los motores de importación y conciliación (seyses_imports.py), el extractor Previred (seyses_previred.py), las migraciones de base de datos y las pruebas Python. La interfaz Next.js para Vercel se mantiene en la rama feat/vercel-nextjs-adaptacion.

La base de datos SEYSES estaba inicialmente vacía de datos operativos. Las comprobaciones encontraron 0 trabajadores, 0 procesos, 0 diferencias y 0 archivos procesados; sí existían el perfil administrador y su evento de auditoría. No se insertan trabajadores ficticios ni se copian datos de otro proyecto. Para recuperar los datos operativos reales hace falta cargar los Excel/CSV/PDF originales o conectar su fuente autorizada.

## Módulos existentes en la web

| Módulo | Qué muestra o hace | Qué datos necesita |
|---|---|---|
| Resumen ejecutivo | Conteos de trabajadores, procesos, diferencias y archivos disponibles. | Se alimenta de las tablas operativas de SEYSES; no recibe archivos directamente. |
| Extractor Previred | Extrae datos previsionales y prepara una salida Excel en el motor Python. | PDF de Previred con texto seleccionable. PDF escaneado requiere OCR y validación adicional. La pantalla web Next.js todavía es informativa; el flujo operativo está en Python. |
| Importar y conciliar | Compara nómina con control de accesos, normaliza RUT y detecta ausencias/nombres discrepantes. | Dos Excel: nómina y control de accesos. Requiere RUT/RUN/documento; nombre y sucursal se reconocen si existen. AFP y salud son opcionales. La pantalla web todavía no ejecuta el motor Python. |
| Analizador universal de asistencia | Lee archivos Excel/CSV de varios ERP, permite mapear columnas, filtra un período inclusivo, totaliza horas por trabajador, turnos, horas extra y atrasos; permite exportar resumen CSV y guardar resultado/historial en Supabase. | Un Excel .xlsx/.xls o CSV; columnas mapeadas para fecha y al menos un identificador del trabajador (nombre, RUT/DNI o ID). El resto es opcional. |
| Trabajadores | Consulta el maestro normalizado de trabajadores. | Tabla workers: RUT, nombre, sucursal, AFP, salud, estados laborales y trazabilidad del proceso. Puede poblarse mediante nómina/conciliación autorizada. |
| Procesos | Consulta el historial de operaciones ejecutadas. | Tabla process_runs; cada importación web del analizador registra su proceso y cantidad de filas. |
| Diferencias | Consulta hallazgos pendientes de revisión. | Tabla discrepancies; las conciliaciones deben crear hallazgos cuando corresponda. El analizador calcula indicadores de diferencia en el proceso, pero todavía no genera automáticamente un caso individual de discrepancia por cada atraso u hora extra. |
| Archivos | Consulta metadatos y trazabilidad de archivos procesados. | Tabla processed_files: nombre, tipo, tamaño, checksum, estado y metadatos. En el analizador se guarda la trazabilidad, no el contenido original del archivo. |
| Auditoría | Consulta eventos de operaciones permitidos por rol. | Tabla audit_logs; el analizador registra las importaciones confirmadas. |
| Administración | Muestra el perfil y el rol activo. | Tabla user_profiles enlazada a Supabase Auth. Roles existentes: admin, operator y auditor. |

## Contrato de datos del Analizador universal

### Archivos admitidos actualmente
- Excel .xlsx, Excel antiguo .xls y CSV.
- Hasta 15 MB y 10.000 filas de datos por carga.
- Se procesa la primera hoja del libro Excel.
- Los archivos PDF, XML, JSON, conectores por API y descargas directas desde cada ERP aún necesitan un adaptador específico. No se afirma compatibilidad nativa con todos los ERP del mundo: se admite un formato genérico por mapeo de encabezados y se pueden añadir adaptadores para los formatos faltantes.

### Columnas y equivalencias

| Campo normalizado | Columnas habituales de origen | Requerido |
|---|---|---|
| Identificador de trabajador | RUT, RUN, DNI, documento, legajo, ID empleado, employee ID | Al menos un identificador: nombre, documento o ID. |
| Nombre del trabajador | Nombre, nombre completo, empleado, trabajador, colaborador, full name | No por sí solo si existe RUT o ID, aunque es muy recomendable. |
| Sucursal / sede | Sucursal, local, tienda, sede, branch, site, centro de costo | No |
| Fecha | Fecha, fecha asistencia, fecha turno, date, work date | Sí |
| Turno asignado | Turno, shift, jornada, código de turno | No |
| Inicio y fin planificados | Entrada/salida programada, scheduled start/end, inicio/fin turno | No; si se proporcionan, se calcula la jornada programada. |
| Entrada y salida reales | Marcación, hora ingreso/salida, punch in/out, check in/out | No; si no existe una columna totalizada de horas, sirven para calcular el tiempo transcurrido. |
| Horas trabajadas totalizadas | Horas trabajadas, total horas, worked hours, horas efectivas | No; tiene prioridad sobre el cálculo de entrada/salida. |
| Horas extra | Horas extra, HHEE, overtime | No; si faltan, se calcula el excedente solo cuando hay jornada planificada. |
| Colación / descanso | Colación, break, minutos de descanso | No; se descuenta si se calcula el tiempo desde marcaciones. |
| Estado / incidencia | Estado, asistencia, ausentismo, novedad, observación | No |

### Período y cálculos
- El usuario elige fecha inicial y final; ambas se incluyen. Para agosto, se selecciona el 1 de agosto al 31 de agosto del año correspondiente.
- Las filas fuera del período, sin fecha interpretable o sin identificador se excluyen del cálculo y se informan como observaciones.
- Las horas se totalizan por trabajador individual y sucursal si existe. Los turnos distintos se agrupan en el resumen.
- Las marcaciones que cruzan medianoche se calculan como turno nocturno. Si existe una columna de horas trabajadas, se utiliza ese total para evitar inferencias equivocadas.
- No se inventan turnos ni días de asistencia ausentes en el archivo. El resultado representa las filas exportadas por el ERP.
- Antes de guardar, el operador revisa el mapeo y pulsa Confirmar e importar.
- Se calcula SHA-256: volver a cargar exactamente el mismo archivo no duplica filas. La opción de reemplazo elimina importaciones previas del mismo usuario/ERP/período exacto; debe usarse solo cuando el nuevo archivo reemplaza ese conjunto de datos.

### Qué guarda el sistema
- Resumen de importación: archivo, ERP, período, conteo de filas, checksum, usuario y mapeo de columnas.
- Registros normalizados por trabajador y fecha: identificador, nombre, sucursal, turno, horas planificadas y reales, minutos trabajados, horas extra, atrasos y estado.
- Un registro en Procesos, un registro de metadatos en Archivos y un evento en Auditoría.
- Por privacidad, el contenido original del fichero no se almacena en Supabase Storage por esta versión; se conserva trazabilidad mediante nombre, tamaño, checksum y metadatos.

## Plantilla de ejemplo para ERP sin adaptador específico

Se puede crear una hoja Excel o CSV con estos encabezados:

RUT;Nombre trabajador;Sucursal;Fecha;Turno asignado;Inicio planificado;Fin planificado;Entrada real;Salida real;Horas trabajadas;Horas extra;Colación;Estado

Ejemplo ficticio de una fila: 12.345.678-5;Trabajador de prueba;Sucursal Centro;2026-08-01;AM;08:00;17:00;08:03;17:08;8:35;0:08;0:30;Presente.

Usa datos ficticios al probar y valida los totales contra el informe original del ERP antes de usar el análisis para nómina o decisiones laborales.

## Pendientes antes de producción

1. Probar el analizador con reportes reales anonimizados de cada ERP que utilice la organización y validar formatos/zonas horarias.
2. Añadir adaptadores específicos solo tras recibir una muestra de cada reporte de origen.
3. Probar permisos por rol y RLS de las tablas nuevas con cuentas de operador/auditor.
4. Completar la migración web del Extractor Previred y de Importar y conciliar; sus motores actuales siguen en Python.
5. Implementar un mecanismo de respaldo/importación de los datos históricos originales si están en otra ubicación. La base de datos vacía no permite reconstruir esos datos por sí sola.
