---
name: reglas-password-globales-overrides
overview: Actualizar documentación, backend y Captain Console para gestionar reglas globales de complejidad de contraseña (SystemConfig) y overrides por usuario (Users.*Override), reutilizando la pestaña existente de “Sessioni” como “Regole Password”.
todos:
  - id: docs-conoscenze
    content: Actualizar `conoscenze.txt` con overrides en Users y nuevas keys en SystemConfig.
    status: pending
  - id: backend-users-get
    content: Ampliar SELECT de `GET /api/admin/users` para incluir 4 overrides y normalizar BIT->boolean/null.
    status: pending
  - id: backend-users-put
    content: Ampliar `PUT /api/admin/users/:id` con destructuring, inputs mssql y UPDATE de 4 columnas override.
    status: pending
  - id: ui-sidebar-view-impostazioni
    content: Añadir item en sidebar y nueva vista `view-impostazioni` con formulario de reglas globales.
    status: pending
  - id: ui-modal-regole-password
    content: Reemplazar tab `ump-ses` (antes Sessioni) por UI de overrides de password.
    status: pending
  - id: js-global-config
    content: Añadir `globalConfig`, cargar `/api/admin/config`, poblar vista y guardar con PUT.
    status: pending
  - id: js-user-overrides
    content: Poblar overrides en `openUserManager` y enviarlos en el PUT del botón `umpSaveSecBtn`.
    status: pending
isProject: false
---

## Alcance y principios

- Cambios **quirúrgicos** en 3 archivos: `[conoscenze.txt](c:\Users\depel\Documents\progetto\ujet\bobine\conoscenze.txt)`, `[serverbobine.js](c:\Users\depel\Documents\progetto\ujet\bobine\serverbobine.js)`, `[captain.html](c:\Users\depel\Documents\progetto\ujet\bobine\captain.html)`.
- Mantener endpoints existentes. Confirmado en `serverbobine.js` que **ya existen** `GET/PUT /api/admin/config` (líneas ~483+).
- En Captain Console, adaptar tus IDs/fragmentos a la estructura actual: el “tab Sessioni” es `button[data-tab="ump-ses"]` y su contenido es `div#ump-ses` (no existe `umpSectionSessioni`).

## 1) Documentación (`conoscenze.txt`)

- En `### 1.1 Tabella [dbo].[Users] (Il Passaporto)`, al final de la lista de campos, añadir exactamente el párrafo indicado:
  - `- **Eccezioni Regole Password (Overrides):** ...`
- En `### 2.3 Tabella [dbo].[SystemConfig]`, extender la línea `Valori:` añadiendo el texto:
  - `Nuove regole password: PwdMinLength, PwdRequireNumber, PwdRequireUpper, PwdRequireSpecial.`

## 2) Backend (`serverbobine.js`)

### 2A. GET `/api/admin/users`

- Modificar el `SELECT` dentro de la query de usuarios (actualmente termina en `ResetRequested as resetRequested`).
- Insertar **antes del `FROM`** los nuevos alias:
  - `PwdMinLengthOverride as pwdMinLengthOverride`
  - `PwdRequireNumberOverride as pwdRequireNumberOverride`
  - `PwdRequireUpperOverride as pwdRequireUpperOverride`
  - `PwdRequireSpecialOverride as pwdRequireSpecialOverride`
- Ajustar el `map` posterior si hiciera falta para normalizar bits a boolean (hoy solo normaliza `forcePwdChange` y `resetRequested`). Para los nuevos campos:
  - `pwdMinLengthOverride` queda numérico o `null`.
  - `pwdRequire*Override` convertirlos a `true/false/null` coherentes con lo que devuelve `mssql`.

### 2B. PUT `/api/admin/users/:id`

- Ampliar el destructuring de `req.body` (hoy: `{ name, barcode, password, forcePwdChange, pwdExpiryDaysOverride, defaultModuleId }`) para incluir:
  - `pwdMinLengthOverride, pwdRequireNumberOverride, pwdRequireUpperOverride, pwdRequireSpecialOverride`
- Añadir los `request.input` que pediste, usando estos nombres de parámetros (coinciden con el `UPDATE`):
  - `@pwdMinLength` (Int)
  - `@pwdReqNum` (Bit)
  - `@pwdReqUpp` (Bit)
  - `@pwdReqSpec` (Bit)
- Extender `updateQuery` para setear las 4 columnas override, manteniendo el resto intacto.

## 3) Captain Console UI (`captain.html`)

### 3A. Sidebar

- En `<nav class="sidebar-nav">`, insertar la nueva voz **Impostazioni** entre “Accessi” y “Profilo”, usando `data-target="impostazioni"`.
- Esto funcionará con el router ya existente que hace `view-` + `data-target`.

### 3B. Nueva vista global `Impostazioni`

- Añadir un nuevo bloque de vista dentro de `.content-area` con id `view-impostazioni` (en tu texto lo llamas `section-impostazioni`; aquí debe ser `view-impostazioni` para que el routing actual lo muestre):
  - Contendrá el card “Regole Globali Password” con inputs `globalPwdMinLength`, `globalPwdReqNum`, `globalPwdReqUpp`, `globalPwdReqSpec` y botón `saveGlobalConfigBtn`.
- Colocación: junto a las otras vistas (`view-utenti`, `view-moduli`, `view-audit`), antes del cierre del contenedor `.content-area`.

### 3C. Modal usuario: renombrar y reemplazar contenido del tab “Sessioni”

- Cambiar el texto del botón tab:
  - De `📡 2. Sessioni (Radar)` a `📡 2. Regole Password` (manteniendo `data-tab="ump-ses"`).
- Reemplazar el contenido de `div#ump-ses` por el bloque equivalente al que proporcionaste, adaptando IDs para que coincidan:
  - Checkbox `umpUseGlobalPwd` y panel `umpOverrideSettings`.
  - Inputs `umpPwdMinLen`, `umpPwdReqNum`, `umpPwdReqUpp`, `umpPwdReqSpec`.

## 4) Captain Console lógica JS (`captain.html`)

### 4A. Global config state

- Añadir al inicio del `<script>` principal:
  - `let globalConfig = [];`
- Añadir listener `DOMContentLoaded` para toggle de `umpOverrideSettings` cuando cambia `umpUseGlobalPwd` (idéntico a tu snippet).

### 4B. Cargar y guardar reglas globales

- En `loadData()`, al final, añadir fetch de config:
  - `fetch('/api/admin/config', { credentials: 'include' })`.
  - Guardar en `globalConfig` y llamar `populateGlobalConfigView()`.
- Añadir:
  - `function populateGlobalConfigView() { ... }`
  - `document.getElementById('saveGlobalConfigBtn').addEventListener('click', async () => { ... })`
- Nota: en el archivo ya existe `apiFetch('/admin/...')`; mantendremos tu implementación con `fetch('/api/admin/config')` para que sea literal y no invasiva.

### 4C. Población del modal usuario (overrides)

- En `openUserManager(id)`, después de localizar `const u = ...` y antes de abrir el panel, añadir la lógica:
  - Detectar `hasOverride` por `!= null` de cualquiera de los 4 campos.
  - Setear `umpUseGlobalPwd`, mostrar/ocultar `umpOverrideSettings`.
  - Poblar `umpPwdMinLen` ('' si null) y checkboxes (true solo si el override es `true`).

### 4D. Guardado usuario (enviar overrides)

- No existe `saveUser()` en este archivo; el guardado de seguridad se realiza en el listener de `umpSaveSecBtn` (PUT `/api/admin/users/:id`).
- Extender ese `body: JSON.stringify({ ... })` para incluir tu payload de overrides, usando el mismo criterio:
  - `const useGlobal = document.getElementById('umpUseGlobalPwd').checked;`
  - Enviar `null` si `useGlobal`, si no enviar:
    - `pwdMinLengthOverride` como string/number del input.
    - `pwdRequireNumberOverride`, `pwdRequireUpperOverride`, `pwdRequireSpecialOverride` como boolean.

## Verificación (sin cambios funcionales extra)

- Comprobar que:
  - `GET /api/admin/users` devuelve los 4 campos nuevos.
  - Abrir modal usuario refleja correctamente “Usa regole globali” vs “Eccezione attiva”.
  - Guardar usuario persiste `NULL` cuando se usan globales, o los valores cuando hay override.
  - Vista `Impostazioni` carga desde `/api/admin/config` y guarda con `PUT /api/admin/config`.

