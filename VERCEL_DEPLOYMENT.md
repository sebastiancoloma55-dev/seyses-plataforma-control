# SEYSES en Vercel (versión web inicial)

Esta rama agrega la interfaz Next.js para que Vercel pueda construir y servir SEYSES. La versión Streamlit y sus módulos Python originales se conservan.

## Variables de entorno

En Vercel, abre **Project → Settings → Environment Variables** y agrega:

- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto SEYSES `https://isddbsunqyksqisoqjmd.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave publicable/anon del proyecto SEYSES.

No agregues `service_role`, claves privadas ni archivos `.env` al repositorio. No uses las credenciales del proyecto Doctor Simi.

## Despliegue

1. Importa este repositorio en Vercel y selecciona la rama `feat/vercel-nextjs-adaptacion`.
2. Framework Preset: **Next.js**; Root Directory: `.`; Build Command: `npm run build`.
3. Configura las dos variables anteriores en Preview y Production.
4. Ejecuta el deployment Preview y prueba autenticación y acceso a los módulos con un usuario real de SEYSES.
5. No cambies el dominio de producción ni fusiones la rama hasta completar las pruebas.

## Estado de la migración

La autenticación usa Supabase Auth y exige un perfil activo en `public.user_profiles`. Las consultas se hacen con la clave publicable y dependen de las políticas RLS existentes.

La pantalla incluye el resumen y las consultas de trabajadores, procesos, diferencias, archivos y auditoría. El extractor Previred y la conciliación todavía dependen de los motores Python; en la web se muestran como pendientes y no se permite procesar ni guardar desde esas pantallas. Deben migrarse y probarse antes de declarar paridad funcional con Streamlit o usar datos productivos.
