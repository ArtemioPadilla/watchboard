# Diseño: chat en vivo propio (Worker + Durable Objects)

**Estado:** Propuesto — pendiente de las decisiones del dueño (sección 14)
**Fecha:** 2026-09-26
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
hacia lo seguro: sala en solo-lectura si la cola de reportes envejece.

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
  por cuenta en Free.
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
  simultáneas, 5.000 conexiones/día, 1.500 mensajes aceptados/día. Al
  llegar a un límite diario la sala pasa a `readonly` con motivo
  `daily_budget` hasta las 00:00 UTC (sección 7).

### 3.3 Esquema SQLite

```sql
-- ChatRoom
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY,           -- monótono por sala
  ts         INTEGER NOT NULL,              -- epoch ms, reloj del DO
  uid        TEXT    NOT NULL,              -- 'gh:{id}' (o 'bsky:{did}' en fase 2)
  handle     TEXT    NOT NULL,              -- copia al escribir; no se edita
  body       TEXT    NOT NULL,              -- ≤ 500 caracteres tras normalizar
  lang       TEXT,                          -- declarado por el cliente, informativo
  state      TEXT    NOT NULL CHECK (state IN ('visible','held','removed','deleted')),
  hold_code  TEXT,                          -- filtro que lo retuvo
  nonce      TEXT    NOT NULL UNIQUE        -- idempotencia de reintentos
);
CREATE INDEX messages_visible ON messages(state, id);
CREATE TABLE counters (day TEXT, key TEXT, n INTEGER, PRIMARY KEY (day, key));
CREATE TABLE room (k TEXT PRIMARY KEY, v TEXT);   -- modo, motivo, hasta

-- ChatMod
CREATE TABLE bans      (uid_hmac TEXT PRIMARY KEY, until INTEGER, ground TEXT, decision_id INTEGER);
CREATE TABLE reports   (id INTEGER PRIMARY KEY, room TEXT, msg_id INTEGER, ts INTEGER,
                        category TEXT, reporter_uid_hmac TEXT, notice_json TEXT, status TEXT);
CREATE TABLE decisions (id INTEGER PRIMARY KEY, ts INTEGER, room TEXT, msg_id INTEGER,
                        action TEXT, ground TEXT, automated INTEGER, facts TEXT);
CREATE TABLE settings  (k TEXT PRIMARY KEY, v TEXT);  -- modo global, lista de términos, versión
```

El tipo TypeScript `ChatMessage` vive en `src/lib/community/` (el módulo
que el 09-24 §3.2 reservó), **fuera** de `src/lib/schemas.ts`, y no
tiene claves `tier`, `source`, `pole`, `contested` ni `media`
(test de separación, sección 11).

### 3.4 Protocolo del socket

JSON, validado con Zod en ambos extremos (esquema compartido
`src/lib/community/protocol.ts`, importado por el worker):

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
| s→c | `err` | `code` estable (`rate_limited`, `too_long`, `banned`, `auth_required`, …) |

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
  sesiones: la revocación es por `gen` (el ban o "cerrar sesión en todas
  partes" incrementa la generación del usuario en `ChatMod`) y por
  rotación de `CHAT_SESSION_KEY` (cierra todas las sesiones).
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
| Sala, día | 1.500 mensajes, 5.000 conexiones | `readonly` motivo `daily_budget` |
| Conexión | 3 mensajes rechazados seguidos | cierre 1008; reconexión con backoff |
| Handshake | `Origin` válido, trama ≤ 4 KiB | 403 / 1009 |

El límite por IP no se implementa en el código (la IP no se guarda; 6.3).
Si hace falta, se usa una regla de *rate limiting* de Cloudflare en el
host `chat.` — su disponibilidad y cupo en el plan gratuito se verifica
en el paso 0 (P8).

El cliente reconecta con backoff exponencial con *jitter* (1 s → 60 s)
y deja de intentar tras 10 fallos seguidos, mostrando "chat no
disponible": un bucle de reconexión en cada pestaña abierta es la forma
más rápida de agotar la cuota diaria (sección 7).

### 3.8 Retención

| Dato | Dónde | Retención |
|---|---|---|
| Mensaje visible | `ChatRoom.messages` | 30 días, luego borrado físico por la `alarm` diaria de la sala |
| Mensaje retenido por filtro | ídem, `state='held'` | 72 h si nadie lo revisa; luego borrado |
| Mensaje retirado | ídem, cuerpo sustituido por `''` | fila de 30 días sin contenido; el motivo vive en `decisions` |
| Mensaje borrado por su autor | ídem | cuerpo vaciado al instante |
| Reporte | `ChatMod.reports` | 6 meses |
| Decisión (declaración de motivos) | `ChatMod.decisions` | 6 meses, sin el texto del mensaje salvo contenido ilegal preservado por P6 |
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
6. **Enlaces:** en el piloto, ningún enlace es clicable; el texto con
   URL de una cuenta con < 3 mensajes aceptados se retiene `link`. Los
   enlaces son el principal vector de spam y de material ilegal.
7. **Mayúsculas / repetición** excesivas → rechazo con mensaje, no
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
contenido ilegal o datos personales a Telegram. Disparadores: primer
reporte de categoría "ilegal" o "datos personales" (inmediato), cola
con elemento > 2 h, modo lento automático, presupuesto diario > 70 %,
filtros no disponibles, cambio de modo global.

### 4.5 Plantilla realista del dueño

Una persona, sin guardias nocturnas. Por eso:

- **Horario atendido (propuesto para el piloto, P5):** escritura
  abierta solo en una franja diaria en la zona del dueño; fuera de ella
  la sala es `readonly` con el motivo visible ("el chat abre a las
  08:00"). Lo aplica una `alarm` de la sala, no una persona.
- **Degradación automática:** si un reporte "ilegal" o "datos
  personales" lleva > 60 min sin revisar, la sala pasa sola a
  `readonly` hasta que el dueño lo resuelva.
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
| Solo lectura (horario, presupuesto, moderación) | Motivo concreto y hora de reapertura si la hay |
| Cerrado (dueño o global) | "El chat está cerrado." |
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
  número de referencia y el correo queda como dependencia de P6.
- **Declaración de motivos (art. 17):** cada retirada o ban genera una
  fila en `ChatMod.decisions` (acción, fundamento — ilegal o normas —,
  hechos, si fue automatizada) y el autor la ve en el panel en el lugar
  del mensaje ("Retirado: datos personales de terceros · normas §3").
  Las retenciones automáticas también la generan con `automated=1`.
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
  plazo; en ningún caso se copia a Telegram, al repo ni a logs.
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
| IP | — | no se guarda | el worker la ve en tránsito; los registros del worker (*observability*) quedan **desactivados** para el host `chat.` |

- **Supresión:** "Borrar mi cuenta" en el panel vacía todos los
  mensajes del `uid` en todas las salas (`ChatMod` hace *fan-out* a las
  salas habilitadas), elimina su generación de sesión y confirma en
  pantalla con el número de mensajes borrados (el recuento se relee de
  SQLite, no se supone). Se conservan decisiones y bans en los que
  aparezca, con su base legal.
- **Acceso/portabilidad:** "Descargar mis mensajes" devuelve JSON de las
  salas habilitadas.
- **Encargados:** Cloudflare (alojamiento del worker y DO); GitHub
  (proveedor de identidad). Se declaran en `/about` junto a los
  destinatarios que ya figuran (OpenSky, Nominatim).
- **Región de datos:** los DO se crean cerca del primer cliente; si el
  dueño quiere fijar la jurisdicción UE, las *location hints* /
  jurisdicción de DO se evalúan en el paso 0 (P6).

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

### 7.3 Presupuesto interno (por debajo del de Cloudflare)

- **Salas permitidas:** el worker solo crea o abre DO para slugs de la
  variable `CHAT_ROOMS` (lista cerrada, fijada en el deploy del worker);
  cualquier otro nombre recibe 404 **antes** de `idFromName`. Sin esto,
  cualquiera podría crear DO arbitrarios y llenar el almacenamiento.
- **Máximo 5 salas** en Free. Un test de build falla si más de
  `CHAT_MAX_ROOMS = 5` trackers tienen `community.chat: true`.
- **Por sala y día:** 5.000 conexiones y 1.500 mensajes aceptados
  (3.2); al llegar, `readonly` con motivo `daily_budget`.

Por qué esos números, en el peor caso (5 salas al máximo):

| Recurso | Cálculo del peor caso | Uso | % del límite |
|---|---|---|---|
| Peticiones Worker | 5 × 5.000 conexiones + push (~200) | ~25.200 | 25 % |
| Peticiones DO | 25.000 conexiones + 7.500 mensajes / 20 + ~2.000 a `ChatMod` | ~27.400 | 27 % |
| Filas leídas | 25.000 × 100 de historial (con índice) | ~2,5 M | 50 % |
| Filas escritas | 7.500 mensajes × ~5 (fila, índice, contadores) | ~37.500 | 38 % |
| Duración | 7.500 despertares × ~10 s despierta × 0,125 GB | ~9.400 GB-s | 72 % |

La duración es el recurso más justo: **una sala con un mensaje cada
pocos segundos no hiberna nunca** y consumiría ~10.800 GB-s/día sola
(86.400 s × 0,125 GB). El límite de 40 mensajes/minuto y de 1.500/día
por sala es lo que lo acota; el tiempo que un DO tarda en hibernar tras
quedar inactivo y la memoria facturada se verifican en el paso 0 y, si
difieren, se recalculan estas cifras antes de abrir salas. Las filas
leídas son el segundo recurso: el historial de 100 (no 200) y una caché
en memoria mientras la sala está despierta mantienen el margen.

Piloto realista (2 salas, 1.000 aperturas y 300 mensajes al día cada
una): < 10 % de todos los límites.

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
| 3 | Apagado del worker de chat | `wrangler secret put CHAT_ENABLED` = `false` (o variable + `deploy-worker.yml`) | el worker responde 503 en el host `chat.` **antes** de tocar cualquier DO; push sigue funcionando | 1-2 min |
| 4 | Panel fuera del sitio | `gh variable set PUBLIC_CHAT_ENABLED --body false && gh workflow run deploy.yml` | el build no monta el botón ni la pestaña | minutos (build + Pages) |
| 5 | Nuclear | Cloudflare: quitar la ruta `chat.watchboard.dev` | nada responde en `chat.`; push intacto porque es otra ruta | minutos, manual |

Notas:

- La palanca 4 exige cablear `PUBLIC_CHAT_ENABLED` en `deploy.yml`, que
  hoy solo pasa `PUBLIC_POSTHOG_*` (`.github/workflows/deploy.yml:119-120`),
  y en el `Dockerfile` como `ARG` con valor por defecto `false`. Mismo
  patrón que propuso el 09-24 (`:566-569`, `:636-639`), con un test de
  texto sobre `deploy.yml`.
- La palanca 3 es la de emergencia real: no depende de que el código
  del DO funcione. Si el apagado de las palancas 1-2 falla (bug en
  `ChatMod`), la 3 sigue funcionando.
- Apagar por tracker: quitar el slug de `CHAT_ROOMS` (palanca 3,
  inmediato para ese tracker) y después `community.chat: false` en su
  `tracker.json` + `gh workflow run deploy.yml` (un merge en
  `trackers/**` no despliega: `deploy.yml:20-21`).
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
  retenido y lo reportado; sin atención, la sala se degrada a
  `readonly`.
- Clasificador LLM o Workers AI: fase posterior (P9), no supuesto.

## 10. Riesgos

Se heredan del 09-24 §8 (`:650-667`) los riesgos de "un comentario se
lee como dato", "panel vacío que parece roto", "CSP olvidada" y
"presión para subir comentarios a datos", con las mismas mitigaciones.
Nuevos o agravados por alojar el contenido:

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Brigada coordinada en un tracker de conflicto (cuentas de GitHub envejecidas, mensajes casi idénticos) | Media | Alto | edad de cuenta ≥ 30 días; filtro de duplicados entre identidades (4.1.3); modo lento automático a 40/min; piloto sin trackers de conflicto (sección 12) |
| Contenido ilegal o doxxing visible fuera del horario del dueño | Media | Alto: responsabilidad como prestador | horario atendido (4.5); filtro `pii` y enlaces retenidos; degradación a `readonly` a los 60 min de un reporte grave sin revisar |
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
  `credential-canary.yml:142-146`) si falta, si los filtros no cargan o
  si el uso supera el 70 %. Comprueba el resultado, no que el job
  corrió.
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
  (`/health`). Un despliegue cuyo smoke falla es rojo.
- `vitest.config.ts` incluye `worker/**` (11.1).

**Paso 1 — ADR-0003 "Comentarios de la comunidad sin tier y chat
propio" [dueño].** El número lo reservó el 09-24 (Paso 1). Registra: el
contrato "sin tier" y sus tres capas, el nuevo host y estado compartido
(DO), `renderer: 'panel'`, límites y techo de coste con fecha, retención,
y enlaza el runbook `docs/runbooks/chat.md`.

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

**Paso 6 — Decisión [dueño].** Con el criterio de P2: retirar, mantener
o ampliar a un tracker de conflicto. Ampliar a conflicto exige además:
modo lento por defecto en esa sala, horario atendido y cero incidentes
graves sin atender en el piloto.

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
   ¿Qué N y M? Sin valor por defecto.
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
   si se fija la jurisdicción UE de los DO; si el proyecto se considera
   micro/pequeña empresa a efectos del art. 19; si hay revisión legal
   del texto antes del paso 5. **Bloquea el paso 5.**
7. **P7 — Edad mínima** en las normas: 16 (propuesta, por el art. 8 del
   RGPD) o 13 (la de GitHub).
8. **P8 — Anti-bots:** si el paso 0 confirma que el plan gratuito
   permite una regla de *rate limiting* por IP en `chat.`, ¿se activa?
   ¿Turnstile en `/notice` y `/auth/start` (páginas del worker, no del
   sitio) sí o no?
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
