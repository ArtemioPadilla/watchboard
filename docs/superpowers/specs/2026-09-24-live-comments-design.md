# Diseño: comentarios de la comunidad ("chat en la app")

**Estado:** Propuesto — bloqueado por la decisión del dueño (ver "Preguntas abiertas", P1)
**Fecha:** 2026-09-24 (revisado tras revisión adversarial el mismo día; ver
"Adversarial review log" al final)
**Contexto:** petición original del dueño: "un chat en la app para que la
gente comente lo que está pasando". El spec
`2026-09-21-radio-layer-and-community-design.md:26-29` lo excluyó de forma
explícita ("requiere backend y rompe el modelo de tiers — mensajes serían
Tier 4 sin verificar"). Este documento no ignora esa exclusión: la
confronta y propone cómo revertirla sin romper la promesa de tiers, o
mantenerla.

## Resumen

Recomendación: **hilos de respuestas de Bluesky, uno por tracker con la
cadencia del tracker** (diario para trackers diarios, semanal para los
de `updateIntervalDays: 7`), mostrados en el sitio como un panel de
solo lectura con marco visual propio ("Comunidad · sin verificar · no es
una fuente"), y el botón "Comentar" que abre Bluesky para responder. Sin
backend nuevo, sin cuentas propias, sin almacenar mensajes y **sin
ningún archivo horneado**: el navegador encuentra el post raíz vigente
en el propio feed público de la cuenta (`getAuthorFeed`) y lee sus
respuestas (`getPostThread`). Bluesky aloja el contenido, modera con su
propia infraestructura (etiquetadores, reportes) y el dueño oculta
respuestas con el `threadgate` del post raíz.

Advertencia que el dueño debe leer primero: la cuenta
`watchboard.bsky.social` tiene hoy **7 seguidores** y 97 de sus últimos
100 posts tienen 0 respuestas (sección 1). La opción B es una apuesta a
que el panel trae lectores del sitio a Bluesky, no una conversación que
ya exista; el piloto está diseñado para distinguir "nadie lo vio" de
"nadie quiso comentar" (P7, P12, P14).

No es un chat en tiempo real. Es la opción que da conversación visible
en la app sin convertir a Watchboard en prestador de alojamiento de
contenido de terceros (DSA) ni en responsable de tratamiento de
mensajes (RGPD). El chat real con Durable Objects queda descrito como
fase 2 condicionada, no como MVP.

Nada se construye hasta que el dueño decida si revierte la exclusión
del 09-21 (P1). La línea base "no hacer nada / enlazar fuera" es una
respuesta legítima y está evaluada como tal.

## 1. Contexto: qué existe hoy

Todo lo siguiente se verificó leyendo el código el 2026-09-24.

**El worker de Cloudflare.** `wrangler.toml` define un único worker,
`watchboard-push`, en `push.watchboard.dev` (`wrangler.toml:4,9-11`), con
un solo binding: el KV `PUSH_SUBSCRIPTIONS` (`wrangler.toml:14-16`) y un
cron cada 15 min (`wrangler.toml:19-20`). `worker/index.ts:5-15` lista
sus rutas: suscripción push (VAPID), preferencias, cron de RSS y
newsletter. No tiene Durable Objects, D1, WebSockets ni autenticación de
usuarios; el CORS está fijado a `https://watchboard.dev`
(`worker/index.ts:32-37`). Ningún workflow de `.github/` invoca
`wrangler`: el despliegue es manual. Alojar un chat ahí significa añadir
bindings nuevos (DO + D1), un pipeline de despliegue y un CORS que
también acepte la imagen Docker autoalojada, cuyo origen no es
`watchboard.dev`.

**Hallazgo lateral (fallo silencioso vigente).** `push.watchboard.dev`
**no** figura en `connect-src` ni en `src/layouts/BaseLayout.astro:97` ni
en `public/_headers:16`, pero `src/lib/push-client.ts:6,33,66` y
`src/pages/newsletter.astro:6,263` hacen `fetch` a ese host. El
navegador bloquea esas peticiones por CSP. El test
`src/lib/live-layers.test.ts:77-93` solo recorre las URLs del registro
`LIVE_LAYERS`, así que no lo detecta. Es exactamente la clase de defecto
de `docs/silent-failure-patterns.md`, y es el precedente directo para
este spec: cualquier endpoint de comentarios debe entrar en un registro
comprobado por ese test, no en un `fetch` suelto. (Se reporta aquí; su
arreglo es un PR aparte, ver P9.)

**CSP.** `frame-src` solo admite YouTube (`public/_headers:16`),
`form-action 'self'` y `script-src` sin terceros salvo PostHog y
Cloudflare Insights. giscus o Matrix necesitarían ampliar `frame-src`;
Bluesky solo necesita `https://public.api.bsky.app` en `connect-src`.

**Bluesky ya está en el sistema.** La cuenta `watchboard.bsky.social`
aparece en `src/components/static/Footer.astro:40` y
`src/pages/about.astro:149`. `scripts/bluesky-post.ts` publica la cola
social con `BLUESKY_HANDLE`/`BLUESKY_PASSWORD` (app password,
`scripts/bluesky-post.ts:15-16`), ya encadena respuestas con
`root`/`parent` (`:214-215`) y guarda el URI del post en el campo
`tweetId` del historial (`:492`, nombre heredado de X). El canario de
credenciales ya comprueba Bluesky
(`.github/workflows/credential-canary.yml:58-68`). La lectura pública
existe en `src/lib/realtime-sources.ts:30` contra
`https://public.api.bsky.app`, pero solo en scripts de servidor, no en
el navegador.

**Audiencia real de la cuenta (AppView pública, 2026-09-24).**
`app.bsky.actor.getProfile?actor=watchboard.bsky.social` →
`followersCount: 7`, `postsCount: 205`, etiqueta propia `bot`. De los
últimos 100 posts (`getAuthorFeed`, del 2026-06-04 al 2026-09-25), 97
tienen `replyCount: 0`, uno tiene 1 y dos tienen 2. **Ninguno** de esos
100 posts es un post por tracker: todos son el resumen multi-tracker
diario ("📊 {fecha}" + viñetas + `🔗 watchboard.dev`), 1-2 por día,
publicado por el post del video diario (`scripts/post-video-social.ts`).
El formateador por tracker de `scripts/bluesky-post.ts:103-113`
(`🔗 watchboard.dev/{slug}/`) existe en el código, pero su salida no
aparece en la cuenta en ese periodo; por qué es otro posible fallo
silencioso, fuera del alcance de este spec (P9 lo menciona). Conclusión:
no hay hoy ni conversación ni posts por tracker que reutilizar.

**Separación de ingestión.** El light scan sondea Bluesky solo por
`getAuthorFeed` de una lista fija de cuentas
(`src/lib/realtime-sources.ts:7-13,33`). Las respuestas de terceros a un
post de Watchboard no entran hoy en el pipeline; el diseño debe
garantizar que sigan sin entrar (ver 3.3).

**`/vote` ya usa GitHub.** `src/pages/vote.astro:60` construye
`issues/new?labels=tracker-vote`: el público que vota ya necesita cuenta
de GitHub. Es un precedente de "enlazar fuera a una plataforma con
identidad", no de alojar contenido.

**Analítica.** PostHog se carga solo si hay `PUBLIC_POSTHOG_KEY`
(`src/layouts/BaseLayout.astro:156-159`) y la página del tracker ya
envía `tracker_viewed` (`src/pages/[tracker]/index.astro:177-181`). Si
el panel añade o no un evento anónimo es decisión del dueño (P14): sin
él, la métrica del piloto no distingue "nadie abrió el panel" de "lo
abrieron y no comentaron".

**Despliegue.** Los pushes hechos con `GITHUB_TOKEN` no disparan
`deploy.yml` (`.github/workflows/deploy.yml:32-37`); `trackers/**` está
en `paths-ignore` (`:19-26`); el build solo recibe `PUBLIC_POSTHOG_*`
(`:107-120`) y el `Dockerfile` no declara ningún `ARG`. Un archivo
horneado que un bot actualiza, o un interruptor por variable de build,
no llegan al sitio sin un deploy explícito. Este diseño evita depender
de lo primero y cablea lo segundo (sección 7).

**Idiomas.** `astro.config.mjs:16` declara `en`, `es`, `fr`, `pt`;
las cadenas viven en `src/i18n/translations.ts` con su test
`src/i18n/translations.test.ts`.

## 2. Objetivos y no-objetivos

### Objetivos

1. Que un lector vea, dentro del tracker, qué está comentando la gente
   sobre lo que pasa hoy, y pueda sumarse en dos clics.
2. Que ningún comentario pueda confundirse con un dato con tier, ni
   visualmente ni estructuralmente (schemas, pipeline, RSS, API, MCP).
3. Cero backend nuevo en el MVP y ningún archivo horneado que caduque:
   el navegador descubre el hilo vigente en Bluesky, así que GitHub
   Pages no espera a un deploy y una imagen Docker antigua no se queda
   sin hilo. (La lista de bloqueo sí va en el build; por eso la imagen
   Docker trae el panel apagado por defecto, sección 7.)
4. Moderación, abuso, DSA, RGPD y menores resueltos por diseño antes de
   la primera línea de código, no después del primer incidente.
5. Sin rastreo: el panel no carga scripts ni iframes de terceros ni
   deja cookies; solo `fetch` anónimo a una API pública.
6. Degradación honesta: si Bluesky no responde, el panel lo dice
   (patrón `live-source.ts`), nunca muestra "0 comentarios" como si
   fuera verdad.

### No-objetivos (MVP)

- Chat en tiempo real con presencia, "escribiendo…" o mensajes privados.
- Cuentas de Watchboard, login propio, perfiles.
- Publicar desde la app sin salir de ella (requiere OAuth de atproto y
  un backend para sesiones; es fase 2).
- Comentarios anclados a un evento concreto o a un punto del mapa.
- Que el pipeline de datos use comentarios como candidatos (explícitamente
  prohibido, ver 3.3).
- Comentarios en la portada global (se evalúa tras medir los trackers).
- Traducción automática de comentarios.

## 3. El problema central: comentarios frente a la promesa de tiers

El 09-21 dijo: los mensajes serían Tier 4 sin verificar. Es correcto, y
por eso **los comentarios no deben tener tier en absoluto**. Darles
"Tier 4" sería peor: el Tier 4 existe para datos que el pipeline
consideró y marcó como no verificados; un comentario no pasó por ningún
criterio editorial. Asignarle un tier lo metería en la misma escala que
un parte del OIEA. La separación tiene tres capas.

### 3.1 Separación visual

- **Superficie propia.** Un panel "Comunidad" colapsado por defecto,
  nunca intercalado en timeline, KPIs, mapa, globo, carrusel, broadcast
  ni tarjetas de la portada. Dónde vive (solo al final del escritorio,
  o también una pestaña móvil y un acceso cerca del hero) es decisión
  del dueño (P12), no un valor por defecto: al final de la página y
  solo en escritorio es el lugar menos visible del sitio
  (`src/styles/mobile-tabs.css:1221-1224` oculta `.desktop-layout` bajo
  768 px), y el reloj de 60 días del piloto no empieza hasta que el
  panel sea visible en los dispositivos que usan los lectores.
- **Marco distinto.** Fondo neutro con borde discontinuo, tipografía de
  cuerpo (no la monoespaciada de datos), sin colores `--tier-*`,
  `--accent-red` ni `--accent-amber`, y **sin reutilizar** el chip de
  fuentes: `SourceStatusChip` pinta `className="source-chip
  freshness-indicator …"` (`SourceStatusChip.tsx:86-87`), y
  `.source-chip` es la clase de las citas con tier (JetBrains Mono,
  `.t1`-`.t4`, `global.css:979-994`). El estado del panel es una línea
  de texto en la fuente de cuerpo. Cabecera fija e i18n: "Comunidad ·
  Opiniones de lectores en Bluesky · Sin verificar · No es una fuente de
  Watchboard".
- **Sin insignias de confianza.** Nada de "verificado", recuentos de
  "me gusta" como señal de calidad, ni orden por popularidad: orden
  cronológico.
- **Atribución a la plataforma.** Cada comentario muestra el handle,
  la hora y un enlace "ver en Bluesky"; el lector sabe dónde vive el
  contenido y quién responde de él.
- **Enlaces inertes.** Texto plano; las URL del comentario se muestran
  pero con `rel="nofollow ugc noopener"`; sin imágenes ni previsualización
  de enlaces en el MVP (evita incrustar medios no revisados junto a
  miniaturas que sí pasaron por `usableMedia()`).

### 3.2 Separación estructural

- Tipo propio `CommunityComment` en un módulo nuevo
  `src/lib/community/`, **fuera** de `src/lib/schemas.ts`. No comparte
  campos `tier`, `source`, `pole` ni `contested` con ningún schema de
  datos; un test lo impone (ver Testing).
- Nada se escribe en `trackers/*/data/`. Los comentarios no se hornean
  en el build: el panel los pide en el navegador. Así no pueden acabar
  en Pagefind, RSS, `feeds.json`, `public/api/v1/`, el servidor MCP,
  el video diario ni la cola social.
- No se hornea ni siquiera el puntero al post raíz: el panel lo busca
  en `getAuthorFeed` de la cuenta por un marcador fijo en el texto
  (`watchboard.dev/{slug}/`). Lo único que va en el build es la lista
  de bloqueo (DIDs) y `community.enabled` de cada `tracker.json`.
- `/sources/` no mezcla el feed de comentarios con las fuentes de datos:
  las entradas con `renderer: 'panel'` se listan en una sección propia
  "Comunidad (no es una fuente)" con el alcance real (los trackers
  habilitados), no "all trackers" (`src/pages/sources.astro:34-43`).

### 3.3 Separación de ingestión

- `src/lib/realtime-sources.ts` sigue usando solo `getAuthorFeed` de su
  lista fija. Un test afirma que `watchboard.bsky.social` no está en esa
  lista y que ningún módulo de `scripts/` importa `src/lib/community/`,
  con una sola excepción nombrada en el test: el script de métrica del
  piloto, que solo lee Bluesky, imprime recuentos y no escribe a disco.
- Los comentarios nunca se pasan a un prompt de actualización, del fix
  agent ni del juez social. Si algún día un lector aporta una fuente
  útil, el camino es el issue-form de corrección existente
  (`.github/ISSUE_TEMPLATE/data-correction.yml`), revisado por humano.

### 3.4 Qué se dice al lector

El panel enlaza a una sección nueva de `/about` ("Comentarios de la
comunidad") que explica: son opiniones, no fuentes; Watchboard no las
verifica; cómo reportar; qué oculta el dueño y por qué. Esto responde
a la objeción del 09-21 con un contrato público, no solo con CSS.

## 4. Alternativas

Criterios: quién aloja el contenido (y por tanto carga con DSA/RGPD),
identidad, moderación disponible, tiempo real, coste, CSP, funcionamiento
en Docker autoalojado, y esfuerzo para un dueño que opera solo.

| Opción | Aloja el contenido | Identidad | Tiempo real | Backend nuevo | CSP nueva | Coste |
|---|---|---|---|---|---|---|
| 0. No hacer nada / enlazar fuera | Terceros | La de cada red | — | No | No | 0 |
| A. giscus (GitHub Discussions) | GitHub | Cuenta GitHub | No (recarga) | No | `script-src` + `frame-src giscus.app` | 0 |
| **B. Hilos de Bluesky** | **Bluesky** | **Cuenta Bluesky** | **Casi (polling 60 s)** | **No** | **`connect-src public.api.bsky.app`** | **0** |
| C. Worker + Durable Objects + D1 | Watchboard | Anónima o propia | Sí (WebSocket) | Sí | `connect-src` push/chat + `wss:` | Free tier CF |
| D. Matrix (sala + widget) | Homeserver elegido | Cuenta Matrix | Sí | Sí, o depender de matrix.org | `frame-src` o `connect-src` + `wss:` | 0 a VPS |
| E. Supabase / Firebase | Watchboard (vía proveedor) | Auth del proveedor | Sí | Gestionado | `connect-src` + `wss:` + SDK | Free tier con límites |

### 0. No hacer nada / enlazar fuera (línea base)

Un enlace "Comentar en Bluesky / Telegram" en el pie del tracker, sin
leer nada de vuelta. Cero riesgo y cero mantenimiento; mantiene intacta
la decisión del 09-21. Pero no cumple la petición: la conversación no
se ve en la app, y el lector no sabe que existe. Es la opción correcta
si el dueño decide mantener la exclusión (P1).

### A. giscus

Widget iframe sobre GitHub Discussions; un hilo por página (mapeo
`pathname`). A favor: gratis, maduro, moderación con las herramientas de
GitHub (bloqueo, ocultar, bloquear hilo), y `/vote` ya empuja al lector
a GitHub. En contra:

- El público de un panel de noticias mayoritariamente no tiene cuenta
  de GitHub; sería una conversación de desarrolladores.
- Exige `script-src https://giscus.app` y `frame-src https://giscus.app`:
  un tercero ejecutando código en cada página del tracker, justo lo que
  `scripts/csp-hashes.ts` intenta cerrar.
- El iframe guarda un token de sesión de GitHub en el origen de giscus;
  es un tercero más que ve qué tracker lee cada usuario autenticado.
- El dueño del repo pasa a moderar Discussions públicas en el mismo repo
  del código; spam y contenido ilegal llegan a su bandeja.
- Hilos por página, no por día: el hilo de un tracker de 3 años crece
  sin fin.

### B. Hilos de respuestas de Bluesky (recomendada)

Con la cadencia de cada tracker (diaria si `updateIntervalDays ≤ 1`,
semanal si no), el bot ya autenticado publica un post raíz por tracker
habilitado con el marcador `watchboard.dev/{slug}/`, con `threadgate`
según P4. El sitio encuentra el post raíz vigente con
`app.bsky.feed.getAuthorFeed` y lee sus respuestas con
`app.bsky.feed.getPostThread`, ambos en `public.api.bsky.app` (sin
autenticación, CORS abierto), y las muestra en el panel "Comunidad". El
botón "Comentar" abre `bsky.app/profile/…/post/…`. Un hilo semanal para
un tracker semanal evita preguntar "¿qué ves hoy?" sobre noticias que no
existen y no añade 21 posts por semana a una cuenta de 7 seguidores.

- **Quién aloja:** Bluesky. Es el prestador de alojamiento frente a la
  DSA para ese contenido; Watchboard solo muestra contenido público de
  otra plataforma y ofrece enlace de reporte a ella.
- **Moderación:** la de Bluesky (Ozone, etiquetadores, reportes) más el
  control del dueño sobre sus propios hilos: `threadgate` con
  `hiddenReplies` para ocultar respuestas y reglas de quién puede
  responder; y en el sitio, la lista de bloqueo propia (ver MVP).
- **Identidad:** cuentas Bluesky; sin cuentas propias ni contraseñas.
- **Tiempo real:** no; polling de 60 s mientras el panel está abierto y
  la pestaña visible (patrón `use-live-source.ts`).
- **Riesgo principal:** si nadie comenta, el panel está vacío; el estado
  vacío tiene que invitar, no parecer roto. Con 7 seguidores (sección
  1), casi toda respuesta tendrá que venir de lectores del sitio que
  abran una cuenta de Bluesky para ello (P2).

### B′. Variantes de B sin posts raíz dedicados

- **B′1 — respuestas a los posts por tracker que el bot ya publica.**
  Sería la más barata (sin posts nuevos, sin P3/P10), pero la cuenta no
  publica hoy posts por tracker: los 100 últimos son resúmenes
  multi-tracker (sección 1). Para usarla habría que reactivar o arreglar
  la salida por tracker de `scripts/bluesky-post.ts`, lo que equivale a
  publicar posts por tracker con otro texto. Si el dueño prefiere que
  esos posts sean a la vez noticia y hilo, el panel funciona igual: busca
  el marcador `watchboard.dev/{slug}/` sin importar qué script lo
  publicó.
- **B′2 — el resumen diario como hilo global.** Las respuestas al post
  "📊 {fecha}" que ya existe se mostrarían en un único panel (portada o
  todos los trackers). Cero posts nuevos, pero la conversación no es por
  tracker y mezcla Gaza con BTS en el mismo hilo.

Ambas quedan como opciones de P3; el MVP publica posts raíz dedicados
por cadencia porque es la única variante que da un hilo por tracker sin
cambiar otro pipeline.

### C. Worker de Cloudflare + Durable Objects + D1

Un DO por sala (`tracker:fecha`) con WebSocket Hibernation, D1 para
historial, Turnstile para anti-bots. Es la única opción que es un
"chat" de verdad y la única que no exige cuenta de terceros. Pero:

- Watchboard pasa a ser prestador de alojamiento: DSA art. 16 (mecanismo
  de notificación y acción), art. 17 (declaración de motivos por cada
  retirada), punto de contacto (arts. 11-12), y responsable de
  tratamiento RGPD de mensajes e IPs, con retención y derecho de supresión.
- Moderación humana 24/7 recae en un dueño solo; un chat anónimo sobre
  Gaza, Ucrania o Irán atraerá brigading y contenido ilegal en horas.
- El worker de hoy no tiene pipeline de despliegue ni está en la CSP
  (ver Contexto); su CORS excluye el despliegue Docker.
- Queda como fase 2 si la opción B demuestra demanda (P7).

### D. Matrix

Una sala por tracker, lectura vía API cliente o widget. Protocolo
abierto y federado, pero: el público general no tiene cuenta Matrix;
alojar un homeserver es un servicio más que operar, y usar matrix.org
deja la moderación de la sala en manos del dueño igualmente; los
proyectos de comentarios sobre Matrix (Cactus Comments) están sin
mantenimiento activo. Coste operativo alto para poca audiencia.

### E. Supabase / Firebase

Auth + base en tiempo real gestionadas con capa gratuita. Resuelve la
técnica, no el problema: Watchboard sigue siendo quien aloja el
contenido (mismas obligaciones que C), añade un SDK de terceros al
cliente y un proveedor más en la CSP. El proyecto gratuito de Supabase
se pausa por inactividad, lo que es un fallo silencioso esperando ocurrir.
Peor que C en encaje (C al menos reutiliza la cuenta de Cloudflare
existente).

## 5. Recomendación

**B — hilos de Bluesky por tracker, con la cadencia del tracker**, con la línea base (0) como
alternativa si el dueño mantiene la exclusión.

Por qué B y no las demás:

1. **Es la única que cumple la petición sin volver a Watchboard
   anfitrión de contenido de terceros.** C y E dan un chat mejor, pero
   imponen obligaciones DSA/RGPD y moderación que un proyecto de una
   persona no puede sostener; la exclusión del 09-21 tenía razón en eso.
2. **Reutiliza lo que ya funciona y ya se vigila:** la cuenta, las
   credenciales, el encadenado `root`/`parent` de
   `scripts/bluesky-post.ts` y el canario de credenciales.
3. **CSP mínima:** un host en `connect-src`, sin scripts ni iframes de
   terceros, sin cookies. Encaja con el registro de fuentes (ADR-0002)
   y con el test de CSP existente.
4. **No depende de un deploy para cada hilo:** el navegador descubre el
   post raíz en `public.api.bsky.app`, así que un hilo abierto a las
   06:00 UTC se ve en el sitio en cuanto la AppView lo indexa, en Pages
   y en Docker. Lo que sí depende del build (lista de bloqueo,
   interruptor, trackers habilitados) está descrito en la sección 7.
5. **Es reversible:** si el piloto no alcanza el umbral, se borra el
   panel y el bot deja de abrir hilos; no quedan datos que migrar.

**Qué es y qué no es esta recomendación.** Con 7 seguidores y 97 de 100
posts sin respuestas (sección 1), B no conecta el sitio a una
conversación existente: apuesta a crearla. El piloto mide dos cosas por
separado, alcance (¿los lectores ven y abren el panel?, P12 y P14) y
demanda (¿los que lo abren comentan?, P7). Si el dueño no quiere hacer
esa apuesta, la línea base 0 es la respuesta honesta.

Qué se sacrifica: tiempo real (60 s de retraso), comentar sin salir de
la app, y participación de quien no quiera cuenta de Bluesky. Los dos
primeros son la fase 2 (OAuth atproto o C); el tercero es el precio
explícito de no alojar anónimos.

## 6. Diseño del MVP (opción B)

Cada paso marcado **[dueño]** no se ejecuta sin su decisión explícita
(ver Preguntas abiertas). El orden es el de implementación.

### Paso 0 — Verificación previa (sin código de producción)

- Confirmar con `curl -H 'Origin: https://watchboard.dev'` que
  `getPostThread` **y** `getAuthorFeed` en `public.api.bsky.app`
  devuelven `Access-Control-Allow-Origin` y respuestas sin autenticación
  (también con `Origin: http://localhost:8080`, la imagen Docker).
- Confirmar el formato vigente de `app.bsky.feed.threadgate`
  (`allow`, `hiddenReplies`) y su límite: `hiddenReplies` tiene
  `maxLength: 50` en el léxico instalado
  (`node_modules/@atproto/api/dist/client/lexicons.js:7759-7761`).
- Confirmar que una lectura anónima trae las etiquetas: un post con
  etiqueta conocida (de post y de cuenta) debe mostrar `post.labels` y
  `post.author.labels` sin sesión. Si no las trae, los filtros de
  moderación no sirven y se para aquí (P8).
- Anotar resultados en el ADR; si algo falla, el diseño cambia (P8) y
  se para aquí.

### Paso 1 — ADR-0003 "Comentarios de la comunidad sin tier" **[dueño]**

Registra: revierte (o no) la exclusión del 09-21, la regla "los
comentarios no tienen tier", la fuente nueva `public.api.bsky.app`
(licencia: contenido de los autores bajo los términos de Bluesky;
Watchboard solo muestra y enlaza), el límite de 50 ocultaciones por
hilo y su escalado, y el criterio de retirada (P7).

### Paso 2 — Abrir el hilo por cadencia (bot)

- `scripts/community-threads.ts` (nuevo). Para cada tracker elegible
  (mismo predicado que la página: `status === 'active'` y
  `community.enabled: true`, y el interruptor global no en `false`),
  publica un post raíz si no existe ya uno vigente. Cadencia:
  `updateIntervalDays ≤ 1` → diaria; si no → semanal. "Vigente" se
  comprueba **contra Bluesky** (el `getAuthorFeed` de la propia cuenta,
  buscando el marcador `watchboard.dev/{slug}/`), no contra un archivo
  del repo: así un reintento tras un fallo parcial nunca duplica posts.
- Texto por plantilla (no LLM), en el idioma que decida P10, con el
  marcador y el aviso "no es una fuente". `threadgate` según P4: sin
  registro (todos), `followerRule` (seguidores) o `allow: []` (cerrado).
  Ojo: `allow: []` significa "nadie puede responder" — un test lo cubre.
- Reutiliza el login de `scripts/bluesky-post.ts` extrayendo su cliente
  a `scripts/lib/bluesky-client.ts` (sin cambiar su comportamiento; las
  lecturas siguen siendo `process.env.BLUESKY_*` literales para que
  `scripts/list-env-vars.ts --check` las vea).
- **No escribe nada en el repo** y no hace commit: no hay push con
  `GITHUB_TOKEN` que no dispare deploy, ni archivo que se quede viejo.
- Reglas anti-silencio: tras publicar, relee el `getAuthorFeed` público
  (con reintentos breves por la indexación) y exige encontrar el post
  nuevo con el marcador; si no, el paso falla en rojo. Un fallo de
  `threadgate` borra el post; si el borrado también falla, error rojo
  con el URI para que el dueño lo borre a mano.
- Workflow `community-threads.yml`, diario a las 06:00 UTC (el script
  decide por cadencia si toca), grupo de concurrencia propio (no
  `main-commits`: no hace commits), y un job `notify-failure` a
  `TELEGRAM_ALERT_CHAT_ID` con `failure() || cancelled()`, como
  `hourly-scan.yml:1082-1116`. **[dueño]** activar el cron.

### Paso 3 — Registro y CSP

- Dos entradas en `LIVE_LAYERS` (`src/lib/live-layers.ts`) con
  `kind: 'feed'`, `renderer: 'panel'` (valor nuevo, excluido de mapa y
  globo): `community-bluesky-roots` (`getAuthorFeed`, TTL 5 min) y
  `community-bluesky` (`getPostThread`, TTL 60 s). Así el test
  `src/lib/live-layers.test.ts:77-93` exige que el host esté en
  `connect-src` de `BaseLayout.astro` **y** `public/_headers`.
- Añadir `https://public.api.bsky.app` a ambos `connect-src`.
- En `/sources/` van en su propia sección "Comunidad (no es una
  fuente)", fuera de la tabla "Data sources" (sección 3.2).

### Paso 4 — Panel `CommunityPanel.tsx`

- Isla en `src/components/islands/community/`, montada con
  `client:visible` donde decida P12 (por defecto técnico: al final del
  layout de escritorio de `src/pages/[tracker]/index.astro` y sus
  variantes de locale), solo si el tracker es elegible.
- Colapsada por defecto; al abrirse lee `getAuthorFeed` y elige el post
  más reciente con el marcador del tracker y antigüedad ≤ 2 × cadencia
  (tolera un día o una semana sin hilo); después `getPostThread`, ambos
  vía `useLiveSource`, con `isEmpty: () => false` (un hilo sin
  respuestas es un dato real).
- Estado como texto de cuerpo ("actualizado hace 2 min" / "no se pudo
  actualizar; mostrando lo último cargado"); en error sin datos: "No se
  pudieron cargar los comentarios", nunca "0 comentarios".
- Rotula el hilo por su fecha ("Hilo · 24 sep"), sin "hoy"/"ayer": el
  día UTC no coincide con el del lector en América por la tarde.
- Renderiza texto plano (sin `dangerouslySetInnerHTML`), handle,
  hora relativa y "Abrir en Bluesky (para responder o reportar)"; no un
  botón "Reportar" que en realidad solo abre el post.
- Filtra en cliente como un lector **sin sesión** de Bluesky:
  respuestas en `hiddenReplies`; posts o cuentas (`post.labels` **y**
  `post.author.labels`) con `!hide`, `!warn`, `!no-unauthenticated`,
  `porn`, `sexual`, `nudity`, `graphic-media`, `gore`, `nsfl`,
  `doxxing`, `dmca-violation` o `spam` (respetando `neg`); cuentas en la
  lista de bloqueo del dueño; y respuestas de más de 1 nivel.
- Botón "Comentar en Bluesky" → URL del post raíz, `target=_blank`;
  `aria-controls` enlaza el botón de abrir con la región del panel.
- Máximo 50 respuestas; "ver todo en Bluesky" para el resto.

### Paso 5 — Textos e i18n

Cadenas nuevas en `src/i18n/translations.ts` para `en`, `es`, `fr`, `pt`
(cabecera de aviso, estados vacío/error, botones, línea de estado,
contrato con el contacto de retiradas de P6, enlace a `/about`).
`/about` existe solo en inglés (`src/pages/es|fr|pt` contienen solo
`[tracker]/` e `index.astro`), así que el contrato completo, **con el
contacto**, va dentro del panel en los 4 idiomas; la sección de
`/about` es el detalle en inglés. El texto del post raíz lo genera una
plantilla, no un LLM.

### Paso 6 — Activación gradual **[dueño]**

Habilitar `community.enabled` en los trackers piloto elegidos por el
dueño (P5) y empezar a contar 60 días **solo cuando** el panel sea
visible donde P12 decida. Métrica, leída al final directamente de
Bluesky por un script de solo lectura (sin archivos en el repo):

- **Demanda:** por cada post raíz del piloto, número de respuestas
  **visibles** (las que el panel mostraría, tras todos los filtros), no
  el `replyCount` bruto, que incluye ocultas, bloqueadas y anidadas.
  Como se lee una vez al final, cada hilo se cuenta con todas sus
  respuestas, no con el 0 del momento de publicarlo.
- **Alcance:** solo si P14 = sí, aperturas del panel y clics en
  "Comentar" (evento anónimo bajo el mismo gate de PostHog).

Umbral y criterio de retirada: los fija el dueño en P7 conociendo la
línea base de la sección 1 (97/100 posts sin respuestas). Sin dato de
alcance, un resultado bajo no dice si falló la visibilidad o la demanda,
y el informe debe decirlo así.

## 7. Moderación, legal y privacidad

Esta sección no es asesoría legal; lista lo que el diseño hace y lo que
el dueño debe confirmar (P6).

### Moderación

- **Primera línea:** Bluesky (moderación de plataforma, etiquetadores,
  reportes de usuarios). El panel filtra como un cliente de Bluesky
  **sin sesión**: etiquetas de post y de cuenta, incluida
  `!no-unauthenticated` (el autor pidió no ser visible sin sesión).
- **Segunda línea, el dueño:** ocultar respuestas vía `threadgate`
  `hiddenReplies` desde la app de Bluesky (se refleja en el sitio en
  ≤ 60 s). **Límite: 50 por hilo** (léxico, Paso 0). Pasadas ~40
  ocultaciones en un hilo, el dueño cierra el hilo (`allow: []`, sin
  deploy) y, si sigue, apaga el tracker (ver interruptores). Bloqueo de
  cuentas en `src/data/community/blocklist.json` (PR; un merge humano
  sí dispara `deploy.yml` por `push`, a diferencia de un bot).
- **Interruptores, del más rápido al más amplio:**
  1. Cerrar el threadgate del hilo vigente (app de Bluesky, segundos).
  2. Borrar el post raíz desde la app de Bluesky: el panel deja de
     encontrarlo en ≤ 5 min (TTL de `getAuthorFeed`) y muestra el hilo
     anterior si sigue en ventana, o "no hay conversación abierta".
  3. Global: `gh variable set PUBLIC_COMMUNITY_ENABLED --body false &&
     gh workflow run deploy.yml` (minutos). `deploy.yml` pasa
     `vars.PUBLIC_COMMUNITY_ENABLED` al build y el script del bot
     respeta la misma variable, así que tampoco abre hilos nuevos.
  4. Por tracker: `community.enabled: false` en su `tracker.json` y
     después `gh workflow run deploy.yml` (el merge solo no despliega:
     `trackers/**` está en `paths-ignore`).
- **Carga esperada:** el dueño revisa los hilos piloto una vez al día.
  Qué trackers entran es P5 (sección 10), sin recomendación previa.

### Límites de tasa y spam

- Spam y cuotas de publicación los aplica Bluesky; Watchboard no recibe
  escrituras.
- Lectura, solo con el panel abierto y la pestaña visible
  (`visibilitychange` en `use-live-source.ts`): un `getAuthorFeed` cada
  5 min y un `getPostThread` cada 60 s, con caché compartida y backoff
  30/60/120 s ante 429 ya implementados en `live-source.ts`.
- Opción `threadgate` "solo seguidores" (P4) como freno contra
  brigadas; con 7 seguidores equivale casi a cerrar el hilo.

### DSA (UE) — notificación y acción

- En el MVP Watchboard **no almacena** contenido de terceros: muestra
  contenido público alojado por Bluesky. La vía de notificación y
  acción sobre el contenido es la de Bluesky; cada comentario enlaza
  "Abrir en Bluesky (para responder o reportar)", que es lo que hace de
  verdad (no existe enlace público al diálogo de reporte).
- Aun así, Watchboard decide qué muestra: el contrato del panel, en los
  4 idiomas, da el contacto de P6 para pedir que un comentario deje de
  mostrarse en watchboard.dev; la acción es ocultarlo en el hilo o
  añadir la cuenta a la lista de bloqueo. El motivo **no** va en el
  mensaje del commit ni en el repo: se anota en un registro privado del
  dueño (P6).
- Si se pasa a la opción C (fase 2), Watchboard sería prestador de
  alojamiento y necesitaría arts. 11, 12, 16 y 17 completos: eso es un
  spec y una decisión aparte.

### Menores

- Bluesky exige edad mínima a sus usuarios y aplica sus propias
  verificaciones según jurisdicción; Watchboard no pide datos de edad.
- El panel está colapsado por defecto, no muestra imágenes ni medios de
  los comentarios y aplica los filtros de etiquetas de un lector sin
  sesión, lo que reduce la exposición a contenido gráfico.

### Contenido ilegal

- Retirada inmediata por el dueño (ocultar + lista de bloqueo) y reporte
  a Bluesky. Para material de abuso sexual infantil o terrorismo, el
  procedimiento es reportar a Bluesky y a la autoridad; no se guarda
  copia en el repo (la lista de bloqueo guarda el DID, no el texto).

### RGPD y privacidad

- Sin cookies, sin `localStorage` de identidad, sin scripts de terceros.
  El navegador del lector hace `fetch` a `public.api.bsky.app`, que ve
  su IP: se declara en `/about` como un destinatario más, igual que
  OpenSky o Nominatim hoy.
- Watchboard no guarda mensajes ni recuentos; no hay archivo de hilos.
- La lista de bloqueo guarda DIDs (dato personal seudónimo) en un repo
  público: base legal interés legítimo (moderación), revisión cada 6
  meses. **Quitar un DID no lo borra del historial de git**; `/about`
  lo dice así, sin prometer un olvido que el repo no permite. No se
  guardan hashes en su lugar: los DIDs son enumerables públicamente, así
  que un hash (con sal pública) seguiría siendo reversible y solo
  aparentaría anonimato.
- Si un autor borra su respuesta en Bluesky, desaparece del sitio en
  ≤ 60 s: no hay copia horneada que olvidar.
- Analítica del panel: ninguna salvo que el dueño apruebe P14.
- La imagen Docker se construye con el panel apagado por defecto
  (`ARG PUBLIC_COMMUNITY_ENABLED=false`): su lista de bloqueo quedaría
  congelada en la fecha de la imagen, y un autoalojador no debe mostrar
  cuentas que el dueño ya bloqueó.

### Identidad

Anónimo: no en el MVP (exigiría alojar, ver C). GitHub: descartado por
audiencia (A). Bluesky: identidad elegida; los handles de dominio
propio (ej. `reuters.com`) se muestran tal cual, pero **no** reciben
ningún tratamiento de "fuente" aunque el mismo handle figure con tier en
`realtime-sources.ts`: en el panel, una respuesta de `reuters.com` es
un comentario como cualquier otro.

## 8. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Un comentario se lee como dato (captura de pantalla fuera de contexto) | Media | Alto: erosiona la promesa de tiers | Marco visual y cabecera en cada captura posible del panel; panel fuera de toda superficie de datos; test estructural (3.2) |
| Panel vacío que parece roto | Alta al inicio | Medio | Estado vacío con invitación explícita; piloto de 3 trackers; criterio de retirada a 60 días |
| El bot no abre el hilo y el panel muestra uno anterior como si fuera el vigente | Media | Medio | El hilo se rotula por su fecha, sin "hoy"; el script relee el feed público y falla en rojo; alerta Telegram a `TELEGRAM_ALERT_CHAT_ID` |
| Posts raíz duplicados por reintentos tras un fallo parcial | Media | Medio: ruido en la cuenta pública | Idempotencia contra el feed de Bluesky, no contra un archivo del repo |
| El panel no se ve (solo escritorio, al final, colapsado) y el piloto se retira por falta de audiencia, no de demanda | Alta | Alto: decisión equivocada | P12 decide la colocación antes de empezar a contar; P14 decide si se mide el alcance; el informe separa alcance de demanda |
| Brigading supera 50 ocultaciones en un hilo | Baja-media | Alto | Escalado: cerrar hilo → borrar raíz → apagar tracker/global (sección 7) |
| CSP olvidada: el panel muere en silencio (como `push.watchboard.dev` hoy) | Alta sin registro | Alto | Entrada en `LIVE_LAYERS` → el test de CSP lo impone |
| Brigading en un tracker de conflicto | Media | Alto | Si P5 incluye uno: threadgate "solo seguidores"; cierre del hilo y borrado de la raíz sin deploy; interruptor global cableado a `deploy.yml` |
| Bluesky cambia la API, CORS o limita la AppView pública | Baja | Medio | `useLiveSource` con stale-on-error y línea de estado en texto; el panel degrada a "Comentar en Bluesky" |
| Revocación o bloqueo de la cuenta del bot | Baja | Medio | Canario de credenciales ya existente; sin hilo no hay panel, pero el resto del sitio no depende de él |
| Contenido ilegal visible entre la publicación y la acción del dueño | Media | Alto | Filtros de etiquetas de Bluesky; revisión diaria; colapsado por defecto; sin medios |
| Presión para "subir" comentarios útiles a datos | Media | Medio | Única vía: issue-form de corrección revisado por humano; test de no-importación en `scripts/` |
| Rate limit de la AppView por usuarios detrás de NAT compartido | Baja | Bajo | Polling solo con panel abierto y pestaña visible; backoff 429 existente |
| Coste de moderación supera el valor | Media | Medio | Métrica y criterio de retirada acordados antes de empezar (P5, P7) |

## 9. Testing

Siguiendo `docs/silent-failure-patterns.md`: cada prueba verifica el
artefacto, no el código de salida.

**Unitarias (vitest, corren en `.github/workflows/test.yml`):**

- `src/lib/community/parse-thread.test.ts` — de una respuesta fixture
  de `getPostThread` a `CommunityComment[]`: filtra `hiddenReplies`,
  etiquetas de post y de cuenta (incluida `!no-unauthenticated`), lista
  de bloqueo, profundidad > 1; orden cronológico; texto sin HTML;
  límite de 50.
- `src/lib/community-shared.test.ts` — `findRoot()` sobre un fixture de
  `getAuthorFeed`: marcador por slug, ventana de 2 × cadencia, el más
  reciente gana; `communityEnabledFor()`: interruptor, `force` solo e2e,
  `draft` y `archived` nunca.
- `src/lib/community/separation.test.ts` — el tipo `CommunityComment`
  no tiene claves `tier`, `source`, `pole`, `contested`; ningún archivo
  de `src/lib/schemas.ts`, `scripts/` (salvo el script de métrica, de
  solo lectura y sin escrituras a disco) ni `mcp/` importa
  `src/lib/community/`; `watchboard.bsky.social` no está en
  `BLUESKY_ACCOUNTS` de `realtime-sources.ts`; el panel no usa
  `SourceStatusChip`, `.source-chip` ni fuentes mono.
- `scripts/community-threads.test.ts` — con cliente atproto simulado:
  el `threadgate` generado nunca es `allow: []` salvo orden explícita
  de cierre; un hilo vigente en el feed no se vuelve a publicar; la
  cadencia semanal no publica a diario; un post que no aparece en el
  feed público al releer es un fallo.
- `live-layers.test.ts` existente — pasa a cubrir el host de las dos
  entradas `community-*` sin cambios en el test.
- `deploy.yml` pasa `vars.PUBLIC_COMMUNITY_ENABLED` al build (test de
  texto) y `scripts/list-env-vars.ts --check docs/self-hosting.md`
  sigue en verde.
- `src/i18n/translations.test.ts` existente — cubre las cadenas nuevas
  en los 4 locales.

**Componente:** la lógica de estados vive en un modelo de vista puro
(vitest es solo `node`); el comportamiento renderizado va en Playwright:
colapsado por defecto, ninguna petición hasta abrirse, lista filtrada,
vacío con invitación, error sin "0 comentarios", sin `.source-chip` ni
fuente mono dentro del panel, CSP limpia.

**En vivo (`npm run test:live`, `liveIt`):**
`tests/live/community-bluesky.live.test.ts` — `getAuthorFeed` y
`getPostThread` de un post conocido de la cuenta devuelven 200 con
cabecera CORS y el formato que esperan los parsers.

**Manual antes del piloto:**

1. `npm run build && npm run preview`; abrir un tracker habilitado en
   `en` y `es`; confirmar en la consola que no hay violaciones de CSP.
2. Repetir contra la imagen Docker construida con
   `--build-arg PUBLIC_COMMUNITY_ENABLED=true` (`tests/docker-smoke.sh`
   + navegador) para confirmar que `public/_headers` → nginx incluye el
   host, y que la imagen por defecto no monta el panel.
3. Ocultar una respuesta de prueba desde Bluesky y comprobar que
   desaparece del panel en ≤ 60 s; borrar un post raíz de prueba y
   comprobar que el panel deja de mostrarlo en ≤ 5 min.
4. Captura de pantalla del panel junto a la timeline revisada por el
   dueño: ¿se confunde con un dato? (criterio subjetivo, pero explícito).

## 10. Preguntas abiertas para el dueño

Ningún paso marcado **[dueño]** en el MVP avanza sin respuesta a su
pregunta. Ninguna tiene valor por defecto salvo donde se indica.

1. **P1 — ¿Revertir la exclusión del 09-21?** Opciones: (a) sí, con la
   opción B y el contrato "los comentarios no tienen tier"; (b) no,
   quedarse con la línea base 0 (enlace "Comentar en Bluesky" sin leer
   de vuelta); (c) sí, pero directamente un chat propio (C), aceptando
   el papel de prestador de alojamiento. Bloquea todo lo demás.
2. **P2 — ¿Es aceptable exigir cuenta de Bluesky para comentar?** Si la
   intención era un chat anónimo, B no lo cumple y solo C lo haría.
3. **P3 — ¿De dónde salen los posts raíz?** (a) posts dedicados por
   tracker y cadencia en `watchboard.bsky.social` (con 3 trackers
   semanales, 3 posts/semana; con uno diario, 7 más); (b) una cuenta
   separada (otro secreto y otro chequeo en el canario); (c) B′1:
   arreglar la salida por tracker de `bluesky-post.ts` y usar esos posts;
   (d) B′2: el resumen diario como hilo global.
4. **P4 — Política de respuestas:** todos, o solo seguidores de la
   cuenta (hoy 7: casi equivale a cerrar).
5. **P5 — Trackers piloto.** Compromiso real: los de baja polarización
   (p. ej. `cdmx`, `crispr-gene-therapy`, `bts`) son todos semanales y
   de poco tráfico, así que dan poca señal de demanda; un tracker de
   conflicto vivo da señal pero trae riesgo de brigading y contenido
   ilegal. ¿Cuáles, y al menos uno de alto tráfico o no?
6. **P6 — Contacto legal, registro privado y texto:** qué correo figura
   (en el panel, 4 idiomas, y en `/about`) para retiradas; dónde lleva
   el dueño el registro privado de motivos; y si quiere revisión legal
   del texto antes de publicar (DSA/RGPD).
7. **P7 — Criterio de éxito y retirada**, conociendo la línea base (97
   de 100 posts sin respuestas, 7 seguidores): ¿qué número de
   respuestas visibles por hilo al cabo de 60 días de panel visible?
   ¿Se acepta que B es una apuesta a crear audiencia? ¿Qué dispararía la
   fase 2 (OAuth atproto para comentar desde la app, o chat propio)?
8. **P8 — Si el paso 0 revela que la AppView no sirve CORS al navegador
   o no expone etiquetas o `hiddenReplies` sin sesión:** ¿aceptar un
   proxy mínimo en el worker (reintroduce el worker y su despliegue
   manual) o volver a la línea base 0?
9. **P9 — Fallos silenciosos laterales:** `push.watchboard.dev` falta en
   `connect-src` (ver Contexto), así que push y newsletter probablemente
   fallan en producción; y la salida por tracker de `bluesky-post.ts` no
   aparece en la cuenta desde al menos junio. ¿Abrir PRs aparte? No
   dependen de este spec.
10. **P10 — Idioma del post raíz:** inglés; español; bilingüe en+es en
    un solo post (cabe en 300 grafemas); o uno por locale (4× posts).
    Sin valor por defecto: el sitio publica en 4 idiomas y muchos
    trackers son mexicanos.
11. **P11 — `/sources/`:** listar los feeds de comentarios en una sección
    propia "Community (not a source)" (propuesta) o no listarlos.
12. **P12 — Dónde vive el panel:** solo al final del escritorio; además
    una pestaña en `MobileTabShell`; y/o un acceso "N comentarios" cerca
    del hero. El reloj del piloto empieza cuando se cumpla lo elegido.
13. **P13 — Imagen Docker:** panel apagado por defecto en imágenes
    autoalojadas (propuesta, por la lista de bloqueo congelada) o
    encendido.
14. **P14 — Medir el alcance:** permitir un evento anónimo
    `community_panel_opened` / `community_cta_clicked` bajo el gate de
    PostHog existente, o aceptar una métrica que no separa visibilidad
    de demanda.
## Adversarial review log

Revisión adversarial del 2026-09-24 (spec y plan). Cada hallazgo se
comprobó contra el código o la API pública antes de decidir. "Aceptado"
significa que el spec y el plan cambiaron; "Parcial" que se aceptó el
núcleo y se rechazó una parte, con la evidencia.

| # | lens | severity | finding | verdict | action/rationale |
|---|---|---|---|---|---|
| 1 | truth | critical | `threads.json` se sube con `GITHUB_TOKEN` y nada lo despliega; en Docker el panel muere a las ~48 h; el verify lee el archivo local | Aceptado | Verificado: `deploy.yml:32-37` (push de bot no dispara), crons `:40`, `Dockerfile` hornea `dist/`. Se elimina `threads.json`: el panel descubre la raíz con `getAuthorFeed` (§3.2, Paso 2/4; plan Deviation 4, Tasks 3, 8, 11). El script verifica en la AppView pública. Sin archivo `.json` propio, el SWR de `public/sw.js` deja de aplicar (solo cachea mismo origen, `sw.js:57-58`) |
| 2 | truth | important | El spec de Playwright usa `__dirname` en ESM y rompe al importar | Aceptado | `package.json:3` `"type": "module"`; `e2e/geo-layers.spec.ts:9` usa `new URL(…, import.meta.url)`. Task 14 reescrita así |
| 3 | truth | important | El e2e espera que `did:plc:blocked` se filtre, pero la isla usa la lista real vacía | Aceptado | El e2e espera 4 comentarios (r1, r5, r6, r2) y `nth(3)`; el bloqueo se prueba solo en unitario con `blockedDids` inyectado; nuevo test unitario que fija esos 4 |
| 4 | truth | important | Mover las lecturas de `BLUESKY_*` y añadir variables rompe `list-env-vars.ts --check` en `test.yml` | Aceptado | Verificado `test.yml:35-36`, regex `list-env-vars.ts:23`, `self-hosting.md:79-80`. El cliente usa `process.env.BLUESKY_*` literal como parámetro por defecto (con test); cada task que toca env corre `--write` y `--check`; `SITE_URL` desaparece (marcador fijo) |
| 5 | truth | important | Fallo parcial + `exit 1` antes del commit deja raíces sin registrar y el reintento duplica posts | Aceptado | Ya no hay commit: la idempotencia se comprueba contra el feed de Bluesky (`findRoot`), así que un reintento solo publica lo que falta (test "re-run after partial failure") |
| 6 | truth | important | El panel incrusta `SourceStatusChip` (`source-chip`, mono, colores de confianza) y la guarda no lo ve | Aceptado | Verificado `SourceStatusChip.tsx:86-87`, `global.css:979-994`, `:224-247`. Estado como texto de cuerpo; guarda de fuente prohíbe `SourceStatusChip`/`source-chip`/`freshness-indicator`; el e2e comprueba clases y `font-family` computada |
| 7 | truth | important | La métrica Q7 puede leer el 0 del momento de publicar; `replyCount` incluye ocultas y bloqueadas | Aceptado | Métrica nueva `scripts/community-metrics.ts`: lee cada hilo una vez al final y cuenta respuestas visibles tras los filtros del panel (TDD en Task 16) |
| 8 | truth | important | Task 0 no verifica que las etiquetas lleguen sin sesión; se ignora `author.labels`; no se menciona el tope de 50 ocultaciones | Aceptado | Verificado `lexicons.js:7759-7761` (`maxLength: 50`). Task 0 añade pasos de etiquetas sin sesión y del tope; `parseThread` filtra también `author.labels`; `spam` añadido; escalado documentado (§7) |
| 9 | truth | minor | El interruptor `PUBLIC_COMMUNITY_ENABLED` no llega a ningún build y el bot lo ignora; archivados montan panel | Aceptado | `deploy.yml` y `Dockerfile` lo reciben (Task 6, con test); el script usa el mismo predicado `communityEnabledFor` (activo + habilitado + interruptor) que la página; archivados excluidos |
| 10 | truth | minor | `/sources/` listaría el feed de comentarios como fuente de datos con alcance "all trackers" | Aceptado | Tabla de datos filtra `renderer: 'panel'`; sección propia "Community (not a source)" (Task 5 Step 7, P11) |
| 11 | truth | minor | Varias referencias de línea desviadas | Aceptado | Corregidas: `playwright.config.ts:35` (y `reuseExistingServer` `:37`), exclusión del 09-21 `:26-29`, tokens `global.css:44-50` |
| 12 | product | critical | La opción recomendada depende de una audiencia que no existe; el umbral de retirada mide el alcance de la cuenta, no la demanda | Aceptado | Verificado en vivo: 7 seguidores, 205 posts, etiqueta `bot`, 97/100 posts con 0 respuestas. Cifras en Resumen, §1 y §5 ("B es una apuesta"); P7 pide el umbral con la línea base a la vista; P14 permite medir alcance aparte |
| 13 | product | important | El MVP pone el panel en el sitio menos visible (solo escritorio, al final, colapsado) | Aceptado | Verificado `mobile-tabs.css:1221-1224`. P12 sin valor por defecto (escritorio / pestaña móvil / acceso cerca del hero); el reloj de 60 días empieza cuando la colocación elegida está en producción |
| 14 | product | important | Los trackers piloto sugeridos son semanales; un hilo diario pregunta por noticias que no hay | Aceptado | Verificado: `cdmx`, `crispr-gene-therapy`, `mrna-revolution`, `fusion-energy`, `bts`, `bad-bunny` con `updateIntervalDays: 7`. Cadencia por tracker (`threadCadenceDays`); P5 presentada como compromiso real, sin sugerencia previa |
| 15 | product | important | Variante omitida: mostrar respuestas a los posts por tracker que el bot ya publica | Parcial | La premisa no se sostiene en la cuenta real: los últimos 100 posts (2026-06-04 a 2026-09-25) son todos resúmenes multi-tracker del video diario; ninguno lleva `watchboard.dev/{slug}/`. Se añaden B′1 (arreglar la salida por tracker de `bluesky-post.ts`) y B′2 (resumen diario como hilo global) a §4 y a P3; el marcador hace que el panel funcione con cualquiera de ellas |
| 16 | product | important | El interruptor global solo existe en código | Aceptado | Igual que #9: variable de repo → `deploy.yml`; runbook `gh variable set … && gh workflow run deploy.yml`; test de texto sobre `deploy.yml` |
| 17 | product | important | "Reportar en Bluesky" solo abre el post; el contacto de retirada está solo en `/about` en inglés | Aceptado | Verificado: no existen `/es|fr|pt/about`. Un único enlace honesto "Abrir en Bluesky para responder o reportar"; el contacto de P6 va dentro de `community.contract` en los 4 idiomas, con test que exige una dirección real |
| 18 | product | important | El spec decidió solo no tener analítica, lo que vuelve ininterpretable la métrica | Aceptado | Verificado `src/pages/[tracker]/index.astro:177-181`. Nueva P14 (eventos anónimos bajo el gate de PostHog o aceptar la limitación); métrica sobre respuestas visibles |
| 19 | product | minor | Días UTC y rótulos hoy/ayer engañan a lectores en América | Aceptado | Rótulo "Hilo · {fecha}" en la zona del lector (`formatThreadDate`, test con `America/Mexico_City`); sin hoy/ayer; cadencia semanal reduce la dispersión |
| 20 | product | minor | P10 preestablecía inglés aunque el sitio publica en 4 idiomas | Aceptado | Sin valor por defecto; variable `COMMUNITY_ROOT_LANG` obligatoria; opción bilingüe `en+es` que cabe (293 grafemas medidos con la plantilla) |
| 21 | product | minor | Falta `aria-controls`; archivados montan un panel vacío para siempre | Aceptado | `aria-controls`/`id` en el panel (comprobado en e2e); `communityEnabledFor` exige `status === 'active'` (test para `draft` y `archived`) |
| 22 | failure | critical | El panel muestra posts que Bluesky oculta a lectores sin sesión (`!no-unauthenticated`, etiquetas de cuenta, `doxxing`, `nsfl`, `dmca-violation`) | Aceptado | Verificado `label/defs.d.ts:73`. Lista ampliada y aplicada a `post.labels` y `author.labels`, con fixtures r8-r10; `/about` y el contrato lo explican |
| 23 | failure | critical | El hilo de las 06:00 no llega al sitio hasta otro deploy; Task 16 verificaba el archivo, no el sitio | Aceptado | Igual que #1: descubrimiento en tiempo de ejecución; Task 16 despliega explícitamente el cambio de `tracker.json` y verifica en watchboard.dev |
| 24 | failure | important | No hay interruptor de emergencia real; `trackers/**` no despliega al hacer merge | Aceptado | Verificado `deploy.yml:19-26`. Cuatro palancas ordenadas por velocidad (§7): cerrar hilo, borrar raíz (sin deploy), por tracker con deploy explícito, global por variable; Task 17 cronometra la global |
| 25 | failure | important | La herramienta de moderación se agota a las 50 ocultaciones; la lista de bloqueo necesita PR y deploy | Parcial | Tope y escalado aceptados (§7, ADR, runbook). Rechazada la lista de bloqueo en tiempo de ejecución: un merge humano sí despliega por `push` (solo los pushes con `GITHUB_TOKEN` no, y `src/data/` no está en `paths-ignore`), y un archivo mismo-origen leído en tiempo de ejecución reintroduce un fetch que falla abierto. Las palancas sin deploy (cerrar hilo, borrar raíz) cubren la urgencia |
| 26 | failure | important | El panel usa el vocabulario visual de las insignias de fuente | Aceptado | Igual que #6 |
| 27 | failure | important | El e2e principal falla por la lista de bloqueo vacía | Aceptado | Igual que #3 |
| 28 | failure | important | La métrica de retirada queda cerca de cero por el `sort -u` y por contar el día 0 | Aceptado | Igual que #7: la canalización con `git log` y `sort` desaparece |
| 29 | failure | important | En Docker el panel decae en silencio; lista de bloqueo e interruptor congelados | Aceptado | El descubrimiento en tiempo de ejecución elimina el decaimiento del hilo; la lista congelada se resuelve con la imagen apagada por defecto (`ARG PUBLIC_COMMUNITY_ENABLED=false`, P13) y un párrafo en `docs/self-hosting.md`; Task 17 prueba ambas imágenes |
| 30 | failure | important | El registro de moderación es público y permanente, contra la promesa de revisión semestral | Parcial | Aceptado: motivos fuera de los commits y del repo (registro privado, P6); `/about` dice que el historial de git conserva los DIDs retirados. Rechazado: guardar hashes de DIDs; los DIDs son enumerables en la red pública y la sal estaría en el repo, así que el hash sería reversible y solo aparentaría anonimato |
| 31 | failure | minor | Fallos silenciosos, cola `main-commits` y doble publicación al reintentar | Aceptado | Job `notify-failure` a `TELEGRAM_ALERT_CHAT_ID` con `failure() || cancelled()`; grupo de concurrencia propio (el workflow ya no hace commits); idempotencia contra el feed y aviso con el URI si un borrado falla |
