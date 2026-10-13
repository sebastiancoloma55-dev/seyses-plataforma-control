# Migración de SEYSES a Cloudflare Workers

## Estado y alcance

Esta migración está aislada en la rama `feat/cloudflare-migracion`. No cambia `main`, no borra el proyecto Vercel ni modifica Supabase. El despliegue está diseñado para ser manual después de validar la compilación.

La app web utiliza Next.js y Supabase. `@opennextjs/cloudflare` adapta Next.js para Cloudflare Workers y `wrangler.jsonc` define el Worker `seyses-plataforma-control`. El motor antiguo Python/Streamlit sigue dentro del repositorio, pero no se ejecuta automáticamente dentro del Worker. Los módulos Previred y conciliación que aún dependan de Python necesitan un servicio compatible con Python o migración adicional antes de considerarse paridad completa.

## Configuración de la cuenta

1. Crear/iniciar sesión en Cloudflare: https://dash.cloudflare.com/ y abrir **Workers & Pages**.
2. Activar un subdominio gratuito `workers.dev` si Cloudflare lo solicita. No hace falta comprar un dominio para hacer la primera prueba.
3. En Cloudflare, ir a **My Profile → API Tokens → Create Token**. Usar la plantilla **Edit Cloudflare Workers** si está disponible o crear un token limitado a la cuenta requerida con permiso para editar Workers Scripts. No utilizar una Global API Key.
4. Copiar el **Account ID** desde la página Overview de Workers & Pages.
5. En GitHub, abrir **Settings → Secrets and variables → Actions → New repository secret** y crear los dos secretos siguientes:
   - `CLOUDFLARE_API_TOKEN`: el token recién creado.
   - `CLOUDFLARE_ACCOUNT_ID`: el Account ID de Cloudflare.

No pegar tokens, claves privadas ni claves de servicio en el código, en incidencias ni en el chat.

## Validación y publicación manual

1. Esperar el resultado de **Actions → SEYSES Cloudflare validation** para la rama `feat/cloudflare-migracion`. Debe completar TypeScript y la compilación adaptada a Workers.
2. Solo si la validación termina correctamente y están configurados ambos secretos, abrir **Actions → Deploy SEYSES to Cloudflare Workers → Run workflow**.
3. En el selector de rama elegir exactamente `feat/cloudflare-migracion` y ejecutar. El workflow no despliega desde otras ramas.
4. En Cloudflare → Workers & Pages, abrir el Worker `seyses-plataforma-control` y probar la URL `workers.dev` que aparezca allí.

## Supabase y comprobaciones

El Worker seguirá llamando al proyecto Supabase de SEYSES existente. No hay que crear otra base de datos ni ejecutar de nuevo las migraciones por el simple cambio de hosting. Probar inicio/cierre de sesión, persistencia de sesión, rol administrador, filtros/lecturas y el flujo de importación con archivo de prueba no sensible. Confirmar las reglas de redirección de autenticación en Supabase si la URL pública cambia.

## Plan gratuito y límites

Cloudflare Workers tiene un plan gratuito con límites diarios y por ejecución que pueden cambiar; revisar https://developers.cloudflare.com/workers/platform/limits/ antes de uso intensivo. Una cuota de $0 no significa capacidad ilimitada. La compilación de esta rama no prueba por sí sola el despliegue live, la autorización real por rol ni la compatibilidad funcional de todos los módulos.

## Volver atrás

Mientras la versión nueva no haya superado las pruebas, se mantiene disponible el proyecto Vercel y las ramas actuales. No eliminar Vercel, no borrar secretos ni cambiar el dominio de producción hasta confirmar una prueba de extremo a extremo satisfactoria.

## Documentación oficial

- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://opennext.js.org/cloudflare/get-started
- https://developers.cloudflare.com/workers/platform/limits/
