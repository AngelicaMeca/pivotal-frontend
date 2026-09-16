# Actualización automática de los tableros desde SharePoint

Los Excels de JC viven en el OneDrive de AUTOScraping: `Pivotal Repositorio/Bases de datos/`
(del OneDrive de fbattan). Los tableros se arman desde ahí **en cada publicación de Vercel**: nada
de lo generado se guarda en git y nadie tiene que correr nada en su computadora.

```
                     cada hora
SharePoint  <──── GitHub Actions ────> Deploy Hook de Vercel
    │           (¿cambiaron los Excels?)          │
    │                                             v
    └──────────────> compilación de Vercel: baja los Excels, corre el pipeline,
                     arma el sitio y publica la huella de lo que usó
```

- **En Vercel** (`npm run build` → `scripts/tableros.mjs`): baja los Excels de SharePoint
  (`pipeline/sharepoint.py`), corre el pipeline completo (`pipeline.cli build`) y compila el sitio.
  Publica en `/plataforma/estado-origen.json` la **huella** de los Excels que usó (nombre, tamaño y
  hash de cada uno). Si algo falla, Vercel no publica y queda en línea la versión anterior.
- **En GitHub** (`.github/workflows/tableros-datos.yml`, en la raíz del repo): cada hora compara
  SharePoint con la huella publicada. Si cambió algo, llama al Deploy Hook de Vercel. No toca el
  repo. Se puede disparar a mano desde Actions (con "forzar" publica aunque no haya cambios).
- Cualquier otra publicación del sitio (un cambio en la landing, por ejemplo) también vuelve a
  bajar los Excels: los tableros siempre salen de lo que hay en SharePoint en ese momento.

Qué Excels se bajan lo dice `configs/origen-sharepoint.yaml`. Una entrega nueva se suma ahí con
el nombre de su carpeta en SharePoint (una carpeta que ya se llame `entrega-NN` entra sola).

## Puesta en marcha (una sola vez)

### 1. Registrar la aplicación en Microsoft Entra (administrador de AUTOScraping)

1. Entrar a <https://entra.microsoft.com> → **Aplicaciones** → **Registros de aplicaciones** →
   **Nuevo registro**. Nombre: `Pivotal tableros`. Tipo de cuenta: solo este directorio. Sin URI
   de redirección.
2. En **Información general**, anotar el **Id. de aplicación (cliente)** y el
   **Id. de directorio (inquilino)**.
3. **Certificados y secretos** → **Nuevo secreto de cliente** → copiar el **Valor** (se ve una
   sola vez) y anotar la fecha de vencimiento.

### 2. Darle permiso de LECTURA solo sobre ese OneDrive

Opción recomendada (mínimo privilegio, `Sites.Selected`):

1. En la aplicación → **Permisos de API** → **Agregar un permiso** → **Microsoft Graph** →
   **Permisos de aplicación** → `Sites.Selected` → **Conceder consentimiento de administrador**.
2. Con [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer), iniciando sesión
   como administrador (necesita `Sites.FullControl.All`):
   - `GET https://graph.microsoft.com/v1.0/sites/autoscraping-my.sharepoint.com:/personal/fbattan_autoscraping_com?$select=id`
     → anotar el `id`.
   - `POST https://graph.microsoft.com/v1.0/sites/<id>/permissions` con el cuerpo:
     ```json
     {
       "roles": ["read"],
       "grantedToIdentities": [
         { "application": { "id": "<Id. de aplicación>", "displayName": "Pivotal tableros" } }
       ]
     }
     ```

Opción más simple pero más amplia: dar `Files.Read.All` y `Sites.Read.All` (permisos de
aplicación) con consentimiento de administrador. La aplicación podría leer TODOS los archivos de
la organización.

### 3. Vercel (proyecto `pivotal-frontend`)

1. **Settings → Environment Variables**: agregar `MS_TENANT_ID`, `MS_CLIENT_ID` y
   `MS_CLIENT_SECRET` (marcar Production y Preview; el secreto como *Sensitive*).
2. **Settings → Git → Deploy Hooks**: crear uno llamado `tableros` para la rama `main` y copiar
   la URL.
3. **Deployments** → último deploy → **Redeploy**. En el log de la compilación tienen que
   aparecer las líneas `[tableros]` y `[sharepoint] entrega-01: 27 archivos`.

### 4. GitHub (repo `pivotal-frontend`)

**Settings → Secrets and variables → Actions**:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `MS_TENANT_ID` | Id. de directorio (inquilino) |
| Secret | `MS_CLIENT_ID` | Id. de aplicación (cliente) |
| Secret | `MS_CLIENT_SECRET` | el valor del secreto de cliente |
| Secret | `VERCEL_DEPLOY_HOOK` | la URL del Deploy Hook |
| Variable | `SITIO_URL` | la dirección del sitio, sin barra final (ej. `https://pivotal-frontend-beta.vercel.app`) |

Después: **Actions** → "Tableros · datos desde SharePoint" → **Run workflow**. Tiene que decir
"los tableros publicados ya usan estos Excels".

## Cosas a tener en cuenta

- **El secreto de Microsoft vence.** Renovarlo antes de la fecha y actualizarlo en Vercel y en
  GitHub. Si vence, las publicaciones fallan (el sitio publicado sigue andando) y la tarea de
  GitHub marca error.
- **GitHub pausa las tareas programadas** de un repo sin actividad durante 60 días. Se reactiva
  desde la pestaña Actions.
- **Trazabilidad.** El manifiesto de cada entrega (`configs/entregas/`) y los hallazgos
  (`validations/hallazgos/`) se regeneran en cada compilación pero ya no se guardan solos en git.
  Lo que usa el sitio publicado está en `/plataforma/estado-origen.json`. Para dejar registro en
  el repo, correr el pipeline en una computadora (abajo) y subir esos dos archivos.
- **`raw/` sigue siendo de solo lectura:** solo se lee de SharePoint. Una corrección de JC es un
  Excel nuevo o una entrega nueva, nunca una edición silenciosa.
- **Las comparaciones reservadas (`_privado`) no se publican:** `scripts/tableros.mjs` las borra
  antes de compilar, así que una compilación con credenciales nunca las incluye. Para mirarlas,
  generar el contenido con `cd tableros && make build` y usar `npm run dev`.

## Correr el pipeline en una computadora

Para desarrollar, revisar `_privado` o dejar registro de una entrega. Con las mismas
credenciales en el entorno:

```bash
# desde la raiz del repo
MS_TENANT_ID=... MS_CLIENT_ID=... MS_CLIENT_SECRET=... npm run build   # igual que Vercel (sin _privado)
npm run dev                                                             # mirar en :3000
```

Sin credenciales, `npm run build` usa el contenido que ya esté generado en la computadora. Para
generarlo a partir de Excels locales: escribir su carpeta en `tableros/raw.local.txt` (ver
`raw/README.md`) y correr `cd tableros && make build`.

Para probar sin Microsoft, `pipeline/sharepoint.py` acepta `PIVOTAL_GRAPH_URL` y
`PIVOTAL_LOGIN_URL` apuntando a una simulación local; en uso normal no se definen.
