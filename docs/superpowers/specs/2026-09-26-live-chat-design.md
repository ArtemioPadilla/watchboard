# Diseño: chat en vivo propio (Worker + Durable Objects)

**Estado:** Propuesto — pendiente de las decisiones del dueño (sección 14)
**Fecha:** 2026-09-26 (revisado el mismo día tras una revisión adversarial
de 42 hallazgos; registro al final, "Adversarial review log")
**Contexto:** decisión del dueño del 2026-09-25: construir un chat
**propio** dentro de la app, alojado en el worker de Cloudflare que ya
existe (`wrangler.toml`, `worker/index.ts`), con Durable Objects. Revierte
la exclusión de `2026-09-21-radio-layer-and-community-design.md:26-30` y
rechaza las dos opciones que recomendaba
`2026-09-24-live-comments-design.md` (enlace fuera y piloto de respuestas
de Bluesky). Este spec **no rehace** la investigación del 09-24
(alternativas, moderación, DSA, menores, RGPD, CSP, promesa de tiers): la
cita por sección y solo añade lo que cambia al pasar a alojar el
contenido.

## Resumen

Una **sala de chat por tracker** (`room = tracker:{slug}`), cada una un
Durable Object con almacenamiento SQLite y la API de WebSocket con
hibernación, servida desde el worker existente en un host nuevo
`chat.watchboard.dev`. Leer es anónimo; **escribir exige iniciar sesión**
(recomendado para el piloto: GitHub OAuth, con la audiencia limitada que
eso implica; P3). El panel es una superficie "Comunidad · sin verificar ·
no es una fuente" separada de todo dato con tier, colapsada, que no abre
ningún socket hasta que el lector la abre.

La moderación está diseñada para **una persona**: filtros deterministas
en el DO antes de publicar (insultos, datos personales, enlaces, spam),
límites de tasa por identidad y por sala, modo lento automático ante
picos, reportes de cualquier lector (aviso DSA art. 16), cola del dueño
en `chat.watchboard.dev/admin` y alertas sin contenido a
`TELEGRAM_ALERT_CHAT_ID`. Cuando nadie atiende, el sistema se degrada
hacia lo seguro: un reporte grave oculta al instante el mensaje
denunciado, y la sala pasa a solo-lectura si se acumulan varios sin
revisar (4.5).

Coste: **plan gratuito de Workers, techo duro de 0 USD** — en ese plan
una operación que excede el límite diario falla en vez de facturarse
(sección 7). Por debajo del límite de Cloudflare, el worker impone su
propio presupuesto por sala para que el chat nunca agote la cuota que
comparte con push y newsletter.

Cinco interruptores ordenados por velocidad, del modo de sala (segundos,
sin deploy) al apagado en el build del sitio (sección 8). Piloto en 1-2
trackers de baja polarización en horario atendido antes de tocar uno de
conflicto (sección 12).

## 1. Qué cambió desde el 09-21 y el 09-24

**La decisión.** El 09-24 dejó la reversión como P1 con tres salidas
(`2026-09-24-live-comments-design.md:735-739`); el dueño eligió la (c):
"chat propio (C), aceptando el papel de prestador de alojamiento". Las
recomendaciones B (Bluesky) y 0 (enlace fuera) quedan descartadas por
decisión, no por un defecto técnico nuevo.

**Lo que sigue valiendo del 09-24 y aquí se reutiliza tal cual:**

- La regla "los comentarios **no tienen tier**", ni siquiera Tier 4, y
  sus tres capas de separación visual, estructural y de ingestión
  (`2026-09-24-live-comments-design.md:169-246`). El 09-21 tenía razón en
  que un mensaje sería Tier 4 sin verificar; la respuesta es no darle
  tier y separarlo, no dejar de construir.
- El análisis de alternativas externas (giscus, Matrix, Supabase;
  `:248-371`), la lista de obligaciones DSA de un prestador de
  alojamiento (arts. 11, 12, 16, 17; `:344-347`, `:600-602`), menores
  (`:604-610`), contenido ilegal (`:612-617`) y la crítica a los hashes
  con sal pública (`:626-632`).
- El patrón de degradación honesta (`live-source.ts`: nunca "0
  mensajes" cuando en realidad falló la conexión; `:153-155`).
- El precedente de interruptor por variable de repo + `deploy.yml`
  (`:566-569`) y la imagen Docker apagada por defecto (`:636-639`).

**Lo que cambia al alojar el contenido:**

- Watchboard pasa a ser **prestador de alojamiento** (DSA) y
  **responsable de tratamiento** (RGPD) de mensajes e identificadores.
  Ya no hay "la vía de reporte es la de Bluesky" (`:589-593`): el aviso,
  la retirada, la declaración de motivos y la supresión son nuestros
  (sección 6).
- La moderación de primera línea ya no la hace una plataforma: la hacen
  los filtros del DO y el dueño (sección 4).
- Aparece un backend con estado, cuotas y despliegue propios: la clase
  de sistema donde un fallo silencioso es más probable.

**Hechos del código verificados el 2026-09-26 que condicionan el diseño:**

- El worker es `watchboard-push` en `push.watchboard.dev`
  (`wrangler.toml:4,9-11`), con un solo binding KV
  (`wrangler.toml:14-16`), cron cada 15 min (`:19-20`) y
  `compatibility_date = "2024-09-01"` (`:6`). Enruta por `pathname` en un
  `switch` (`worker/index.ts:65-92`) y fija el CORS a
  `https://watchboard.dev` (`worker/index.ts:32-37`). No tiene DO,
  WebSockets ni sesiones.
- **Ningún workflow despliega el worker**: `grep -rl wrangler .github/`
  no devuelve nada y `package.json` no incluye `wrangler` (solo
  `@cloudflare/workers-types`, `package.json:51`). El despliegue es
  manual desde el portátil del dueño.
- **Fallo silencioso vigente, ya reportado en el 09-24 (P9) y sin
  arreglar:** `push.watchboard.dev` sigue fuera de `connect-src` en
  `public/_headers:16` y `src/layouts/BaseLayout.astro:97`, mientras
  `src/lib/push-client.ts:6` y `src/pages/newsletter.astro:6` le hacen
  `fetch`. El test de CSP (`src/lib/live-layers.test.ts:76-93`) solo
  recorre `LIVE_LAYERS`, así que no lo ve.
- **Fallo silencioso nuevo:** `POST /newsletter/send` responde
  `ok: true` y "Newsletter queued for N subscribers" sin enviar nada
  (`worker/handlers/newsletter.ts:166-175`, "Placeholder … to be wired to
  email provider"). Consecuencia directa para este spec: **no existe
  proveedor de correo**, así que el login por enlace mágico no es
  "reutilizar lo que hay" (sección 9.4).
- Precedente de WebSocket en la CSP: `wss://stream.aisstream.io` está en
  ambos `connect-src` y registrado en `src/lib/live-layers.ts:158`;
  `scripts/lib/csp-hosts.ts:57` ya conoce el puerto por defecto de `wss`
  y `hostAllowed` exige esquema idéntico (`:88-89`), así que un
  `https://chat…` **no** cubre un `wss://chat…` en el test.
- `LiveLayerSpecSchema.renderer` solo admite
  `cesium|leaflet|both|globe-home` (`src/lib/live-layers.ts:35`).
- La página del tracker tiene un layout de escritorio
  (`src/pages/[tracker]/index.astro:97`) y uno móvil con
  `MobileTabShellLoader` (`:155`), cuyas pestañas son
  `['map', 'feed', 'data', 'intel']`
  (`src/components/islands/mobile/MobileTabShell.tsx:16`).
- El build solo recibe `PUBLIC_POSTHOG_*`
  (`.github/workflows/deploy.yml:119-120`) y `trackers/**` está en
  `paths-ignore` (`:20-21`).
- Locales `en`, `es`, `fr`, `pt` (`astro.config.mjs:15-16`), cadenas en
  `src/i18n/translations.ts`.

## 2. Objetivos y no-objetivos

### Objetivos

1. Un lector ve y escribe, dentro del tracker y en tiempo real, qué
   opina la gente sobre lo que está pasando, sin salir de la app.
2. Ningún mensaje puede confundirse con un dato con tier: separación
   visual, estructural y de ingestión del 09-24 §3, impuesta por tests.
3. Operable por una persona: el estado por defecto cuando el dueño no
   mira es seguro (modo lento, solo-lectura), no "abierto hasta que
   alguien se queje".
4. Obligaciones de prestador de alojamiento cubiertas antes de abrir la
   primera sala: aviso y acción, declaración de motivos, contacto,
   retención y supresión.
5. Coste acotado por diseño: 0 USD en el plan gratuito y un presupuesto
   interno que no deja al chat agotar la cuota del worker de push.
6. Sin rastreo: sin scripts ni iframes de terceros en el sitio, sin
   cookies en `watchboard.dev`; la única cookie es la de sesión,
   estrictamente necesaria, en `chat.watchboard.dev` y solo tras iniciar
   sesión.
7. Ningún fallo silencioso: cada estado (cerrado, límite diario, sin
   conexión, vacío) se ve distinto en la UI y tiene una alerta o un
   canario que lo detecta (`docs/silent-failure-patterns.md:49-67`).

### No-objetivos

- Mensajes privados, perfiles, avatares, seguidores, reacciones o
  "me gusta" (son vectores de acoso y de señal de popularidad que el
  09-24 §3.1 ya excluyó).
- Imágenes, archivos, audio o previsualización de enlaces.
- Hilos por evento en el piloto (sección 9.3; fase posterior).
- Traducción automática de mensajes.
- Moderación con LLM en el piloto (sección 4.2).
- Usar mensajes como candidatos, fuentes o contexto de cualquier
  pipeline (prohibido; 09-24 §3.3).
- Chat en la imagen Docker autoalojada (apagado por defecto; P10).
- Chat en la portada global.

## 3. Arquitectura

### 3.1 Topología

```
navegador (watchboard.dev, isla ChatPanel)
   │  wss://chat.watchboard.dev/room/{slug}      (lectura: anónima)
   │  https://chat.watchboard.dev/auth/*          (OAuth, cookie de sesión)
   │  https://chat.watchboard.dev/notice          (aviso DSA sin cuenta)
   ▼
Worker watchboard-push  ── enruta por hostname ──►  handlers push/newsletter (sin cambios)
   │ chat.watchboard.dev
   ├─► ChatRoom DO   idFromName("tracker:{slug}")   SQLite: mensajes, contadores
   └─► ChatMod  DO   idFromName("global")           SQLite: bans, reportes, decisiones, modo global
```

- **Mismo worker, host nuevo.** Por decisión del dueño el chat vive en
  el worker existente. Se añade una segunda ruta de dominio propio
  `chat.watchboard.dev` en `wrangler.toml:9-11` y el `fetch` de
  `worker/index.ts:59` despacha por `url.hostname` **antes** del
  `switch` de rutas actual, a un módulo aislado `worker/chat/`. Las
  rutas de push no cambian. Un host propio da cookie propia, CORS propio
  y un `connect-src` explícito, y permite apagar el chat sin tocar push
  (sección 8).
- **Dos clases de DO**, ambas SQLite (`new_sqlite_classes` en la
  migración de `wrangler.toml`): `ChatRoom` (una por tracker habilitado)
  y `ChatMod` (una sola: moderación global, bans, cola de reportes,
  registro de decisiones y el modo global). Sin D1 ni KV nuevos.
- **Solo SQLite:** en el plan gratuito "only Durable Objects with SQLite
  storage backend are available" (Cloudflare, *Durable Objects pricing*
  y *limits*, consultados el 2026-09-26). Límite: 10 GB por objeto, 5 GB
  por cuenta en Free (la página de *limits* da los 10 GB por objeto
  también para Free; releído el 2026-09-26).
- **Jurisdicción antes del primer objeto:** "Durable Objects do not
  currently change locations after they are created" (*Data location*,
  2026-09-26). Si el dueño quiere la jurisdicción UE
  (`env.NS.jurisdiction('eu')`), tiene que decirlo **antes** de que el
  paso 2 cree `ChatMod('global')`; todo `idFromName` pasa por un único
  módulo (`worker/chat/stubs.ts`) que la aplica (P6, revisión #24).
- `compatibility_date` pasa de `2024-09-01` (`wrangler.toml:6`) a una
  fecha actual verificada en el paso 0 (sección 12); el cambio se prueba
  contra push y newsletter, no solo contra el chat.

### 3.2 La sala: `ChatRoom`

- Acepta el WebSocket con `ctx.acceptWebSocket(server, [tags])`, la API
  con hibernación: "Billable Duration (GB-s) charges do not accrue
  during hibernation" (Cloudflare, *WebSockets best practices*). Los
  manejadores son `webSocketMessage` y `webSocketClose`.
- **Todo estado sobrevive a la hibernación o no existe:** el estado por
  conexión (uid, handle, rol, contadores de tasa) va en
  `serializeAttachment` (máx. 16 KiB); lo demás en SQLite. Sin
  `setTimeout`/`setInterval` en la sala: impiden hibernar (*WebSockets
  API*). El único temporizador es una `alarm` que se programa solo si
  hay mensajes retenidos que caducar o un modo lento que expirar.
- Lectura anónima: al conectar recibe `hello` con el modo de la sala y
  los últimos 100 mensajes visibles. Escritura: solo si el handshake
  trae una sesión válida (sección 3.6).
- Límites de sala (configurables, valores iniciales): 300 conexiones
  simultáneas, de las que como mucho 200 anónimas (las otras 100 quedan
  para lectores con sesión); 1.000 mensajes aceptados/día (provisional
  hasta medir filas por envío, 7.3). Al llegar al límite diario de
  mensajes la sala pasa a `readonly` con motivo `daily_budget` hasta las
  00:00 UTC. **No hay tope diario de conexiones:** un tope que cualquier
  script alcanza cierra la sala a todos hasta medianoche (revisión #4);
  el lector anónimo que excede el cupo concurrente recibe el historial y
  un cierre `4004` ("sala llena").
- **Sin `await` antes de escribir:** `onSend` comprueba modo, ban, tasa,
  duplicados y filtros con datos de la propia sala (términos, bans y modo
  global se copian a su SQLite y se sincronizan en cada conexión y
  alarma) para que dos tramas seguidas no pasen ambas los límites
  (revisión #6).
- **Registro de salas:** cada sala se registra en `ChatMod` la primera
  vez; supresión, bans y modo global llegan a todas las registradas,
  incluidas las quitadas de `CHAT_ROOMS` (revisión #7). Si una sala no
  puede sincronizar con `ChatMod`, rechaza escrituras hasta lograrlo
  (revisión #31).

### 3.3 Esquema SQLite

```sql
-- ChatRoom (revisado tras la revisión adversarial: cada consulta caliente tiene índice,
-- las tablas con clave de texto son WITHOUT ROWID, y no hay tabla `counters`)
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY,           -- monótono por sala (y creciente con ts)
  ts         INTEGER NOT NULL,              -- epoch ms, reloj del DO
  uid        TEXT    NOT NULL,              -- 'gh:{id}'; se vacía al suprimir
  handle     TEXT    NOT NULL,              -- copia al escribir; se vacía al suprimir
  body       TEXT    NOT NULL,              -- ≤ 500 caracteres tras normalizar
  body_hash  TEXT    NOT NULL,              -- FNV-1a síncrono, para el filtro de brigadas
  lang       TEXT,                          -- declarado por el cliente, informativo
  state      TEXT    NOT NULL CHECK (state IN ('visible','held','removed','deleted')),
  hold_code  TEXT,                          -- filtro o reporte que lo retuvo
  reason     TEXT,                          -- declaración de motivos visible para el autor
  reported   INTEGER NOT NULL DEFAULT 0,    -- hay un reporte abierto: la retención no lo borra
  nonce      TEXT    NOT NULL UNIQUE        -- idempotencia de reintentos
);
CREATE INDEX messages_uid  ON messages(uid, ts);
CREATE INDEX messages_hash ON messages(body_hash, ts);
CREATE TABLE holds    (msg_id INTEGER PRIMARY KEY, ts INTEGER, grave INTEGER);  -- solo retenidos: pequeña
CREATE TABLE evidence (msg_id INTEGER PRIMARY KEY, ts, uid, handle, body, saved_at);  -- texto bajo reporte abierto (6.2)
CREATE TABLE usage    (uid TEXT PRIMARY KEY, last, hour, hour_n, day, day_n, rep_hour, rep_n) WITHOUT ROWID;
CREATE TABLE room     (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID;   -- modo, global, términos, stats:<día>, sync
CREATE TABLE bans     (uid_hmac TEXT PRIMARY KEY, until INTEGER, ground TEXT) WITHOUT ROWID;

-- ChatMod
CREATE TABLE bans       (uid_hmac TEXT PRIMARY KEY, until INTEGER, ground TEXT, decision_id INTEGER) WITHOUT ROWID;
CREATE TABLE reports    (id INTEGER PRIMARY KEY, room TEXT, msg_id INTEGER, ts INTEGER,
                         category TEXT, reporter_uid_hmac TEXT, notice_json TEXT, status TEXT);
CREATE INDEX reports_msg ON reports(room, msg_id);  CREATE INDEX reports_open ON reports(status, ts);
CREATE TABLE decisions  (id INTEGER PRIMARY KEY, ts INTEGER, room TEXT, msg_id INTEGER,
                         action TEXT, ground TEXT, automated INTEGER, facts TEXT, facts_until INTEGER);
CREATE TABLE settings   (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID;  -- modo global, términos, huella de clave, contadores
CREATE TABLE users      (uid_hmac TEXT PRIMARY KEY, gen INTEGER, dismissed_reports INTEGER) WITHOUT ROWID;
CREATE TABLE rooms      (slug TEXT PRIMARY KEY, first_seen INTEGER) WITHOUT ROWID;      -- registro de salas
CREATE TABLE room_stats (slug TEXT PRIMARY KEY, at INTEGER, json TEXT) WITHOUT ROWID;  -- alimenta /health sin fan-out
```

El tipo TypeScript `ChatMessage` vive en `src/lib/community/` (el módulo
que el 09-24 §3.2 reservó), **fuera** de `src/lib/schemas.ts`, y no
tiene claves `tier`, `source`, `pole`, `contested` ni `media`
(test de separación, sección 11).

### 3.4 Protocolo del socket

JSON, validado en ambos extremos por un parser sin dependencias
(`src/lib/community/protocol.ts`, importado por el worker; desviación D2
del plan). Los parsers **ignoran las claves desconocidas** y construyen
su salida solo con los campos conocidos: un cliente viejo sigue
funcionando cuando el worker añade un campo, y ninguna clave inesperada
(`tier`, `source`…) entra al estado. `hello` lleva `v` (versión del
protocolo); el worker se despliega primero y nunca quita un campo en la
misma versión que deja de usarlo. Un socket que no recibe `hello` en
10 s cuenta como intento fallido (revisión #37).

| Dirección | Tipo | Campos |
|---|---|---|
| s→c | `hello` | `mode`, `modeReason`, `history[]`, `me?` (`handle`, `canWrite`, `cooldownMs`) |
| c→s | `send` | `body`, `nonce`, `lang?` |
| s→c | `ack` | `nonce`, `id`, `state` (`visible` o `held` + código) |
| s→c | `msg` | mensaje visible nuevo |
| s→c | `remove` | `id` (retirado o borrado por su autor) |
| c→s | `report` | `id`, `category` |
| c→s | `delete` | `id` (solo el autor) |
| s→c | `mode` | `open` \| `slow` \| `readonly` \| `closed`, motivo, `until?` |
| s→c | `err` | `code` estable (`rate_limited`, `too_long`, `banned`, `auth_required`, `daily_budget`, `room_full`, `chat_disabled`, …), `cooldownMs?`, y para `banned` `until` + `ground` |

**Rechazos explicados (revisión #35).** Un navegador no puede leer el
estado HTTP de un handshake fallido: todo lo ve como cierre 1006. Por eso
los rechazos que el worker conoce se entregan **dentro** de un WebSocket
aceptado — una trama `mode`/`err` y un cierre con código de aplicación —
y el cliente los muestra sin reintentar: `4002` cerrado, `4003` chat
apagado (palanca 3), `4004` sala llena, `4008` tramas malformadas
("recarga la página"), `1008` baneado; `4009` = sesión revocada en otro
dispositivo (reconecta al instante como lector). Solo las tramas
malformadas cuentan para el cierre; un `rate_limited` o un `readonly`
nunca cierran el socket, y el cliente desactiva el botón de enviar hasta
que caduca el `cooldownMs` que recibió (revisión #36).

Reglas anti-silencio del protocolo: el cliente muestra "enviando…" hasta
recibir `ack`, y el `ack` se emite **después** de escribir en SQLite (la
compuerta de salida del DO retiene la respuesta hasta que la escritura es
durable); un `send` sin `ack` en 10 s se marca "no enviado" con botón de
reintento que reutiliza el `nonce` (sin duplicados). Tamaño máximo de
trama aceptado: 4 KiB; más grande cierra el socket con código 1009.

### 3.5 Identidad

Leer no exige nada. Escribir y reportar desde el chat exigen identidad;
el aviso DSA formal no (sección 6.1). Comparativa completa en 9.4;
recomendación para el piloto, **a confirmar por el dueño (P3)**:

- **GitHub OAuth** como único proveedor del piloto. Ventajas concretas:
  no almacena correos ni contraseñas; la API da `created_at` de la
  cuenta, y el worker **rechaza la escritura a cuentas de menos de 30
  días** (el freno más barato contra brigadas de cuentas recién
  creadas); `/vote` ya lleva a los lectores a GitHub
  (`src/pages/vote.astro:60`). Coste reconocido: el 09-24 descartó
  giscus en parte porque el público general no tiene cuenta de GitHub
  (`2026-09-24-live-comments-design.md:278-279`); aquí GitHub solo da la
  identidad y el contenido es nuestro, pero la audiencia sigue sesgada.
- **Bluesky (OAuth de atproto)** como segundo proveedor en fase 3, si el
  piloto muestra que la barrera de GitHub importa. Más audiencia
  general, pero exige DPoP, metadatos de cliente publicados y refresco
  de tokens: más superficie que el piloto no necesita.
- **Handle visible:** el login de GitHub con prefijo de proveedor
  (`gh/octocat`); sin nombres elegidos libremente (evita suplantar a
  "Reuters" o "Watchboard"). Una lista de handles reservados
  (`watchboard`, `admin`, `mod`, nombres de fuentes de
  `realtime-sources.ts`) se rechaza aunque exista en GitHub.
- El handle del dueño lleva la marca "Watchboard (moderación)" en
  texto, nunca un color de tier.

### 3.6 Sesión y tokens

- Flujo: `chat.watchboard.dev/auth/github/start` → GitHub →
  `/auth/github/callback` (con `state` aleatorio en cookie de corta vida
  y PKCE). El worker pide `read:user` y nada más; descarta el token de
  GitHub en cuanto lee `id`, `login` y `created_at`.
- Emite una cookie `__Host-wb_chat` (`Secure; HttpOnly; SameSite=Lax;
  Path=/`, 30 días) con un token firmado HMAC-SHA256 con el secreto
  `CHAT_SESSION_KEY`: `{uid, handle, iat, exp, gen}`. Sin tabla de
  sesiones: la revocación es por `gen` y por rotación de
  `CHAT_SESSION_KEY` (cierra todas las sesiones). **Cerrar sesión
  siempre cierra en todos los dispositivos**: incrementa `gen` y
  `ChatMod` cierra con `4009` los sockets abiertos de ese usuario, porque
  un token copiado de 30 días seguiría valiendo (revisión #39). Un ban
  **no** revoca la sesión: el baneado sigue leyendo y ve el motivo y la
  fecha de fin (revisión #20).
- **`CHAT_BAN_KEY` no se rota nunca:** bans, historial de reportes y
  generaciones de sesión están indexados por `HMAC(CHAT_BAN_KEY, uid)`;
  rotarla levantaría todos los bans y resucitaría sesiones revocadas.
  `ChatMod` guarda su huella y, si cambia, ninguna identidad se acepta
  (se lee, no se escribe) y `/health` da `keyOk:false` (revisión #32).
- `watchboard.dev` y `chat.watchboard.dev` son el mismo *site*, así que
  la cookie viaja en el handshake del WebSocket sin cookies de terceros.
  En la imagen Docker (otro origen) sería de terceros y fallaría: una
  razón más para el apagado por defecto allí (P10).
- **Defensa contra secuestro de WebSocket entre sitios:** el upgrade
  exige `Origin` en una lista cerrada (`https://watchboard.dev` y, solo
  en dev, `http://localhost:4321`); cualquier otro recibe 403 antes de
  llegar al DO. Las rutas HTTP del chat tienen su propio CORS; no se
  toca el de push (`worker/index.ts:32-37`).
- La cookie de sesión es estrictamente necesaria para el servicio que
  el usuario pide (escribir); no requiere banner. Ninguna cookie en
  `watchboard.dev`.

### 3.7 Límites de tasa

Aplicados en el DO, contados en el `attachment` de la conexión (por
socket) y en `counters` (por identidad y por sala), así que sobreviven a
la hibernación:

| Ámbito | Límite inicial | Al superarlo |
|---|---|---|
| Identidad, ráfaga | 1 mensaje / 8 s (modo lento: 1 / 60 s) | `err rate_limited` con `cooldownMs` |
| Identidad, hora | 20 mensajes | ídem |
| Identidad, día (todas las salas) | 100 mensajes | ídem hasta 00:00 UTC |
| Identidad, reportes | 10 / hora | los siguientes se ignoran y se cuentan |
| Sala, minuto | 40 mensajes | modo `slow` automático 15 min + alerta |
| Sala, día | 1.000 mensajes (provisional, 7.3) | `readonly` motivo `daily_budget` |
| Sala, concurrencia | 300 sockets, ≤ 200 anónimos | `hello` + cierre `4004` |
| Conexión | 3 tramas **malformadas** seguidas | cierre `4008`; los rechazos por tasa o modo no cierran |
| Handshake | `Origin` válido, trama ≤ 4 KiB | 403 / 1009 |

El límite por IP no se implementa en el código (la IP no se guarda; 6.3).
La única regla de *rate limiting* que da el plan gratuito de Cloudflare
(consultado 2026-09-26) es **una** regla, con periodo de **10 s**,
bloqueo de **10 s** y solo el campo **ruta** (ni host ni bloqueos de
60 s): se usa, por IP, sobre `/room/`, `/notice` y `/auth/` (paso 4;
revisión #5). Frena ráfagas, **no** un script lento: el riesgo residual
sobre la cuota compartida con push se acepta en 7.2.

El cliente reconecta con backoff exponencial con *jitter* (1 s → 60 s)
y deja de intentar tras 10 fallos seguidos, mostrando "chat no
disponible": un bucle de reconexión en cada pestaña abierta es la forma
más rápida de agotar la cuota diaria (sección 7).

### 3.8 Retención

| Dato | Dónde | Retención |
|---|---|---|
| Mensaje visible | `ChatRoom.messages` | 30 días, luego borrado físico por la `alarm` diaria de la sala |
| Mensaje retenido por filtro | ídem, `state='held'` | 72 h si nadie lo revisa; luego queda como fila sin texto con su motivo automático ("No publicado: filtro X, decisión automatizada") hasta los 30 días, visible solo para su autor (revisión #20) |
| Mensaje retirado | ídem, cuerpo sustituido por `''` | fila de 30 días sin contenido; el motivo vive en `decisions` |
| Mensaje borrado por su autor | ídem | cuerpo vaciado al instante; si tenía un reporte abierto, el texto pasa a `evidence` hasta decidirlo (6.2) |
| Mensaje con reporte abierto | ídem, `reported=1` | la retención no lo borra mientras el reporte siga abierto |
| Evidencia (`evidence`) | `ChatRoom` | hasta la decisión; después se borra o pasa a `decisions.facts` |
| Reporte | `ChatMod.reports` | 6 meses |
| Decisión (declaración de motivos) | `ChatMod.decisions` | 6 meses; `facts` (texto preservado para la autoridad, P6) con su propio vencimiento `facts_until` |
| Ban | `ChatMod.bans` | hasta `until` (máx. 12 meses) |
| IP | ninguna | no se guarda |

Solo se cargan al conectar los últimos 100 mensajes visibles; no hay
paginación hacia atrás en el piloto. El historial no se expone por HTTP,
no se hornea en el build y no entra en Pagefind, RSS, `public/api/v1/`,
MCP ni video (09-24 §3.2).

## 4. Moderación

Principio: **post-moderación con retención automática**. La
pre-moderación de todo mensaje es imposible para una persona; la
post-moderación pura en un sitio de conflictos deja contenido ilegal a
la vista durante horas. Los filtros deciden entre publicar y retener; el
dueño decide todo lo demás.

### 4.1 Filtros automáticos (deterministas, en el DO, antes de publicar)

Orden de evaluación; el primero que dispara decide:

1. **Normalización:** NFKC, eliminación de caracteres de control y de
   anulación bidireccional (U+202A-202E, U+2066-2069), colapso de
   combinantes apilados ("zalgo"), recorte a 500 caracteres. Lo que el
   filtro ve es lo que se publica.
2. **Ban vigente** (caché de `ChatMod.bans` en la sala) → `err banned`.
3. **Duplicado:** el mismo cuerpo normalizado de la misma identidad en
   10 min, o de 3 identidades distintas en 5 min en la misma sala (señal
   de brigada coordinada) → rechazo / retención.
4. **Términos prohibidos:** lista por locale (en/es/fr/pt) de insultos y
   llamadas a la violencia, con variantes de ofuscación. Vive en
   `ChatMod.settings`, editable desde el panel de moderación sin deploy;
   **no** va en el repo público (publicarla enseña a esquivarla). →
   retención `slur`.
5. **Datos personales (doxxing):** teléfonos, correos, IBAN/tarjetas
   (Luhn), direcciones postales con número, coordenadas con ≥ 4
   decimales, matrículas → retención `pii`.
6. **Enlaces:** en el piloto, ningún enlace es clicable y **todo**
   mensaje con URL o dominio — incluidas las formas ofuscadas (`hxxp`,
   `t[.]me`, `ejemplo dot com`, `ejemplo . com`) — se retiene `link` para
   revisión. La regla anterior (retener solo si la cuenta tenía < 3
   mensajes aceptados) se esquivaba con tres líneas inocuas en 24 s
   (revisión #21). Los enlaces son el principal vector de spam y de
   material ilegal.
7. **Idioma:** las normas limitan la sala a los cuatro idiomas del sitio;
   un mensaje con ≥ 10 letras de las que más de la mitad no son de
   escritura latina se retiene `language`. Las listas de términos y el
   único moderador solo cubren en/es/fr/pt (revisión #23).
8. **Mayúsculas / repetición** excesivas → rechazo con mensaje, no
   retención.

**Fallo cerrado:** si la lista de términos no carga o su versión no es
la esperada, la sala pasa a `readonly` con motivo `filters_unavailable`
y se alerta. Un filtro que falla abierto es un fallo silencioso con
consecuencias legales.

Un mensaje retenido solo lo ve su autor, marcado "pendiente de
revisión"; caduca en 72 h si nadie lo revisa. El autor sabe que no se
publicó: nunca se le muestra como enviado.

### 4.2 Qué no hacen los filtros

No hay clasificador de toxicidad ni LLM en el piloto: enviar mensajes a
un tercero añade un encargado de tratamiento y un coste por mensaje.
Workers AI tiene modelos de clasificación de seguridad en la misma
cuenta; su cupo gratuito y su calidad en español/francés/portugués se
evalúan como fase posterior (P9), no se suponen.

### 4.3 Reportes de lectores

- Cada mensaje tiene "Reportar" (con sesión) con categorías: contenido
  ilegal, acoso u odio, datos personales, spam, desinformación
  peligrosa, otro.
- **Ocultación provisional:** un mensaje con reportes de 3 identidades
  distintas con cuenta de ≥ 30 días pasa a `held` hasta revisión. Para
  que los reportes no sean a su vez un arma de brigada: los reportes de
  identidades cuyos reportes previos el dueño desestimó ≥ 3 veces dejan
  de contar para la ocultación (siguen en la cola).
- **Reporte grave → se oculta el mensaje, no la sala (revisión #15):**
  un reporte "ilegal" o "datos personales" de un lector con sesión, o un
  aviso anónimo de tipo abuso sexual infantil, terrorismo o amenaza,
  retiene **ese** mensaje al instante (`grave_report`), restaurable si el
  reporte se desestima. Límites: los reportes del lector cuentan en su
  cupo de 10/hora; los avisos anónimos pueden retener como mucho 5
  mensajes por sala y hora (el resto se encola sin ocultar). Un aviso
  anónimo "ilegal (otro)" solo se encola.
- **Un reporte sobre un mensaje que no existe se rechaza** y no guarda
  nada; varios reportes del mismo mensaje generan una sola alerta.
- **"Sin objeto" (`moot`):** si el mensaje ya no está (lo borró su
  autor, se suprimió la cuenta o caducó), el dueño cierra los reportes
  como sin objeto, que no cuenta como desestimación contra quienes
  reportaron (revisión #16).
- Sin sesión: "Reportar" lleva al formulario de aviso DSA (6.1).

### 4.4 Herramientas del dueño

`chat.watchboard.dev/admin` — página servida por el propio worker (no
por el sitio estático, así no entra en `dist/` ni en la imagen Docker),
protegida por la sesión de GitHub con el `id` numérico del dueño en el
secreto `CHAT_ADMIN_IDS`. Diseñada para usarse desde el móvil:

- **Cola única** de todas las salas: reportes y retenidos, del más
  antiguo al más nuevo, con el mensaje, 5 mensajes de contexto y la
  edad de la cuenta. Acciones en un toque: publicar, retirar (con motivo
  de una lista cerrada → declaración de motivos automática, 6.1),
  retirar y banear (24 h / 7 d / 12 meses), desestimar reporte.
- **Modos:** por sala y global — `open`, `slow`, `readonly`, `closed`,
  con motivo y caducidad opcional. Efecto en segundos (sección 8).
- **Lista de términos:** editar, con versión.
- **Salud:** contadores del día contra el presupuesto (sección 7),
  conexiones actuales, edad del reporte más antiguo sin revisar.

**Alertas a `TELEGRAM_ALERT_CHAT_ID`** (canal privado de operaciones;
**nunca** `TELEGRAM_CHANNEL_ID`, que es público), enviadas por el
worker con un secreto propio. **Nunca incluyen el texto del mensaje** —
solo sala, categoría, recuento y enlace a `/admin` — para no copiar
contenido ilegal o datos personales a Telegram. Disparadores: reporte
grave (el primero de una sala sale al instante; los siguientes se
agrupan en una alerta con recuento cada 15 min, y los de terrorismo
llevan "URGENT"; revisión #18), cola con elemento > 2 h, modo lento
automático, presupuesto diario > 70 %, filtros no disponibles, cambio de
modo global. Las alertas no entregadas se cuentan tanto en las salas
como en `ChatMod`, y `ChatMod` comprueba cada hora, sin enviar nada
(`getMe` + `getChat`), que la copia del token de Telegram que tiene el
worker sigue valiendo; ambas cosas salen en `/health` y las vigila el
canario (revisión #33).

### 4.5 Plantilla realista del dueño

Una persona, sin guardias nocturnas. Por eso:

- **Horario atendido (propuesto para el piloto, P5):** escritura
  abierta solo en una franja diaria en la zona del dueño; fuera de ella
  la sala es `readonly` con el motivo visible ("el chat abre a las
  08:00"). Lo aplica una `alarm` de la sala, no una persona.
- **Degradación automática, por volumen:** el mensaje reportado como
  grave ya está oculto (4.3). La sala pasa sola a `readonly` solo si
  **3 o más** mensajes retenidos por reporte grave llevan > 60 min sin
  revisar, y vuelve a abrirse cuando bajan de 3. La versión anterior
  (un solo reporte de 60 min cerraba la sala) permitía a cualquiera, sin
  cuenta, silenciar una sala con un `curl` por noche mientras el
  contenido denunciado seguía visible (revisión #15). La comprobación
  se programa a los 60 min del reporte, no en la siguiente hora
  (revisión #8).
- **Presupuesto de tiempo:** el dueño anota minutos de moderación por
  día durante el piloto; es la métrica que decide si se amplía
  (sección 12).

## 5. Interfaz

### 5.1 Dónde vive

- **Escritorio:** un botón "Comunidad" junto al hero del tracker (tras
  `HeroKpiCombo`, `src/pages/[tracker]/index.astro:108`, sin intercalarse
  en KPIs ni timeline) que abre un **cajón lateral** a la derecha. No va
  al final de la página: el 09-24 ya mostró que ahí nadie lo ve
  (`2026-09-24-live-comments-design.md:180-188`).
- **Móvil:** quinta pestaña `chat` en `TAB_ORDER`
  (`src/components/islands/mobile/MobileTabShell.tsx:16`), al final; la
  pestaña inicial sigue siendo `feed` (`:60`).
- Solo en trackers con `community.chat: true` en `tracker.json` (campo
  nuevo en `TrackerConfigSchema`, bajo el bloque "Aggregation &
  community" de `src/lib/tracker-config.ts:178`), `status === 'active'`,
  y con `PUBLIC_CHAT_ENABLED` en el build (sección 8).
- **Isla `ChatPanel.tsx`** en `src/components/islands/community/`,
  `client:idle` para el botón; el código del panel y el socket se cargan
  solo al abrirlo. **Ningún WebSocket se abre al cargar la página.**
  Cerrar el cajón o pasar la pestaña a segundo plano (> 2 min,
  `visibilitychange`) cierra el socket.

### 5.2 Marcado como comunidad, no como dato

Se aplica íntegro el 09-24 §3.1 (`:178-208`), con estos añadidos para un
chat:

- Cabecera fija, no desplazable, en los 4 idiomas: "Comunidad · Chat de
  lectores · Sin verificar · No es una fuente de Watchboard", con enlace
  a las normas y al aviso legal.
- Marco con borde discontinuo y fondo neutro; tipografía de cuerpo;
  **prohibidos** dentro del panel: colores `--tier-*`, `--accent-red`,
  `--accent-amber`, `SourceStatusChip`, `.source-chip`,
  `.freshness-indicator` y la fuente monoespaciada de datos
  (`global.css:979-994`, citado en el 09-24). Lo impone un test.
- Orden estrictamente cronológico; sin recuentos de popularidad; sin
  contador de "N personas en línea" (invita a brigadas y es una señal
  de relevancia que no es un dato).
- Ningún mensaje se muestra fuera del panel: ni en el timeline, ni en
  el mapa, ni en el globo, ni en carrusel, broadcast, tarjetas o
  notificaciones push.
- Contenedor con `data-pagefind-ignore` (precedente:
  `src/pages/search.astro:21`), aunque el contenido nunca está en el
  HTML estático.

### 5.3 Estados visibles (ninguno se confunde con otro)

| Estado | Qué ve el lector |
|---|---|
| Conectando | "Conectando…" |
| Abierto, sin mensajes | "Aún no hay mensajes. Sé el primero en comentar." |
| Solo lectura (horario, presupuesto, moderación) | Motivo concreto y hora de reapertura si la hay ("En pausa: límite diario, vuelve a las 00:00 UTC") |
| Cerrado (dueño o global) | "El chat está cerrado." — sin historial (cierre `4002`) |
| Chat apagado (palanca 3) | "El chat no está disponible ahora." (cierre `4003`, sin reintentos) |
| Sala llena para lectores sin sesión | "Sala llena — mostrando los últimos mensajes" (cierre `4004`) |
| Versión antigua o tramas inválidas | "El chat necesita recargar la página." (cierre `4008`) |
| Baneado | "No puedes escribir hasta el {fecha}. Motivo: {fundamento}." + vía de recurso |
| Sin conexión tras reintentos | "No se pudo conectar al chat; mostrando lo último cargado" — nunca "0 mensajes" |
| Mensaje propio retenido | "Pendiente de revisión — solo tú lo ves" |
| Mensaje propio sin `ack` | "No enviado · Reintentar" |

### 5.4 i18n

- Todas las cadenas de UI, normas, motivos de modo, códigos de error y
  el aviso legal en `en`, `es`, `fr`, `pt` en `src/i18n/translations.ts`;
  `src/i18n/translations.test.ts` detecta claves faltantes.
- Una sala por tracker para todos los idiomas (no una por locale: con
  la audiencia esperada, dividir deja cuatro salas vacías; P4). Los
  mensajes no se traducen; el `lang` declarado se pone como atributo
  `lang` del elemento para lectores de pantalla.
- Las normas de la comunidad y el aviso legal completo viven dentro del
  panel en los 4 idiomas, porque `/about` solo existe en inglés
  (09-24 Paso 5, `:516-520`).

### 5.5 Accesibilidad

- Lista de mensajes con `role="log"` y `aria-live="polite"`; cuando
  llegan > 3 mensajes en 10 s, el anuncio se agrupa ("5 mensajes
  nuevos") para no saturar al lector de pantalla. Botón para pausar el
  desplazamiento automático.
- El cajón es un diálogo no modal con foco gestionado: al abrir, el
  foco va al campo de texto (con sesión) o al botón "Iniciar sesión";
  `Esc` lo cierra y devuelve el foco al botón. `aria-controls` enlaza
  botón y panel (precedente en el 09-24, `:509`).
- Contador de caracteres anunciado al acercarse al límite; errores con
  `role="alert"`.
- `prefers-reduced-motion`: sin animación de entrada de mensajes.
- Contraste AA en ambos temas; objetivos táctiles ≥ 44 px.

### 5.6 Móvil

- La pestaña `chat` ocupa la pantalla; el campo de texto se ancla sobre
  el teclado (`visualViewport`), sin desplazamiento horizontal.
- Mismas reglas de conexión: el socket se abre al entrar en la pestaña y
  se cierra al salir de ella más de 2 min.

## 6. Seguridad, privacidad y legal

Como en el 09-24 (`:545-546`), esto no es asesoría legal: lista lo que
el diseño hace y lo que el dueño debe confirmar (P6). La diferencia es
que ahora Watchboard **aloja** el contenido.

### 6.1 DSA (UE)

Reutiliza la lista de obligaciones del 09-24 (`:344-347`, `:600-602`) y
la concreta:

- **Puntos de contacto (arts. 11-12):** una dirección de correo
  publicada en el panel (4 idiomas) y en `/about`; P6 decide cuál.
- **Aviso y acción (art. 16):** `chat.watchboard.dev/notice`, accesible
  **sin cuenta**, con los campos que pide el artículo: explicación de por
  qué es ilegal, localización exacta (sala + id del mensaje, que el
  botón "Reportar" rellena), nombre y correo del notificante (opcionales
  para material de abuso sexual infantil) y declaración de buena fe. Acuse
  de recibo automático si hay correo… **que hoy no puede enviarse** (no
  hay proveedor, sección 1): el acuse se muestra en pantalla con un
  número de referencia y el correo queda como dependencia de P6. El
  formulario, sus errores, el acuse y la página de estado están en
  en/es/fr/pt (`?lang=` o `Accept-Language`).
- **Comunicación de la decisión al notificante (art. 16(5); revisión
  #19):** `chat.watchboard.dev/notice/status?ref=N` muestra, sin cuenta
  y sin el contenido, el estado del aviso (abierto, decidido,
  desestimado, sin objeto) y el fundamento y la fecha de la decisión. El
  acuse enlaza ahí.
- **El canal de aviso no se puede bloquear (revisión #18):** los avisos
  de abuso sexual infantil, terrorismo y amenaza no tienen tope; los de
  "ilegal (otro)" tienen tope por mensaje (3/hora) y total (30/hora); la
  protección contra inundaciones es la regla de Cloudflare por IP
  (3.7), no un contador global que un atacante llena.
- **Declaración de motivos (art. 17):** cada retirada o ban genera una
  fila en `ChatMod.decisions` (acción, fundamento — ilegal o normas —,
  hechos, si fue automatizada) y el autor la ve en el panel en el lugar
  del mensaje ("Retirado: datos personales de terceros · normas §3").
  Las retenciones automáticas también la generan con `automated=1`, y al
  caducar (72 h) dejan una fila sin texto con su motivo automático. Un
  ban llega con su fundamento y su fecha de fin, y el baneado los sigue
  viendo al volver. Cada declaración lleva una frase de recurso
  (art. 17(3)(f)): escribir al punto de contacto para pedir revisión, o
  acudir a los tribunales (revisión #20).
- **Amenaza a la vida o la seguridad (art. 18):** si un mensaje la
  sugiere, el dueño notifica a la autoridad competente; el procedimiento
  y el contacto van en el runbook (P6).
- **Obligaciones de plataformas en línea (arts. 19-28):** el art. 19
  exime a micro y pequeñas empresas de esa sección (sistema interno de
  reclamaciones, envío a la base de datos de transparencia, etc.). Si un
  proyecto personal encaja ahí es precisamente la pregunta legal de P6;
  el diseño no depende de la respuesta, porque `decisions` ya guarda lo
  necesario para cumplirlas si aplicaran.

### 6.2 Contenido ilegal, terrorismo y menores

- Material de abuso sexual infantil o propaganda terrorista: retirada
  inmediata, ban de 12 meses, notificación a la autoridad/línea de
  denuncia que fije P6. El contenido se **preserva** fuera de la sala
  solo si la ley lo exige para la autoridad, en `decisions.facts`, con
  plazo (`facts_until`, 6 meses); en ningún caso se copia a Telegram, al
  repo ni a logs.
- **La prueba no se puede destruir antes de revisarla (revisión #16):**
  un mensaje con un reporte abierto queda congelado. Si su autor lo
  borra, si suprime su cuenta o si caduca, desaparece de la vista pero su
  texto pasa a la tabla `evidence` de la sala hasta que el dueño decide;
  la retención nunca borra un mensaje con reporte abierto. Al decidir,
  "preservar" (P6) lo mueve a `decisions.facts`; si no, se borra. Es la
  excepción del RGPD art. 17(3)(b) y (e), registrada en el ADR. Una
  decisión sobre un mensaje que ya no está es "sin objeto" y no
  perjudica a quienes reportaron.

### 6.2 bis Contenido terrorista (Reglamento (UE) 2021/784, "TCO")

Ni este spec ni el del 09-24 lo trataban, y un chat de noticias de
conflictos es su caso más probable (revisión #17):

- **Órdenes de retirada (art. 3(3)):** el prestador debe retirar o
  bloquear el acceso al contenido **en una hora** desde que recibe la
  orden. **Punto de contacto (art. 15)** para recibirlas por medios
  electrónicos: la dirección de P6, que el dueño recibe en el móvil.
- **Camino de una hora con una persona:** abrir `/admin` en el móvil y
  retirar el mensaje; o poner la sala en `closed`, que ahora **no sirve
  historial** (bloquear el acceso cuenta); o la palanca 3 desde la app de
  GitHub (sección 8). El ensayo del paso 4 cronometra este camino.
- **Fuera del horario atendido** la sala está en `readonly`, que no
  oculta lo ya publicado: el riesgo se acepta para salas piloto de baja
  polarización y **no** para una sala de conflicto, que exigiría `closed`
  fuera de horario y un simulacro de una hora superado (sección 12).
- **Medidas específicas (art. 5)** si el servicio queda "expuesto" (dos o
  más órdenes firmes en 12 meses): fuera del alcance del piloto; si
  ocurre, el chat se apaga (palanca 3) y se replantea.
- Los avisos de tipo "terrorismo" ocultan el mensaje al instante (4.3) y
  su alerta va marcada como urgente.
- **Menores** (09-24 `:604-610`): GitHub exige 13 años; las normas del
  chat fijan una edad mínima (P7: 16 por coherencia con el art. 8 del
  RGPD en varios Estados, o 13 como GitHub). No se piden datos de edad.
  Sin mensajes privados, perfiles ni imágenes, que son los vectores de
  captación; el panel está colapsado y los mensajes no llevan medios.

### 6.3 RGPD

| Dato | Base legal | Retención | Notas |
|---|---|---|---|
| `uid` (id de GitHub), `handle` | ejecución del servicio pedido | mientras haya mensajes o sesión | se obtiene en el login |
| Texto del mensaje | ídem | 30 días (3.8) | |
| Reportes, decisiones | obligación legal (DSA) / interés legítimo | 6 meses | |
| `uid_hmac` de bans | interés legítimo (moderación) | ≤ 12 meses | HMAC con clave **secreta** del worker, a diferencia de la sal pública que el 09-24 rechazó (`:626-632`); no es reversible sin la clave |
| IP | — | no se guarda | el worker la ve en tránsito; *observability* es un ajuste **por worker**, así que queda desactivado para todo `watchboard-push`, push incluido (no puede apagarse solo para el host `chat.`; revisión #14) |

- **Supresión:** "Borrar mi cuenta" en el panel vacía todos los
  mensajes del `uid` en **todas las salas del registro** de `ChatMod`,
  incluidas las ya quitadas de `CHAT_ROOMS` (revisión #7); vacía también
  `handle` y el propio `uid` de cada fila (`gh:{id}` lleva a un perfil
  público de GitHub; revisión #25); revoca sus sesiones y cierra sus
  sockets; y confirma con el número de mensajes borrados, releído de
  SQLite. Si alguna sala no responde, la respuesta es un error que la
  nombra, nunca un éxito parcial. Se conservan decisiones y bans en los
  que aparezca, con su base legal, y el texto bajo reporte abierto (6.2).
- **Aviso de privacidad (art. 13; revisión #25):** el aviso legal del
  panel (4 idiomas) y `/about` nombran al responsable y su contacto (P6),
  cada plazo de conservación (mensajes 30 días, reportes y decisiones
  6 meses, bans hasta 12 meses), la base legal de cada uno y la
  transferencia a EE. UU. (Cloudflare, GitHub) con su mecanismo (Data
  Privacy Framework si ambos figuran en la lista oficial; si no,
  cláusulas contractuales tipo).
- **Acceso/portabilidad:** "Descargar mis mensajes" devuelve JSON de las
  salas habilitadas.
- **Encargados:** Cloudflare (alojamiento del worker y DO); GitHub
  (proveedor de identidad). Se declaran en `/about` junto a los
  destinatarios que ya figuran (OpenSky, Nominatim).
- **Región de datos:** los DO se crean cerca del primer cliente y no se
  mueven después; si el dueño quiere la jurisdicción UE, lo decide
  **antes del paso 2** (P6-jurisdicción), porque cambiarla después
  significa objetos nuevos y dejar huérfano el historial de moderación
  (revisión #24).

### 6.4 Seguridad de la aplicación

- Texto plano siempre: el cliente renderiza con nodos de texto, nunca
  `dangerouslySetInnerHTML`; el servidor además rechaza tramas no JSON.
- `Origin` estricto en el upgrade (3.6); cookie `__Host-`, `HttpOnly`,
  `SameSite=Lax`; OAuth con `state` y PKCE.
- `/admin` con la sesión del dueño **y** una comprobación de `Origin`
  en cada acción POST; CSP propia de la página de admin (`default-src
  'self'`).
- Secretos por `wrangler secret`: `CHAT_SESSION_KEY`, `CHAT_BAN_KEY`,
  `GITHUB_OAUTH_CLIENT_ID/SECRET`, `CHAT_ADMIN_IDS`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`. Nunca en `[vars]` de
  `wrangler.toml` (hoy solo `VAPID_SUBJECT`, `wrangler.toml:22-23`).
- El canario de credenciales (`.github/workflows/credential-canary.yml`)
  gana una comprobación del chat (sección 11.4).

### 6.5 CSP

- Añadir **`wss://chat.watchboard.dev`** (y `https://chat.watchboard.dev`
  para `/auth` y `/notice` si se llaman con `fetch`) a `connect-src` en
  `public/_headers:16` **y** `src/layouts/BaseLayout.astro:97`. La
  imagen Docker hereda el cambio vía `scripts/headers-to-nginx.ts`.
- Registrar el host en `LIVE_LAYERS` con un `renderer: 'panel'` nuevo
  (`src/lib/live-layers.ts:35`), excluido de mapa y globo, para que
  `src/lib/live-layers.test.ts:76-93` exija el host en ambas CSP. Como
  `hostAllowed` exige el mismo esquema (`scripts/lib/csp-hosts.ts`), la
  entrada `wss://` es obligatoria aunque exista la `https://`.
- En el mismo PR se añade `https://push.watchboard.dev` (el fallo de P9
  del 09-24) y se registra también, para que ningún host del worker
  vuelva a faltar en silencio.
- Sin Turnstile en el sitio: exigiría `script-src` y `frame-src
  https://challenges.cloudflare.com` (Cloudflare, *Turnstile CSP*), un
  script de terceros en cada página. Si hace falta anti-bots, se pone
  **solo** en `/notice` y `/auth/start`, páginas servidas por el worker
  con su propia CSP (P8).
- `/sources/` lista el chat en una sección "Comunidad (no es una
  fuente)", como propuso el 09-24 (`:224-227`).

## 7. Coste, límites y techo

### 7.1 Límites del plan gratuito (Cloudflare, consultado 2026-09-26)

| Recurso | Límite Free | Fuente |
|---|---|---|
| Peticiones a Workers | 100.000/día por cuenta; al superarlo, error 1027 | *Workers limits* |
| CPU por invocación | 10 ms | *Workers limits* |
| Peticiones a DO | 100.000/día | *Durable Objects pricing* |
| Duración de DO | 13.000 GB-s/día | ídem |
| Filas SQLite leídas / escritas | 5 M/día / 100.000/día | ídem |
| Almacenamiento SQLite | 5 GB por cuenta (10 GB por objeto) | *DO limits* |
| Mensajes WebSocket entrantes | cuentan como peticiones a razón 20:1 | *DO pricing* |
| Al superar un límite | "further operations of that type will fail with an error"; se reinicia a las 00:00 UTC | *DO pricing* |
| Backend | solo DO con SQLite en Free | *DO pricing / limits* |

Enlaces: `developers.cloudflare.com/durable-objects/platform/pricing/`,
`…/durable-objects/platform/limits/`, `…/workers/platform/limits/`,
`…/durable-objects/best-practices/websockets/`. Las cifras se vuelven a
comprobar en el paso 0 y se copian al ADR con su fecha.

### 7.2 El techo duro: 0 USD

En el plan gratuito, superar un límite **no factura**: la operación
falla. Por tanto el techo de coste es 0 USD mientras la cuenta siga en
Free, y el spec **no propone pasar a Workers Paid**. Si algún día se
propone, el ADR debe verificar el precio vigente y si Cloudflare ofrece
un tope de gasto o solo avisos de facturación; hasta entonces, "subir de
plan" no es una palanca de este diseño.

Ese techo tiene un coste propio: **la cuota de peticiones a Workers es
de la cuenta**, y el worker de push y newsletter la comparte. Si el chat
la agota, `push.watchboard.dev` también devuelve 1027 hasta las 00:00
UTC. De ahí el presupuesto interno.

**Lo que el presupuesto interno no puede hacer (revisiones #4, #27):** un
script anónimo que abre conexiones o pide `/health` gasta peticiones de
Worker y de DO **de la cuenta** aunque el chat las rechace; ningún
contador dentro del worker lo evita, porque la petición ya se ha
contado al llegar. Lo que hay: la regla gratuita de Cloudflare por IP
(3.7) frena ráfagas; `/health` responde desde caché (60 s) sin despertar
salas; el historial se sirve desde memoria a lectores anónimos; y la
palanca 3. Un script lento y distribuido **puede tumbar push hasta
medianoche**: es un riesgo aceptado del piloto, y el único aislamiento
completo es mover el chat a otra cuenta de Cloudflare (9.5).

### 7.3 Presupuesto interno (por debajo del de Cloudflare)

- **Salas permitidas:** el worker solo crea o abre DO para slugs de la
  variable `CHAT_ROOMS` (lista cerrada, fijada en el deploy del worker);
  cualquier otro nombre recibe 404 **antes** de `idFromName`. Sin esto,
  cualquiera podría crear DO arbitrarios y llenar el almacenamiento.
- **Máximo 5 salas** en Free. Un test de build falla si más de
  `CHAT_MAX_ROOMS = 5` trackers tienen `community.chat: true`.
- **Por sala y día:** 1.000 mensajes aceptados (3.2); al llegar,
  `readonly` con motivo `daily_budget`. Las conexiones no tienen tope
  diario (3.2) sino tope concurrente.

Por qué esos números, en el peor caso (5 salas al máximo). **Corregido
tras la revisión adversarial (#2, #3, #26):** la tabla anterior
suponía lecturas indexadas que el código no tenía (el filtro de brigadas
recorría toda la tabla en cada envío: 300 envíos × 9.000 filas ≈ 2,7 M
filas leídas por sala y día solo en el piloto) y contaba ~5 filas
escritas por mensaje cuando eran 12-15 ("every row update of an index
counts as an additional row", *SQLite storage API*). Con el esquema de
3.3 las cifras son estimaciones **provisionales**; el paso 2 mide
`cursor.rowsRead`/`rowsWritten` por envío y por conexión en un test con
10.000 filas y copia los valores medidos al ADR, bajando
`roomMsgsPerDay` si el peor caso supera el 70 %.

| Recurso | Cálculo del peor caso | Uso | % del límite |
|---|---|---|---|
| Peticiones Worker | conexiones de lectores legítimos (≈ 5 × 5.000) + push (~200); sin tope frente a un script (7.2) | ~25.200 | 25 % (legítimo) |
| Peticiones DO | 25.000 conexiones + 5.000 mensajes / 20 + ~500 a `ChatMod` (reportes, sincronización, alarmas horarias) | ~25.800 | 26 % |
| Filas leídas | conexiones: historial desde memoria con la sala despierta (≈ 5 filas), ~110 en frío; envíos ≤ 150 (test) | < 1 M | < 20 % |
| Filas escritas | 5.000 mensajes × ~6 (fila + 3 entradas de índice + uso + estadística) + retención (borrar un mensaje ≈ 4 filas) ≈ 30.000 + 20.000 + `ChatMod` ≈ 5.000 | ~55.000 | 55 % |
| Duración | 5.000 despertares × ~10 s despierta × 0,125 GB | ~6.300 GB-s | 48 % |

La duración es el recurso más justo: **una sala con un mensaje cada
pocos segundos no hiberna nunca** y consumiría ~10.800 GB-s/día sola
(86.400 s × 0,125 GB). El límite de 40 mensajes/minuto y de 1.000/día
por sala es lo que lo acota; el tiempo que un DO tarda en hibernar tras
quedar inactivo y la memoria facturada se verifican en el paso 0 y, si
difieren, se recalculan estas cifras antes de abrir salas. Las filas
escritas son el segundo recurso (y el que antes se subestimaba): si se
agotan, **toda** escritura de DO falla, incluidos reportes, decisiones
y avisos DSA, así que el presupuesto interno se fija con el valor
medido y margen para `ChatMod`.

Piloto realista (2 salas, 1.000 aperturas y 300 mensajes al día cada
una): ~6.000 filas escritas con la retención en régimen (6 %), < 0,5 M filas leídas (< 10 %),
< 5 % de peticiones.

### 7.4 Observabilidad del presupuesto

- Cada sala guarda sus contadores del día en `counters`; `ChatMod`
  agrega bajo demanda en `/admin/health` (autenticado).
- Alerta a `TELEGRAM_ALERT_CHAT_ID` al 70 % de cualquier presupuesto de
  sala, y cuando el cliente recibe 1027 o un error de cuota (el canario
  lo detecta, 11.4).
- El panel muestra "Chat en pausa: límite diario alcanzado, vuelve a las
  00:00 UTC" — nunca un panel vacío que parezca una sala sin actividad.

## 8. Interruptores (kill switch)

Del más rápido y estrecho al más lento y amplio. Cada uno tiene un
estado visible distinto en el panel (5.3) y se ensaya con cronómetro
antes del piloto (sección 12).

| # | Palanca | Cómo | Efecto | Tiempo |
|---|---|---|---|---|
| 1 | Modo de sala | `/admin` → `slow`/`readonly`/`closed` | la sala emite `mode` a todos los sockets y rechaza `send` | segundos, sin deploy |
| 2 | Modo global | `/admin` → global `closed` | `ChatMod` guarda el modo; el worker lo consulta en cada upgrade (caché de 30 s) y las salas despiertas reciben `mode` por *fan-out* | segundos, sin deploy |
| 3 | Apagado de las salas | desde el móvil: app de GitHub → workflow `chat-kill-switch.yml` con `enabled=false` (verifica por valor en `/health`); de reserva, `wrangler secret put CHAT_ENABLED` = `false` desde el portátil | las salas rechazan con cierre `4003` **antes** de tocar cualquier DO y nadie nuevo inicia sesión; `/admin`, `/notice`, `/me/*` y `/health` **siguen** funcionando para moderar, recibir avisos y atender supresiones durante el incidente (revisión #30); push sigue funcionando | 1-2 min |
| 4 | Panel fuera del sitio | `gh variable set PUBLIC_CHAT_ENABLED --body false && gh workflow run deploy.yml` | el build no monta el botón ni la pestaña | minutos (build + Pages) |
| 5 | Nuclear | primero `gh workflow disable deploy-worker.yml`, luego Cloudflare: quitar el dominio `chat.watchboard.dev`; después, un PR que quita la ruta de `wrangler.toml` antes de reactivar el workflow | nada responde en `chat.`; push intacto. Sin el primer paso, el siguiente despliegue vuelve a enganchar el dominio (`custom_domain = true`; revisión #11) | minutos, manual |

Notas:

- La palanca 4 exige cablear `PUBLIC_CHAT_ENABLED` en `deploy.yml`, que
  hoy solo pasa `PUBLIC_POSTHOG_*` (`.github/workflows/deploy.yml:119-120`),
  y en el `Dockerfile` como `ARG` con valor por defecto `false`. Mismo
  patrón que propuso el 09-24 (`:566-569`, `:636-639`), con un test de
  texto sobre `deploy.yml`.
- La palanca 3 es la de emergencia real: no depende de que el código
  del DO funcione. Si el apagado de las palancas 1-2 falla (bug en
  `ChatMod`), la 3 sigue funcionando.
- Apagar por tracker: al instante, `/admin` → esa sala → `closed`
  (palanca 1, desde el móvil); después quitar el slug de `CHAT_ROOMS`
  (PR + `deploy-worker.yml`) y `community.chat: false` en su
  `tracker.json` + `gh workflow run deploy.yml` (un merge en
  `trackers/**` no despliega: `deploy.yml:20-21`). La sala sigue en el
  registro de `ChatMod`, así que supresiones, bans y retención la
  alcanzan hasta que sus datos caduquen.
- Cada palanca va acompañada de `gh variable set CHAT_EXPECTED_ENABLED`
  con el estado buscado: el canario compara `/health` con esa variable y
  falla si difieren, así que un chat apagado por accidente (secreto
  perdido en un redespliegue) no pasa por "apagado a propósito"
  (revisiones #12, #34).
- Un despliegue cuyo smoke falla hace `wrangler rollback` y verifica
  push de nuevo; un job rojo no basta (revisión #11).
- Ningún interruptor borra datos. Borrar el historial de una sala es una
  acción aparte en `/admin`, con confirmación.
- El runbook (`docs/runbooks/chat.md`, nuevo) lista las cinco con los
  comandos exactos; el ADR enlaza al runbook.

## 9. Alternativas dentro de la opción propia

Las alternativas externas (giscus, Matrix, Supabase, Bluesky) están en
el 09-24 §4 (`:248-371`) y no se repiten. Aquí solo las decisiones
internas a "chat propio en el worker".

### 9.1 Transporte: WebSocket con hibernación vs polling vs SSE

| Opción | A favor | En contra | Decisión |
|---|---|---|---|
| **WebSocket + hibernación** | tiempo real; una conexión por lector; sin duración facturada mientras la sala duerme; un mensaje entrante cuenta 1/20 de petición | exige `wss://` en CSP y en el test; más estados de UI (reconexión) | **elegida** |
| Polling HTTP (cada 10-15 s, solo con panel abierto) | sin sockets; encaja con `useLiveSource` y su stale-on-error | cada sondeo es una petición Worker **y** DO: 300 lectores × 4/min = 72.000/h, agota los 100.000/día en ~80 min; latencia visible en un "chat" | descartada por cuota |
| Server-Sent Events | unidireccional, simple | la conexión abierta mantiene el DO despierto (sin hibernación para SSE) → duración facturada continua; escribir sigue exigiendo HTTP | descartada por duración |

El polling sí se usa en un caso: `/admin/health`, que el dueño consulta a
mano.

### 9.2 Almacenamiento: SQLite en el DO vs D1 vs KV

- **SQLite en el DO (elegida):** estado y mensajes en el mismo objeto
  que serializa las escrituras de la sala; sin viaje de red extra; único
  backend de DO disponible en Free (7.1).
- **D1** (lo que proponía el 09-24 opción C, `:338-341`): consultas
  entre salas más fáciles (supresión, exportación), pero añade otra
  cuota diaria, otro binding y un viaje por mensaje. La supresión entre
  salas se resuelve con *fan-out* desde `ChatMod` a ≤ 5 salas (6.3).
- **KV:** consistencia eventual y 1.000 escrituras/día en Free; no sirve
  para mensajes. El KV existente (`wrangler.toml:14-16`) no se toca.

### 9.3 Salas: por tracker vs por evento vs por día

- **Por tracker (elegida para el piloto):** `tracker:{slug}`; número de
  salas acotado por `CHAT_ROOMS` (≤ 5) y predecible para el presupuesto.
- **Por evento** (hilo bajo cada evento del timeline): más contexto,
  pero multiplica salas (cientos por tracker), rompe el techo de 7.3,
  acerca el comentario al dato (el timeline es la superficie con tier
  que más hay que proteger, 09-24 §3.1) y dispersa una audiencia que el
  09-24 midió casi nula (97 de 100 posts de Bluesky sin respuestas,
  `:398`). Fase posterior, y solo como *referencia* a un evento
  ("sobre: {título}") dentro de la sala del tracker, no como sala propia.
- **Por día** (`tracker:fecha`, la del 09-24 opción C): limpia la sala a
  diario pero vacía el historial justo cuando la audiencia es escasa. La
  retención de 30 días (3.8) consigue el mismo efecto de higiene.

### 9.4 Identidad

| Opción | Barrera | Anti-abuso | Datos que guardamos | Coste de construir | Decisión |
|---|---|---|---|---|---|
| Handle anónimo sin cuenta | ninguna | casi nulo: evasión de ban con recargar; exigiría límite por IP (que no guardamos) y Turnstile (script de terceros, 6.5) | ninguno | bajo | **descartada** para escribir en un sitio de conflictos |
| **GitHub OAuth** | cuenta de GitHub | edad de cuenta (≥ 30 días), ban por id estable | id, login | bajo (OAuth 2 + PKCE) | **piloto** (P3) |
| Bluesky OAuth (atproto) | cuenta de Bluesky | edad de cuenta y etiquetas de moderación de Bluesky disponibles | DID, handle | medio-alto (DPoP, metadatos de cliente, refresco) | fase 3 |
| Enlace mágico por correo | un correo | débil (correos desechables) salvo lista de bloqueo de dominios | **correo** (dato personal más sensible, filtrable) | alto: **no hay proveedor de correo** (`worker/handlers/newsletter.ts:166-175`) y habría que añadir uno como encargado | descartada |
| Google/Apple | cuenta común | bueno | id, a menudo correo | medio; más encargados | no en el piloto |

Leer siempre es anónimo. La elección de GitHub reconoce el sesgo de
audiencia que el 09-24 señaló para giscus (`:278-279`); el piloto mide
si importa (métrica "intentos de iniciar sesión abandonados" contada en
el propio worker, sin PostHog).

### 9.5 Mismo worker vs worker separado

El dueño eligió el worker existente. La alternativa (un
`watchboard-chat` aparte) aislaría la cuota **solo si** fuera en otra
cuenta, porque el límite de peticiones es por cuenta (7.2). En la misma
cuenta el aislamiento real lo dan el host propio, `CHAT_ENABLED`
(palanca 3) y el presupuesto interno. Coste aceptado: un deploy del chat
redepliega push; por eso el paso 0 añade un smoke de push al workflow de
despliegue (sección 12).

### 9.6 Moderación: pre, post o con retención

- Pre-moderación total: imposible para una persona; el chat moriría.
- Post-moderación pura: contenido ilegal visible horas.
- **Post-moderación con retención automática (elegida, sección 4):** los
  filtros deterministas retienen lo probable; el dueño revisa lo
  retenido y lo reportado; sin atención, lo denunciado como grave queda
  oculto y, si se acumula, la sala se degrada a `readonly` (4.5).
- Clasificador LLM o Workers AI: fase posterior (P9), no supuesto.

## 10. Riesgos

Se heredan del 09-24 §8 (`:650-667`) los riesgos de "un comentario se
lee como dato", "panel vacío que parece roto", "CSP olvidada" y
"presión para subir comentarios a datos", con las mismas mitigaciones.
Nuevos o agravados por alojar el contenido:

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Brigada coordinada en un tracker de conflicto (cuentas de GitHub envejecidas, mensajes casi idénticos) | Media | Alto | edad de cuenta ≥ 30 días; filtro de duplicados entre identidades (4.1.3); modo lento automático a 40/min; piloto sin trackers de conflicto (sección 12) |
| Contenido ilegal o doxxing visible fuera del horario del dueño | Media | Alto: responsabilidad como prestador | horario atendido (4.5); filtro `pii`, todos los enlaces retenidos; un reporte grave oculta el mensaje al instante; `readonly` por volumen (4.5) |
| Los filtros fallan abiertos (lista de términos vacía tras un deploy) | Baja | Alto | fallo cerrado → `readonly` + alerta (4.1); test que cuenta términos cargados > 0 |
| El chat agota la cuota de la cuenta y tumba push/newsletter | Media en un pico | Medio | presupuesto interno por sala (7.3); `CHAT_ENABLED` (palanca 3); alerta al 70 % |
| Bucle de reconexión de muchas pestañas | Media | Medio | backoff con jitter y abandono tras 10 fallos (3.7); socket cerrado en segundo plano (5.1) |
| Una sala que nunca hiberna quema la duración diaria | Media | Medio | tope de mensajes por sala; sin temporizadores en el DO (3.2); verificación del tiempo de hibernación en el paso 0 |
| Despliegue manual del worker desde un portátil: versión desconocida en producción, secretos sin rotar | Alta hoy | Medio | workflow `deploy-worker.yml` con smoke de push y chat (paso 0); la versión desplegada se lee en `/health` |
| `ack` sin escritura durable, o supresión que dice "borrados N" sin borrar | Baja | Alto (silencio + RGPD) | `ack` tras la escritura; el recuento se relee de SQLite; test del DO (11.2) |
| Los tests del worker no se ejecutan: `vitest.config.ts:11` solo incluye `src/`, `tests/` y `scripts/` | Alta si no se toca | Alto | incluir `worker/**/*.test.ts` en el mismo PR y comprobar que el recuento de tests sube (11.1) |
| Una sala vacía (demanda real desconocida: 7 seguidores en Bluesky, 09-24 `:398`) | Alta | Medio | estado vacío con invitación; métrica de uso contada en el worker; criterio de retirada (P2) |
| Suplantación de fuentes o del dueño por el handle | Baja | Medio | handle con prefijo `gh/`, lista de reservados, marca textual del dueño (3.5) |
| Captura de pantalla de un mensaje presentada como "Watchboard dice" | Media | Medio | cabecera fija "no es una fuente" visible en cualquier recorte del panel (5.2) |
| Carga legal no prevista (DSA/RGPD) para una persona física | Media | Alto | P6 antes de abrir la primera sala; `decisions` guarda lo necesario para los arts. 17 y 24 |
| Compromiso del secreto de sesión | Baja | Alto | rotación de `CHAT_SESSION_KEY` cierra todas las sesiones; nada del chat da acceso a push ni a datos del sitio |
| Script anónimo que abre miles de conexiones o pide `/health` para cerrar la sala o gastar la cuota de la cuenta (revisiones #4, #9, #27) | Media | Alto: puede tumbar push hasta medianoche | sin tope diario de conexiones; tope concurrente anónimo con plazas reservadas a lectores con sesión; historial desde memoria; `/health` en caché sin *fan-out*; regla gratuita por IP; palanca 3. Riesgo residual aceptado (7.2) |
| Avisos DSA falsos para silenciar salas, inundar al dueño o bloquear el canal (revisiones #15, #18, #29) | Media | Alto | se oculta el mensaje, no la sala; avisos sobre mensajes inexistentes rechazados; tope de retenciones anónimas por sala y hora; alertas agrupadas; tipos graves sin tope; regla por IP |
| Destrucción de la prueba por el autor antes de revisar (revisión #16) | Media | Alto (legal) | texto a `evidence` mientras haya reporte abierto; retención no borra lo reportado; decisión "sin objeto" |
| Orden de retirada TCO fuera de horario (revisión #17) | Baja en el piloto, alta en conflicto | Alto | punto de contacto en el móvil; `closed` sin historial; simulacro de una hora; sala de conflicto solo con spec propio (12) |
| Rotar `CHAT_BAN_KEY` levanta bans y resucita sesiones (revisión #32) | Baja | Alto | no se rota nunca (runbook); huella guardada: si cambia, ninguna identidad escribe y el canario falla |
| Cliente y worker con versiones distintas del protocolo (revisión #37) | Alta en cada despliegue | Medio | parsers que ignoran claves nuevas; `hello.v`; *timeout* de `hello`; el worker se despliega primero |
| Mensajes en idiomas que nadie modera (revisión #23) | Alta en trackers de conflicto | Alto | normas en 4 idiomas; retención `language` de texto mayormente no latino; sala de conflicto exige listas y revisor para sus idiomas |

## 11. Testing

Siguiendo `docs/silent-failure-patterns.md`: cada prueba verifica el
artefacto (la fila en SQLite, el mensaje recibido por otro socket, la
cabecera servida), no el código de salida.

### 11.1 Unitarias (vitest, `.github/workflows/test.yml`)

- **Primero, que corran:** `vitest.config.ts:11` pasa a incluir
  `worker/**/*.test.ts`. El PR anota el recuento de tests antes y
  después; si no sube, el PR está mal.
- `src/lib/community/protocol.test.ts` — cada tipo de trama de 3.4 se
  valida y se rechaza lo desconocido; tramas > 4 KiB; `nonce` obligatorio.
- `worker/chat/filters.test.ts` — normalización (bidi, zalgo, NFKC);
  corpus de casos por locale para `slur`, `pii` (teléfonos, IBAN con
  Luhn, coordenadas ≥ 4 decimales), `link`, duplicados; **fallo
  cerrado** si la lista está vacía o con versión inesperada. El corpus
  de términos de prueba es sintético; la lista real no entra al repo.
- `worker/chat/ratelimit.test.ts` — con reloj inyectado: ráfaga, hora,
  día, modo lento automático a 40/min, `daily_budget`, reinicio a las
  00:00 UTC.
- `worker/chat/session.test.ts` — firma y caducidad del token; `gen`
  revocada; `Origin` fuera de lista → 403; cuenta de < 30 días no
  escribe; handle reservado rechazado.
- `worker/chat/router.test.ts` — el host `chat.` no llega al `switch`
  de push y un slug fuera de `CHAT_ROOMS` recibe 404 **sin** llamar a
  `idFromName` (espía); `CHAT_ENABLED=false` → 503 antes de cualquier
  DO; las rutas de push responden igual que hoy (test de regresión
  sobre `worker/index.ts:65-92`).
- `src/lib/community/separation.test.ts` — el del 09-24 (`:685-691`)
  adaptado: `ChatMessage` sin `tier|source|pole|contested|media`; nada
  en `src/lib/schemas.ts`, `scripts/`, `mcp/` ni `video/` importa
  `src/lib/community/`; el panel no usa `--tier-*`, `.source-chip`,
  `.freshness-indicator` ni la fuente mono.
- `src/lib/tracker-config.test.ts` (nuevo) — `community.chat` opcional y por
  defecto `false`; como mucho `CHAT_MAX_ROOMS` trackers con `true`;
  nunca en `draft` o `archived`.
- `src/lib/live-layers.test.ts` existente (`:76-93`) — con las entradas
  `renderer: 'panel'` exige `wss://chat.watchboard.dev` y
  `https://push.watchboard.dev` en ambas CSP sin cambiar el test.
- Test de texto sobre `deploy.yml`: pasa `vars.PUBLIC_CHAT_ENABLED` al
  build; `scripts/list-env-vars.ts --check` sigue en verde.
- `src/i18n/translations.test.ts` existente — cubre las cadenas nuevas.

### 11.2 Durable Object (integración)

Con `@cloudflare/vitest-pool-workers` (miniflare, DO y SQLite reales en
local) en un proyecto vitest aparte `worker/vitest.config.ts`, invocado
desde `npm test` para que CI no lo salte. Casos:

- Dos sockets en la misma sala: A envía → B recibe `msg`; A recibe
  `ack` con el `id` que luego aparece en `SELECT` del SQLite.
- Hibernación: tras forzar la expulsión del objeto, los `attachment`
  conservan uid y contadores y el siguiente `send` sigue limitado.
- Reintento con el mismo `nonce` no duplica filas.
- Retener, publicar, retirar: `decisions` recibe la fila y el autor ve
  el motivo; los demás reciben `remove`.
- Supresión: tras "Borrar mi cuenta" el `SELECT` por `uid` en cada sala
  devuelve 0 y el recuento anunciado coincide.
- `alarm`: caducan mensajes > 30 días y retenidos > 72 h; horario
  atendido cambia el modo.

Si la herramienta no es viable con la versión de wrangler fijada en el
paso 0, se registra en el ADR y estos casos pasan a un script e2e contra
`wrangler dev`, también en CI.

### 11.3 E2E (Playwright, `playwright.config.ts`)

Contra `npm run preview` y un `wrangler dev` local del chat:

- El panel está colapsado y **no hay WebSocket** hasta abrirlo
  (inspección de red).
- Cabecera "no es una fuente" visible en los 4 locales; ningún mensaje
  fuera del panel.
- Estados de 5.3: vacío, `readonly` con motivo, sin conexión (worker
  parado) sin "0 mensajes", mensaje retenido solo visible para su autor.
- Consola sin violaciones de CSP; mismo recorrido contra la imagen
  Docker construida con `PUBLIC_CHAT_ENABLED=true`, y la imagen por
  defecto sin panel (`tests/docker-smoke.sh`).
- Teclado y lector de pantalla: foco al abrir, `Esc`, `role="log"`.

### 11.4 En vivo y canario

- `tests/live/chat.live.test.ts` (`liveIt`, `npm run test:live`):
  `wss://chat.watchboard.dev/room/{slug-canario}` completa el handshake
  y recibe `hello` con `mode`; `Origin` ajeno → 403.
- `credential-canary.yml` gana un paso: `GET
  https://chat.watchboard.dev/health` devuelve la versión desplegada, el
  modo global, la versión de la lista de términos (> 0 términos) y el
  uso del día. Alerta a `TELEGRAM_ALERT_CHAT_ID` (como hoy,
  `credential-canary.yml:142-146`) si falta, si los filtros no cargan,
  si el uso supera el 70 %, si `enabled` no coincide con la variable
  `CHAT_EXPECTED_ENABLED` (o el sitio monta el panel con el worker
  apagado), si el token de Telegram **del worker** no pasa la sonda
  horaria (`alertsOk`), si la huella de `CHAT_BAN_KEY` cambió (`keyOk`),
  si la alarma de retención de una sala con mensajes no ha corrido en
  2 h, si hay mensajes no reportados de más de 30 días + 2 h, o si una
  sala no puede sincronizar con `ChatMod`. Comprueba el resultado, no
  que el job corrió (revisiones #12, #33, #34, #38).
- Sala canario (`CHAT_ROOMS` incluye `_canary`, no montada en el sitio)
  para que la prueba en vivo no escriba en salas reales.

### 11.5 Manual antes del piloto

1. Ensayo cronometrado de las cinco palancas de la sección 8; se anota
   el tiempo real de cada una en el runbook.
2. Una sesión de "equipo rojo" de 30 min con 2-3 cuentas de prueba:
   insultos ofuscados, doxxing, flood, reportes en masa, handles
   engañosos. Cada fallo de filtro añade un caso al corpus de 11.1.
3. El dueño revisa una captura del panel junto al timeline: ¿se
   confunde con un dato? (criterio del 09-24, `:727-728`).

## 12. Despliegue por fases

Cada paso es un PR propio; ninguno marcado **[dueño]** avanza sin su
respuesta en la sección 14.

**Paso 0 — Verificación previa y cimientos (sin chat visible).**

- Releer en la documentación de Cloudflare los límites de 7.1, el tiempo
  hasta hibernar, la memoria facturada por DO, las reglas de *rate
  limiting* del plan gratuito (P8) y las *location hints* / jurisdicción
  UE (P6); copiar cifras y fechas al ADR.
- Arreglar el fallo de P9 del 09-24: `https://push.watchboard.dev` en
  ambas CSP con entrada en `LIVE_LAYERS`, y comprobar en producción que
  una suscripción push llega al KV.
- Workflow `deploy-worker.yml` (manual + push a `worker/**`): fija la
  versión de `wrangler` en `devDependencies`, sube `compatibility_date`,
  despliega con un token de API de alcance mínimo y ejecuta un smoke de
  push (`GET /` lista los endpoints) y, más adelante, de chat
  (`/health`). Un despliegue cuyo smoke falla es rojo **y se revierte**
  con `wrangler rollback`. Las pruebas de regresión de push cubren
  también `POST /subscribe` y la ruta del cron, que son las que el cambio
  de `compatibility_date` puede romper (revisión #11). La versión de
  `@cloudflare/workers-types` se fija en `^5.20260815.1`, la que exige
  `wrangler@4.124.0` como *peer* (revisión #1).
- `vitest.config.ts` incluye `worker/**` (11.1).

**Paso 1 — ADR-0003 "Comentarios de la comunidad sin tier y chat
propio" [dueño].** El número lo reservó el 09-24 (Paso 1). Registra: el
contrato "sin tier" y sus tres capas, el nuevo host y estado compartido
(DO), `renderer: 'panel'`, límites y techo de coste con fecha, retención,
y enlaza el runbook `docs/runbooks/chat.md`.

**Antes del paso 2 [dueño] (revisiones #22, #24):** P1 (trackers
piloto), P2 **con números** (N y M) y la parte de P6 sobre jurisdicción
UE. Sin ellas no se escribe código de chat: construir ~27 tareas antes
de acordar qué resultado justificaría conservarlas es el error que la
recomendación del 09-24 (enlace fuera) evitaba, y la jurisdicción no se
puede cambiar después de crear los objetos.

**Paso 2 — Backend oscuro.** `worker/chat/` (router por host, `ChatRoom`,
`ChatMod`, filtros, OAuth, `/admin`, `/notice`, `/health`, alarmas y
alertas), migración `new_sqlite_classes`, secretos. `CHAT_ROOMS` solo
con `_canary`. Tests 11.1-11.2 en verde; canario 11.4 activo.

**Paso 3 — Panel oscuro.** `ChatPanel.tsx`, pestaña móvil, cadenas en 4
locales, normas y aviso legal, `community.chat` en el esquema,
`PUBLIC_CHAT_ENABLED` cableado a `deploy.yml` y `Dockerfile` (por
defecto `false`). Build con la variable apagada: el HTML no cambia (se
compara el `dist/` de un tracker antes y después).

**Paso 4 — Ensayo [dueño].** Variable encendida solo en un despliegue
de prueba (o `npm run preview` + `wrangler dev`): e2e 11.3, ensayo de
palancas y equipo rojo (11.5). Texto legal revisado según P6.

**Paso 5 — Piloto cerrado [dueño].** 1-2 trackers de baja polarización
elegidos en P1 (candidatos: `cdmx`, `fusion-energy`,
`crispr-gene-therapy`; todos con `updateIntervalDays: 7`, p. ej.
`trackers/cdmx/tracker.json:207`, así que dan poco tráfico pero poco
riesgo), horario atendido (P5), 30 días. Se registran a diario: mensajes
aceptados/retenidos/retirados, reportes, minutos de moderación, uso de
cuota y aperturas del panel (contadas en el worker, sin PostHog ni
identificadores).

**Qué puede y qué no puede probar el piloto (revisión #22).** Con 1-2
salas de baja polarización y sin anuncio, mide si alguien usa el chat
(N de P2) y cuánta moderación cuesta cuando hay poca (M de P2). No dice
nada sobre brigadas, doxxing o contenido terrorista en un tracker de
conflicto, que es el riesgo principal. Además, antes del piloto: la
regla gratuita de *rate limiting* por ruta activa y el simulacro TCO de
una hora hecho (paso 4).

**Paso 6 — Decisión [dueño].** Con el criterio de P2: retirar o
mantener. Un tracker de conflicto **no** es una ampliación de este
piloto: exige un spec y un plan propios, con al menos modo lento por
defecto, horario atendido y la sala `closed` (sin historial) fuera de
él, cero incidentes graves sin atender en el piloto, un simulacro TCO
de una hora superado desde el móvil, los idiomas de la región excluidos
por norma o cubiertos por listas **y** por un revisor que los lea, y un
ensayo acotado en el tiempo con sus propios criterios de éxito y de
aborto (revisiones #17, #22, #23).

**Fases posteriores (fuera de este spec):** Bluesky OAuth (9.4);
referencias a eventos dentro de la sala (9.3); evaluación de Workers AI
como filtro adicional (P9).

## 13. Qué no se construye

- Chat anónimo sin cuenta para escribir (9.4).
- Mensajes privados, perfiles, avatares, reacciones, contador de
  personas en línea (2, no-objetivos; 5.2).
- Salas por evento, por día o por locale (9.3; P4).
- Medios, enlaces clicables o previsualizaciones.
- Correo transaccional de cualquier tipo (no hay proveedor; 1).
- Cualquier uso de mensajes como dato, candidato, contexto de la IA,
  RSS, API, MCP, búsqueda o video (09-24 §3.3).
- Turnstile o cualquier script de terceros en `watchboard.dev` (6.5).
- Workers Paid o cualquier gasto (7.2).
- Chat en la imagen Docker por defecto (P10) y en la portada global.
- Registro de IP o analítica de lectores del chat.

## 14. Preguntas abiertas para el dueño

Las P del 09-24 se dan por cerradas con la decisión del 09-25, salvo su
P9 (CSP de push), que este spec absorbe en el paso 0. La numeración de
abajo es propia de este spec.

1. **P1 — Trackers piloto.** Propuesta: 1-2 de baja polarización
   (`cdmx`, `fusion-energy`, `crispr-gene-therapy`), aceptando poca
   señal de demanda. ¿Cuáles? ¿Se admite uno de conflicto ya en el
   piloto (más señal, más riesgo), o solo en el paso 6?
2. **P2 — Criterio de éxito y retirada** a 30 días de piloto: p. ej.
   ≥ N mensajes aceptados/semana por sala **y** ≤ M minutos de
   moderación al día **y** cero reportes graves sin atender > 60 min.
   ¿Qué N y M? Sin valor por defecto. **Bloquea el paso 2** (junto con
   P1), no solo el 5.
3. **P3 — Identidad para escribir:** GitHub OAuth solo (propuesta, con
   el sesgo de audiencia reconocido en 9.4); GitHub + Bluesky desde el
   inicio (más audiencia, más trabajo); u otro proveedor. ¿Y la edad
   mínima de cuenta: 30 días (propuesta), 7 o 90?
4. **P4 — Una sala por tracker para todos los idiomas** (propuesta) o
   una por locale.
5. **P5 — Horario atendido:** ¿qué franja y zona horaria? ¿Solo días
   laborables? ¿Se acepta que fuera de ella la sala sea `readonly`
   (propuesta) en vez de `slow`?
6. **P6 — Legal:** qué correo figura como punto de contacto (arts.
   11-12) y para avisos (art. 16); a qué autoridad o línea de denuncia
   se notifica el contenido ilegal grave (6.2) y las amenazas (art. 18);
   qué nombre figura como responsable del tratamiento; cuál es el punto
   de contacto para órdenes de retirada TCO (6.2 bis) y si el dueño lo
   recibe en el móvil; si se fija la jurisdicción UE de los DO; si el
   proyecto se considera micro/pequeña empresa a efectos del art. 19; si
   hay revisión legal del texto antes del paso 5. **La jurisdicción
   bloquea el paso 2; el resto, el paso 5.**
7. **P7 — Edad mínima** en las normas: 16 (propuesta, por el art. 8 del
   RGPD) o 13 (la de GitHub).
8. **P8 — Anti-bots:** la regla gratuita de *rate limiting* por IP y
   ruta ya no es opcional: es requisito del piloto (3.7; el plan gratuito
   solo permite una regla de 10 s por ruta, verificado el 2026-09-26).
   Queda por decidir: ¿Turnstile en `/notice` y `/auth/start` (páginas
   del worker, no del sitio) sí o no?
9. **P9 — Workers AI** como clasificador adicional tras el piloto: ¿se
   evalúa (añade un encargado dentro de Cloudflare y consumo de cuota)
   o se descarta?
10. **P10 — Imagen Docker:** chat apagado por defecto (propuesta; la
    cookie sería de terceros desde otro origen, 3.6) o configurable con
    un host de chat propio del autoalojador.
11. **P11 — Retención:** 30 días de mensajes visibles (propuesta),
    7 días, o sin caducidad. Más retención es más historial para los
    lectores y más dato personal que custodiar y suprimir.
12. **P12 — Despliegue del worker desde CI:** ¿se acepta un
    `CLOUDFLARE_API_TOKEN` de alcance mínimo como secreto del repo para
    `deploy-worker.yml` (paso 0), con su comprobación en el canario? La
    alternativa es seguir con despliegues manuales, sin smoke ni versión
    conocida.
13. **P13 — Moderadores adicionales:** ¿el dueño es el único en
    `CHAT_ADMIN_IDS` durante el piloto (propuesta), o se nombra a una
    segunda persona de confianza para cubrir ausencias?

## Adversarial review log

Revisión adversarial del 2026-09-26 (lentes: *truth*, *safety*, *failure*).
Cada hallazgo se verificó por separado antes de aceptarlo; los números
`#n` que citan este spec y el plan son los de esta tabla. Verificaciones
propias: `npm view wrangler@4.124.0 peerDependencies` y una instalación
en limpio (#1); páginas de Cloudflare *WAF rate limiting rules*, *DO
limits*, *DO pricing*, *SQLite storage API* y *Data location*
consultadas el 2026-09-26 (#2, #3, #5, #14, #24); `.dockerignore` y
`Makefile:57` del repo (#13); el código del plan en cada caso.

| # | Lente | Severidad | Hallazgo | Veredicto | Acción / razón |
|---|---|---|---|---|---|
| 1 | truth | crítico | `@cloudflare/workers-types ^4` choca con el *peer* de `wrangler@4.124.0`: `npm install` falla (ERESOLVE) | Aceptado (reproducido: ERESOLVE con `^4`, instala con `^5.20260815.1`) | Plan T1 fija `^5.20260815.1`; el test de T2 lo comprueba; "Verified facts" corregido |
| 2 | truth | crítico | El filtro de brigadas y la alarma recorren toda la tabla; el piloto supera 5 M filas leídas/día | Aceptado | Índices `messages_hash(body_hash, ts)` y `messages_uid(uid, ts)`; retención por rango de `id`; historial en dos consultas y en memoria; test de coste con 10.000 filas (≤ 150 leídas por envío); 7.3 recalculado |
| 3 | truth | crítico | Filas escritas subestimadas (~12-15 por mensaje, no 5); al agotarse fallan también reportes y avisos DSA | Aceptado ("every row update of an index counts as an additional row") | Sin tabla `counters`; tablas `WITHOUT ROWID`; contadores de sala en memoria + una fila; UPSERT; test de techo (≤ 9 escritas por envío, 0 por conexión anónima); `roomMsgsPerDay` 1.000 provisional; valor medido al ADR (T13.8) |
| 4 | truth | importante | 5.000 handshakes anónimos cierran la sala hasta medianoche | Aceptado | Sin tope diario de conexiones (D10); tope concurrente de 200 anónimos con 100 plazas para lectores con sesión; test; fila nueva en §10 |
| 5 | truth | importante | La regla WAF del paso 26.6 no existe en Free (host, 60 s) | Aceptado (docs: 1 regla, 10 s, 10 s, campos "Path, Verified Bot") | T26.6 reescrita: regla por ruta `/room/`, `/notice`, `/auth/`, bloqueo 10 s; ADR registra que no para un script lento; §3.7 |
| 6 | truth | importante | `await loadTerms`/RPC entre comprobaciones y escritura permite saltarse tasa y nonce | Aceptado (la compuerta de entrada se abre al esperar a otro objeto) | Términos, bans y modo global en el SQLite de la sala (D12); `onSend` sin `await` antes del INSERT; test de dos envíos en el mismo tick |
| 7 | truth | importante | Supresión y bans solo llegan a `CHAT_ROOMS`: una sala retirada conserva datos y el éxito es parcial | Aceptado | Registro `rooms` en `ChatMod`; *fan-out* al registro; supresión con salas inalcanzables devuelve 502; test con una sala fuera de `CHAT_ROOMS` |
| 8 | truth | importante | "Readonly a los 60 min" era en realidad 60-120 min | Aceptado | `markReported` programa la alarma de la sala a +60 min; test sobre `getAlarm()` |
| 9 | truth | importante | `/health` público hace *fan-out* y `/auth/github/start` escribe: amplificadores de cuota | Aceptado | `/health` desde `room_stats` (empujado por las alarmas), caché 60 s en worker y en `ChatMod`, `Cache-Control: max-age=60`; sin contador `start`; test de 50 peticiones → 1 RPC |
| 10 | truth | importante | El check Docker de ausencia de `data-chat-root` no puede fallar | Rechazado en su premisa, con cambio | Una isla `client:idle` se renderiza en el servidor, así que el atributo **sí** está en el HTML con el chat encendido y el check sí puede fallar; lo erróneo era la frase de T24.8 (ver #42). Se añade a T24.8 la demostración de que el check falla sobre un build encendido |
| 11 | truth | importante | Un smoke fallido no revierte; la palanca 5 se deshace con el siguiente deploy; faltan pruebas de `POST /subscribe` y cron | Aceptado | Paso `wrangler rollback`; tests de `POST /subscribe` y `handleCron` con red simulada; palanca 5: desactivar `deploy-worker` primero y quitar la ruta del `wrangler.toml` |
| 12 | truth | importante | El canario da por bueno `enabled:false` | Aceptado | Variable `CHAT_EXPECTED_ENABLED` (la fija cada palanca); el canario falla si difiere o si el sitio monta el panel con el worker apagado |
| 13 | truth | menor | `npm test` falla sin `worker/node_modules`; `.dockerignore` no excluye `worker/node_modules` | Aceptado (`.dockerignore` solo lista `node_modules`, `video/…`, `mcp/…`) | Línea `worker/node_modules`; script `test:worker` con mensaje claro; test |
| 14 | truth | menor | *Observability* es por worker; "10 GB por objeto en Free" no consta | Parcial | Aceptado lo de *observability* (§6.3: apagado para todo el worker). Rechazado lo del límite: la página *DO limits* (2026-09-26) da "Storage per Durable Object: 10 GB" también en Free; se cita la fecha |
| 15 | safety | crítico | Un aviso anónimo pone cualquier sala en `readonly` y el contenido denunciado sigue visible | Aceptado | D13: el reporte grave oculta el mensaje, no la sala; avisos sobre mensajes inexistentes rechazados; tope de retenciones anónimas por sala/hora; `readonly` solo por volumen (≥ 3 graves > 60 min); test "un aviso no cambia el modo" |
| 16 | safety | crítico | El autor puede destruir la prueba; no hay forma de preservarla; los reportadores salen penalizados | Aceptado | Tabla `evidence` y `reported=1`; retención no borra lo reportado; `decide` con `preserve` (→ `decisions.facts` con `facts_until`) y acción `moot` sin penalización; tests |
| 17 | safety | importante | Falta el Reglamento TCO (UE) 2021/784: orden de retirada en una hora | Aceptado (el 09-24 solo lo menciona de pasada en `:615`) | §6.2 bis; P6 nombra el punto de contacto (art. 15); `closed` ya no sirve historial; simulacro de una hora (T26.3.6) como requisito; sala de conflicto con spec propio |
| 18 | safety | importante | El tope global de 30 avisos/hora bloquea el canal DSA y cada aviso falso despierta al dueño | Aceptado | Sin tope para abuso infantil, terrorismo y amenaza; tope por mensaje (3/h) y total solo para "ilegal (otro)"; alertas agrupadas por sala cada 15 min; regla por IP |
| 19 | safety | importante | El notificante nunca conoce la decisión (art. 16(5)); formulario solo en inglés | Aceptado | `/notice/status?ref=N` (estado, fundamento, fecha, sin contenido); formulario, errores y acuse en en/es/fr/pt; test |
| 20 | safety | importante | Bans y retenciones caducadas sin declaración de motivos ni vía de recurso (art. 17) | Aceptado | `err banned` con `until` y `ground`; el baneado conserva la sesión y ve el motivo; la retención caducada deja fila con motivo automático; frase de recurso en 4 idiomas; tests |
| 21 | safety | importante | El filtro de enlaces se esquiva con tres mensajes inocuos | Aceptado | Todo mensaje con enlace, incluidas formas ofuscadas, se retiene en el piloto; casos de prueba y de equipo rojo |
| 22 | safety | importante | El piloto no puede producir la evidencia que decide la cuestión; N y M se fijan al final | Parcial | Aceptado: P1 y P2 con números bloquean el paso 2; §12 dice qué prueba y qué no el piloto; un tracker de conflicto exige spec propio con ensayo acotado. No se recorta la construcción: aviso DSA, declaración de motivos, supresión y `/admin` son obligatorios antes de abrir cualquier sala, sea cual sea la demanda, y sustituir `/admin` por la CLI no reduce esas obligaciones |
| 23 | safety | importante | Filtros y moderador cubren 4 idiomas; la sala acepta cualquiera | Aceptado | Norma §6 (4 idiomas); retención `language` si > 50 % de letras no latinas; requisito de listas y revisor para salas de conflicto |
| 24 | safety | menor | La jurisdicción UE se decide tarde y los DO no se mueven | Aceptado (docs *Data location*) | P6-jurisdicción bloquea el paso 2; `worker/chat/stubs.ts` único punto de `idFromName` con `.jurisdiction('eu')`; tests |
| 25 | safety | menor | El aviso de privacidad no cumple el art. 13; la supresión deja `uid` en claro | Aceptado | `chat.legal` con plazos, bases legales y transferencias; responsable en `chat.legalContact`; `eraseUid` vacía `uid`; test |
| 26 | failure | crítico | Escaneos completos en las consultas calientes; filas escritas subestimadas | Aceptado (duplica #2 y #3) | Ver #2 y #3 |
| 27 | failure | crítico | Un script anónimo cierra o llena la sala y agota cuotas que comparte push | Aceptado en lo corregible | Ver #4 y #9; además historial desde memoria para anónimos y regla WAF como requisito. §7.2 dice ahora sin rodeos que un script lento puede tumbar push hasta medianoche y que solo otra cuenta lo aísla (riesgo aceptado del piloto) |
| 28 | failure | importante | `/health` público despierta todas las salas | Aceptado (duplica #9) | Ver #9 |
| 29 | failure | importante | Avisos falsos: sala en `readonly`, alertas en masa, tope global agotado | Aceptado (duplica #15 y #18) | Ver #15 y #18 |
| 30 | failure | importante | `CHAT_ENABLED=false` también apaga `/admin`, `/notice` y `/me` | Aceptado | La palanca 3 solo bloquea salas y el inicio de sesión de lectores; el dueño puede entrar; test con `CHAT_ENABLED=false` |
| 31 | failure | importante | Modo global y bans dependen de un *fan-out* sin reconciliación | Aceptado | La sala sincroniza con `ChatMod` al conectar (≥ 60 s) y en cada alarma; si no puede, rechaza escrituras; `bans_version`; test de sala que perdió el *fan-out* |
| 32 | failure | importante | Rotar `CHAT_BAN_KEY` levanta bans y resucita sesiones | Aceptado | No se rota (runbook, ADR); huella guardada en `ChatMod`; si cambia, ninguna identidad escribe y `/health` da `keyOk:false` |
| 33 | failure | importante | Alertas de `ChatMod` pueden fallar en silencio; nadie comprueba el token del worker | Aceptado | Alertas no entregadas contadas también en `ChatMod`; sonda horaria `getMe`+`getChat` → `alertsOk` en `/health` y canario; rotación de ambas copias en el runbook |
| 34 | failure | importante | El canario da por bueno `enabled:false` | Aceptado (duplica #12) | Ver #12 |
| 35 | failure | importante | Los rechazos en el handshake llegan como 1006 y el cliente no puede mostrar el estado | Aceptado | Rechazos explicados dentro de un socket aceptado con códigos 4002/4003/4004/4008; el cliente los muestra sin reintentar; tests |
| 36 | failure | importante | Tres envíos en modo lento cierran con 1008 y el cliente no vuelve nunca | Aceptado | Solo las tramas malformadas cuentan (cierre 4008); 1008 queda para ban; el cliente sigue `cooldownMs` y desactiva el envío; tests |
| 37 | failure | importante | Parsers estrictos + despliegues separados = clientes colgados en "Conectando…" | Aceptado | Parsers que ignoran claves desconocidas; `hello.v`; *timeout* de `hello` de 10 s; regla "worker primero, sin quitar campos"; tests |
| 38 | failure | importante | Nada comprueba que la retención se cumple; un fallo de RPC la detiene | Aceptado | Retención antes de cualquier RPC; cada paso en `try`; reprogramación en `finally`; `lastAlarmAt` y edad del mensaje más antiguo no reportado en `/health`; el canario falla a > 2 h / > 30 d + 2 h |
| 39 | failure | importante | Revocar la sesión no cierra sockets abiertos; cerrar sesión no revoca el token | Aceptado | Cerrar sesión siempre incrementa `gen` (D14) y cierra los sockets con 4009; supresión igual; test |
| 40 | failure | menor | Las palancas de emergencia necesitan el portátil | Parcial | Aceptado: workflow `chat-kill-switch.yml` que se lanza desde la app de GitHub y se cronometra en el ensayo. Rechazado mover `CHAT_ROOMS` a `ChatMod`: la retirada inmediata de una sala ya es la palanca 1 (`closed`, ahora sin historial) desde el móvil, y una lista en `ChatMod` pondría una RPC delante de cada upgrade y rompería la garantía de 404 antes de `idFromName` |
| 41 | failure | menor | Tests de DO con estado compartido y dependientes del orden | Parcial | Aceptado: comprobación registrada del aislamiento del pool (T1.3), salas de test dedicadas, `resetChat()` en `afterEach`, pruebas que restauran lo que cambian. No se inyecta un reloj en la sala: las pruebas usan tiempos relativos a `Date.now()`; el único test sensible a medianoche (presupuesto diario) calcula el día una vez y el riesgo residual se acepta |
| 42 | failure | menor | T24.8 esperaba 0 `data-chat-root` en un build encendido | Aceptado | T24.8 espera 1 (SSR de `client:idle`), simétrico al 0 del build apagado de T24.7 |
