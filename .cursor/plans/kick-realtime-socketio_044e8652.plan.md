---
name: kick-realtime-socketio
overview: Implementar expulsión (kick) en tiempo real con Socket.io, tocando únicamente los archivos indicados y añadiendo la dependencia necesaria.
todos:
  - id: dep-socketio
    content: "Asegurar dependencia: instalar `socket.io` (npm)."
    status: completed
  - id: html-include
    content: Insertar `<script src="/socket.io/socket.io.js"></script>` antes de `sicurezza.js` en `bobine.html` y `captain.html`.
    status: completed
  - id: backend-socketio
    content: Reemplazar el bloque final de `serverbobine.js` para crear `server`, instanciar `io` y manejar `register`/`kick_user`.
    status: completed
  - id: sicurezza-listener
    content: Insertar el bloque de escucha `force_logout` en `sicurezza.js` dentro de `initSecurity()` antes de `window.SecurityData = ...`.
    status: completed
  - id: captain-kick
    content: Sustituir el listener de `#umpKickBtn` en `captain.html` por la versión que emite `kick_user` vía Socket.io.
    status: completed
isProject: false
---

## Objetivo

Habilitar “kick” en tiempo real mediante WebSockets (Socket.io):

- El backend expone el cliente en `/socket.io/socket.io.js` y enruta eventos por “salas” por usuario.
- Los clientes se registran en su sala `user_<id>` y escuchan `force_logout`.
- Captain emite `kick_user` apuntando al `targetUserId`.

## Alcance (archivos permitidos)

- `[c:\Users\depel\Documents\progetto\ujet\bobine\bobine.html](c:\Users\depel\Documents\progetto\ujet\bobine\bobine.html)`
- `[c:\Users\depel\Documents\progetto\ujet\bobine\captain.html](c:\Users\depel\Documents\progetto\ujet\bobine\captain.html)`
- `[c:\Users\depel\Documents\progetto\ujet\bobine\serverbobine.js](c:\Users\depel\Documents\progetto\ujet\bobine\serverbobine.js)`
- `[c:\Users\depel\Documents\progetto\ujet\bobine\sicurezza.js](c:\Users\depel\Documents\progetto\ujet\bobine\sicurezza.js)`

## Cambios previstos

### 1) Frontend: incluir Socket.io client

- En `bobine.html`, en el `<head>`, insertar **justo antes** de `<script src="sicurezza.js"></script>` (actualmente en la línea 14):
  - `<script src="/socket.io/socket.io.js"></script>`
- En `captain.html`, en el `<head>`, insertar **justo antes** de `<script src="sicurezza.js"></script>` (actualmente en la línea 8):
  - `<script src="/socket.io/socket.io.js"></script>`

### 2) Backend: enganchar Socket.io al HTTPS server existente

- En `serverbobine.js`, al final del archivo, sustituir el bloque final actual:
  - desde `const PORT = 443;` hasta el `.listen(...)`
- Reemplazarlo por el bloque que indicas (incluye `const { Server } = require('socket.io');`, crea `server`, instancia `io`, maneja `register` y `kick_user`, y hace `server.listen(...)`).
- Nota: `https` ya está requerido antes en el archivo (cerca del final), así que el nuevo bloque lo reutiliza sin cambios.

### 3) Frontend: escucha pasiva de kick (Layer 2)

- En `sicurezza.js`, dentro de `initSecurity()`:
  - Después del bloque de verificación de permisos (RBAC) y **justo antes** de `window.SecurityData = { user: user };` (actualmente línea 48), insertar el bloque “REAL-TIME SECURITY (WEBSOCKETS)” que indicas.
  - Este bloque hará:
    - `const socket = io();`
    - derivar `userId` de `user.id || user.IDUser || user.IDOperator`
    - `socket.emit('register', userId)`
    - al recibir `force_logout`: `alert`, `POST /api/logout` con `credentials: 'include'` y redirección a `/`.

### 4) Captain: disparador de kick

- En `captain.html`, en el script final, localizar el listener actual:

```709:711:c:\Users\depel\Documents\progetto\ujet\bobine\captain.html
    document.getElementById('umpKickBtn').addEventListener('click', () => {
      alert("Funzionalità Kick in tempo reale in fase di sviluppo. Preparazione infrastruttura in corso.");
    });
```

- Sustituirlo completamente por el nuevo listener que indicas, incluyendo:
  - `let captainSocket = null;`
  - lectura de `targetId` desde `#umpUserId`
  - `confirm(...)`
  - inicialización lazy `captainSocket = io()`
  - `captainSocket.emit('kick_user', { targetUserId: targetId })`

## Dependencia (requisito previo)

- Como `socket.io` no está en `package.json` actual, ejecutar en la raíz del proyecto:
  - `npm install socket.io`

## Verificación rápida (manual)

- Abrir `bobine.html` en un navegador autenticado: el cliente debe conectarse y emitir `register`.
- Abrir `captain.html`, seleccionar un usuario (se rellena `#umpUserId`), pulsar “Kick Utente” y confirmar.
- En el dispositivo objetivo: aparece el `alert`, se invoca `/api/logout`, y navega a `/`.

## Riesgos/compatibilidad

- `io()` sin URL usa el mismo origen; funciona si `captain.html`/`bobine.html` se sirven desde el mismo host/puerto que `serverbobine.js`.
- La CORS de Socket.io queda abierta (`origin: "*"`) como en tu snippet; se mantendrá exactamente así por requisito.

