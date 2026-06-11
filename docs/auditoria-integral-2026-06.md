# Auditoría integral de Watchboard — junio 2026

Auditoría completa del sitio (exploración en Chrome contra `npm run dev`) y del
codebase (6 revisiones paralelas por área: `src/lib`, islas React,
páginas/estáticos/estilos, `scripts/`, workflows de GitHub, pipeline de video +
integridad de datos). Cada hallazgo incluye archivo y línea. Los hallazgos
marcados **[verificado]** fueron reproducidos directamente (consola del
navegador, lectura del código o shell); el resto proviene de los agentes de
revisión y fue contrastado cuando la severidad lo ameritaba.

**Estado general:** el producto es sólido y ambicioso — el command center con
globo, el carousel móvil, métricas, feeds y la página de auditoría de breaking
news funcionan y se sienten profesionales. Los problemas dominantes son tres
patrones transversales: (1) **i18n a medias** que rompe la hidratación de React
y deja la UI en spanglish, (2) **datos no confiables tratados como confiables**
(JSON generado por IA y contenido RSS fluyen a HTML, prompts y shells sin
sanitizar), y (3) **estado compartido en `main`** donde 6+ workflows
concurrentes compiten por commits y el pruning de logs ya está fallando.

---

## 1. Top 10 — lo que arreglaría primero

| # | Hallazgo | Severidad | Dónde |
|---|----------|-----------|-------|
| 1 | Mismatch de hidratación i18n en TODAS las islas traducidas (`LIVE`→`EN VIVO`, `LATEST`→`ÚLTIMO`, `Loading queue...`→`Cargando cola...`): React descarta y regenera el árbol completo en cliente | Crítico | `BroadcastOverlay`, `LatestEvents`, `SocialCommandCenter`, … |
| 2 | `SyntaxError: Unexpected token 'catch'` — llave desbalanceada mata el script inline de las ~95 páginas de globo (PostHog, contador de días, gesture hint muertos) | Crítico | `src/pages/[tracker]/globe.astro:93-103` |
| 3 | Inyección de script vía `workflow_dispatch` input interpolado en `run:` y en prompt de claude-code-action con `contents: write` | Crítico | `.github/workflows/batch-init-trackers.yml:42-53,64` |
| 4 | Superficie de prompt-injection: títulos RSS/Bluesky/Telegram → triage IA → prompts de actualización → commits a `main` sin sanitización | Crítico | `hourly-scan.yml:127-157,465`, `generate-social-queue.ts:216-222` |
| 5 | SSRF/escape de shell: URLs provistas por IA/RSS pasan a `execSync(curl …)`; sigue redirects, acepta esquemas arbitrarios | Crítico | `scripts/thumbnail-utils.ts:129-131,232-234`, `scripts/local-hourly.ts:293-307` |
| 6 | `triage-log.json` pesa **7.2 MB / 9,426 entradas** commiteado y se descarga completo en `/breaking-news-audit/`; el prune no avanza desde 2026-05-21 (race de rebase en light-scan) | Alto | `public/_hourly/triage-log.json`, `src/lib/triage-log.ts` |
| 7 | Locales `fr`/`pt` nunca cargan: el lookup usa siempre `esDataModules`, los 55+ trackers con `data-fr`/`data-pt` sirven inglés en silencio | Alto | `src/lib/data.ts:40-55` |
| 8 | XSS latente: `set:html={JSON.stringify(...)}` en 8 JSON-LD no escapa `</script>`; `--accent:${accentColor}` sin validar en embed (datos generados por IA = no confiables) | Alto | `[tracker]/index.astro:91`, `briefing/*.astro`, `embed/[tracker].astro:84` |
| 9 | Carrera de commits a `main` entre 6 workflows; pushes sin retry (`tally-tracker-votes.yml:163`, `backfill.yml:52`) o con fallo silencioso (`daily-video.yml:169`) | Alto | `.github/workflows/*` |
| 10 | El wheel sobre el mapa Leaflet se traga el scroll de la página del tracker (la página no avanza; `scrollY` queda en 0) | Alto (UX) | `IntelMap.tsx` (scrollWheelZoom) |

---

## 2. Hallazgos del sitio (Chrome) — UX / UI / diseño

### 2.1 Errores funcionales [verificado]

- **Hidratación rota por i18n (sistémico).** El servidor renderiza inglés y el
  cliente detecta `es` tras montar, así que React lanza el error #418 y
  regenera el árbol entero. Se reprodujo en la home (`BroadcastOverlay`:
  `LIVE`→`EN VIVO`), en la página de tracker (`LatestEvents`:
  `LATEST`→`ÚLTIMO`) y en `/social/` (`Cargando cola...`). Costo real: doble
  render de islas pesadas, flash de contenido y pérdida del beneficio de SSR.
  **Fix recomendado:** decidir el locale en build por ruta (`/es/...` ya
  existe) y que las islas reciban `locale` como prop; para detección dinámica,
  renderizar el string por defecto y cambiarlo en `useEffect` (mismo patrón
  SSR-safe que ya usa `FreshnessBadge.tsx`).
- **Script inline del globo muerto.** `globe.astro:100` — falta un `}` que
  cierre el bloque `try` antes del `catch` (las llaves de las líneas 93–103
  están desbalanceadas). El parser descarta el script completo: no se registra
  PostHog (`globe_opened`), el mini-HUD nunca muestra `DAY N` y el gesture
  hint móvil no aparece. Afecta a todas las páginas `/{slug}/globe/`.
- **El globo 3D renderiza en negro en dev** con `RequestErrorEvent` de Cesium
  en consola. Verificar si en producción (assets copiados a `public/cesium/`)
  ocurre lo mismo; en dev la página queda inutilizable salvo el scrubber.
- **Scroll secuestrado por el mapa.** En la página de tracker, la rueda del
  mouse sobre el `IntelMap` hace zoom al mapa en vez de hacer scroll; como el
  mapa ocupa gran parte del viewport, la página "no scrollea". Fix: Leaflet
  `scrollWheelZoom: false` hasta click/focus (o gesture handling tipo
  Ctrl+wheel), patrón estándar en dashboards con mapas embebidos.
- **`/search/` sin input en dev.** Pagefind solo existe tras `npm run build`
  (postbuild), y la página no renderiza ningún fallback: solo título y
  subtítulo. Mínimo: mensaje "search index not built" en dev + fallback de
  filtrado client-side sobre la lista de trackers (nombres/tags ya están en
  el bundle).
- **Thumbnails vacíos en varias superficies.** El lower-third del broadcast
  muestra una caja blanca vacía; la tarjeta expandida del sidebar muestra una
  caja de media vacía con caption "Axios · T2"; el story card móvil (CHINA
  TECH 1/5, "CGTN · T2") muestra área de imagen negra; las tarjetas de
  `/videos/` tienen el hueco de thumbnail en blanco. El fallback de 3 niveles
  documentado (media → OSM tile → gradiente) no está entrando. Causas
  probables: hotlink bloqueado por los medios (AP/Reuters/CGTN) y `onError`
  no disparando el fallback. Fix: validar con HEAD en build (ya existe en el
  finalize — propagar el resultado), y manejar `onError` del `<img>` para
  degradar a tile/gradiente.

### 2.2 Inconsistencias de idioma [verificado]

Con el navegador en español, la UI queda mezclada:

- Página de tracker: "LATEST EVENTS" (en) junto a "ÚLTIMO … 6 eventos" (es);
  categorías mezcladas "TRADE"/"LEGAL" vs "DIPLOMÁTICO"/"POLITICAL".
- Home móvil: tabs "LIVE"/"TRACKERS" en inglés, pero "EN VIVO", "DÍA 4027",
  "RESUMEN", "7 secciones actualizadas" en español.
- `/metrics/`: todo en español salvo los chips "ALL / NIGHTLY / HOURLY".
- Panel de atajos: "COMPARAR" en mayúsculas mientras el resto va en
  sentence-case ("Enfocar búsqueda", "Abrir panel") — parece una key de
  constante sin pasar por el catálogo.
- `/videos/`, `/feeds/`, `/vote/`, `/breaking-news-audit/`: copy 100% en
  inglés sin variante.

**Recomendación:** un catálogo central de strings por locale (ya existe
`src/i18n/translations.ts`) y un lint/CI check que falle ante strings UI
hardcodeados en islas. Decidir una política: o todo el shell de UI se traduce,
o se fija inglés para el chrome y se traduce solo contenido.

### 2.3 Detalles visuales y de pulido

- Doble badge "BREAKING" pegados en el ticker inferior de la home
  [verificado, screenshot]: el label estático del contenedor y el primer item
  del ticker lo repiten.
- KPI strip del tracker (header sticky): 7 KPIs comprimidos con labels en
  ~8px; "~10% + new proposals" y su subtítulo se truncan. Sugerencia: máximo
  4–5 KPIs en el strip sticky con overflow a un popover "more KPIs".
- En el panel expandido del sidebar (home), la segunda KPI card se corta en el
  borde derecho del panel (overflow horizontal sin indicador de scroll).
- URLs largas en `/feeds/` se truncan sin tooltip ni botón copiar
  (`https://watchboard.dev/rss/breaking.x…`). Un botón "copy" por feed sería
  más útil que el texto truncado.
- `/breaking-news-audit/` muestra "9426 of 9426 entries" y los renderiza
  paginados pero descarga el JSON completo (7.2 MB) — en móvil/3G la página
  tarda. Ver hallazgo #6.
- Slider "Min score" usa estilo nativo del browser, desentona con el design
  system oscuro.
- La página 404 personalizada existe y está bien resuelta (verificado vía
  `/watchboard/`, que ya no es el base path — `astro.config.mjs` usa
  `base: '/'`; **CLAUDE.md sigue diciendo que las fonts viven en
  `/watchboard/fonts/` → docs desactualizadas**).

### 2.4 Accesibilidad

- Sin focus trap ni `aria-modal` en los diálogos del onboarding
  (`SpotlightStep.tsx:107-151`, `HeroStep.tsx:52-86`): Tab escapa al contenido
  de fondo; lectores de pantalla leen toda la página detrás del overlay.
- Dots del `ImageCarousel` son `<span onClick>` sin `role`/`tabIndex`/label
  (`CommandCenter/ImageCarousel.tsx:117-126`); flechas `‹›` sin `aria-label`.
- Ícono expand de `ClaimsMatrix.astro:21` sin `aria-hidden`.
- Dos `<h2>` "Latest Events" en la misma página de tracker
  (`[tracker]/index.astro:111,132`); el anchor `#events` aterriza en el bloque
  SEO, no en el panel real.
- `embed/[tracker].astro:78` hardcodea `lang="en"` para cualquier tracker.

---

## 3. Hallazgos de código por área

### 3.1 Seguridad (transversal) — prioridad máxima

1. **Inyección en workflows** [agente, líneas verificadas]:
   `batch-init-trackers.yml` interpola `${{ github.event.inputs.trackers }}`
   crudo en `run:` (líneas 42, 53, 218) y en el prompt del action (línea 64)
   que corre con `--dangerously-skip-permissions` y `contents: write`. Fix:
   pasar inputs por `$GITHUB_ENV`/archivo temporal con heredoc quoted, nunca
   interpolación directa.
2. **Cadena de prompt-injection RSS → repo**: el contenido de feeds externos
   llega sin sanitizar al triage IA (`hourly-scan.yml:127`) y luego
   `${{ matrix.entry.data }}` se interpola en el prompt de actualización
   (línea 465). Lo mismo en `generate-social-queue.ts:216-222` (titulares de
   eventos → prompt que decide tweets). Fix mínimo: truncar campos, delimitar
   el contenido como bloque literal y bajar permisos del paso de triage a
   read-only.
3. **SSRF + shell**: `thumbnail-utils.ts` y `local-hourly.ts` pasan URLs de
   IA/RSS a `execSync('curl -sL …')`. Migrar a `fetch` nativo con allowlist
   `https:` y blocklist de rangos privados/link-local.
4. **XSS latente en JSON-LD** [verificado: 8 usos]: `JSON.stringify` no escapa
   `</script>`. Fix de una línea:
   `JSON.stringify(obj).replace(/</g, '\\u003c')` en un helper compartido.
5. **CSS injection en embed** [verificado]:
   `<style set:html={`:root{--accent:${accentColor}}`}>` con `config.color`
   sin validar (Zod lo deja como `z.string()`). Validar `/^#[0-9a-fA-F]{3,8}$/`
   o usar `define:vars`.
6. **PAT de GitHub en `localStorage`** (`SocialCommandCenter.tsx:317-319,476`):
   expuesto a cualquier XSS; además se pide vía `prompt()`. Mover a
   `sessionStorage` como mínimo y documentar el riesgo; idealmente un flujo
   de device-auth.
7. **Acciones sin pin por SHA** en todos los workflows, y un caso peor:
   `update-data.yml:1003` usa `anthropics/claude-code-action@main` (ref
   mutable) mientras el resto usa `@v1`. Unificar a `@v1` ya; considerar
   SHA-pinning para `checkout`/`deploy-pages`.

### 3.2 `src/lib`

- **Crítico (latente):** `geo-utils.ts:300,304` usa `evt.date` pero
  `TimelineEvent` solo tiene `year` → sort por `NaN` y dedup key
  `"undefined::…"`. Solo se activa con `aggregate: true` (hoy ningún tracker),
  pero explotará con el primer tracker agregado. Igual que la recursión sin
  guard de `loadTrackerData` para agregados anidados (`data.ts:213-233`).
- **Alto:** `data.ts:40-55` — fr/pt buscan en `esDataModules` (ver Top 10 #7).
  Confirmado de forma independiente por dos agentes.
- **Alto:** `ai.relatedTrackers` no está en `AiConfigSchema`
  (`tracker-config.ts:69-83`); Zod lo *stripea* del config tipado. Hoy lo
  salva que `generate-sibling-brief.ts` hace `JSON.parse` crudo, pero cualquier
  consumidor tipado lo verá `undefined`. Fix: 1 línea en el schema.
- **Medio:** `DateFieldSchema` compara contra hoy-UTC sin buffer
  (`schemas.ts:82-90`): actualizaciones cerca de medianoche UTC pueden
  rechazar fechas válidas. Permitir +1 día.
- **Medio:** `keyword-match.ts:70-73` — mete el `searchContext` completo como
  "frase"; con 10+ tokens nunca matchea un titular, así que el 0.30 de peso de
  `phraseHits` es sistemáticamente 0 para esa fuente. Partir por comas.
- **Medio:** `realtime-sources.ts:66-76` — dos `matchAll` independientes para
  IDs y textos de Telegram pueden desalinearse y producir URLs de posts
  equivocadas. Parsear cada bloque de mensaje de forma holística.
- **Bajo:** `constants.ts:5-21` deriva los defaults de nav/tabs del
  *primer tracker alfabético activo* — cambia silenciosamente al agregar
  trackers. `pwa-refresh.ts:465-471` se auto-inicializa al importar.

### 3.3 Islas React

- `useStoryState.ts:128` — el array de deps contiene la *expresión booleana*
  `seenSlugs.size > 0`: el efecto solo dispara cuando flippea, nunca con
  cambios posteriores. Cambiar a `[seenSlugs.size]` + guard.
- `map-helpers.ts:7-11` + `IntelMap.tsx:41` — singleton mutable a nivel módulo
  escrito **durante el render** (violación de pureza; dos mapas en una página
  se pisan las categorías/colores). Pasar categorías por prop/context.
- `BroadcastOverlay.tsx:199-234` — el rAF de inercia del ticker puede
  re-agendarse después del `cancelAnimationFrame` del unmount (mutación de DOM
  desmontado). Añadir flag `cancelled`.
- `BroadcastOverlay.tsx:128-133` — closure obsoleto de `isUserPaused` en el
  grace-timer puede reiniciar el dwell y saltarse trackers.
- `MetricsDashboard.tsx:1346-1372` — `setIndex`/`setLoading` sin guard de
  `mountedRef` en el fetch externo.
- `TimelineSection.tsx:59` — "1941 – Present" **hardcodeado** para todos los
  trackers (incorrecto para BTS, CRISPR, etc.). Derivarlo de los datos.
- `MilitaryTabs.tsx:17-23` — `parseTimeField` asume año 2026 fijo.
- `NotificationManager.tsx:21` — `hasRun` ref nunca se resetea: follows nuevos
  no notifican hasta recargar.
- `TriageLogBoard.tsx:32` — `localeCompare` para ordenar ISO timestamps;
  usar comparación simple de strings.
- Duplicación casi total entre `OnboardingTour.tsx` y `MobileOnboarding.tsx`:
  extraer `useOnboardingController(steps, tourType, eventName)`.

### 3.4 `scripts/` (pipeline de datos)

- **Escrituras no atómicas** que pueden corromper JSON ante un SIGTERM del
  runner: `backfill.ts:443,460` y los tres saves de
  `social-types.ts:112-133` (`queue`/`budget`/`history`). Replicar el
  `atomicWriteFile` de `update-data.ts` (tmp + rename).
- **Riesgo de doble-posteo en X**: `post-social-queue.ts:195-203` guarda
  queue/budget/history solo al final del loop; un crash a mitad re-postea lo
  ya publicado. Persistir tras cada tweet.
- **Coerción de fechas peligrosa**: `update-data.ts:313-319` pasa cualquier
  string por `new Date()` (`"Mar 7"` → fecha del año actual). Restringir a
  patrones ISO explícitos.
- **Scripts legacy con paths muertos**: `backfill.ts:16-17` y
  `backfill-gaps.ts:10-11` apuntan a `src/data/` (arquitectura previa) y el
  prompt hardcodea el teatro Irán (líneas 379-413). O se parametrizan con
  `--tracker` o se borran (recomendado: borrar; `update-data.ts` ya cubre el
  caso).
- Validación de hilos de Twitter no incluye el link que se appendea al postear
  (`generate-social-queue.ts:362-371` vs `post-social-queue.ts:145`): el
  último tweet puede pasarse de 280.
- `thumbnail-utils.ts:208-213` — heurística `/\d{4}\/\d{2}\//` rechaza URLs
  de imagen legítimas de CDNs con fecha en el path (CNN/Reuters).
- Duplicación literal de ~8 utilidades (`extractJSON`,
  `repairTruncatedJSON`, …) entre `update-data.ts` y `backfill.ts`, ya
  divergidas. Extraer `scripts/lib/ai-utils.ts`.
- `hourly-light-scan.ts:186-227` — si Telegram falla, la URL igual entra a
  `state.seen`: la alerta se pierde para siempre (el heavy scan sí la recibe).
  Registrar `telegram_failed` para reintentar.

### 3.5 Workflows y automatización

- **Concurrencia**: añadir `concurrency:` groups que serialicen los commits de
  `post-social-queue.yml`, `weekly-digest.yml`, `tally-tracker-votes.yml` y el
  finalize de `update-data.yml`; dar retry con jitter a
  `tally-tracker-votes.yml:163` y `backfill.yml:51-52` (hoy un push rechazado
  pierde los datos en silencio); quitar el `|| echo "non-fatal"` de
  `daily-video.yml:169`.
- **Paso de Telegram del video posiblemente nunca corre** [verificado el
  patrón, no el runtime]: `daily-video.yml:271` y `:474` usan
  `if: env.TELEGRAM_BOT_TOKEN != ''` pero el env solo se define en el propio
  step y no existe `env:` a nivel workflow/job. Si el contexto `env` del `if`
  no incluye el env del propio step (comportamiento documentado ambiguo),
  ambos pasos se saltan siempre. **Verificar en los runs reales**; el fix
  robusto en cualquier caso es `if: ${{ secrets.TELEGRAM_BOT_TOKEN != '' }}`.
- `init-tracker.yml:396-414` — el job `seed` hace checkout de `main`
  inmediatamente tras el push del `init` (consistencia eventual de GitHub):
  fallos intermitentes. Poll corto o usar el artifact del init.
- `seed-tracker.yml:311` — setear `valid=false` explícito en fallo (hoy el
  gate funciona de rebote, pero es frágil y sin observabilidad).
- `seed-tracker.yml:324-328` — 3 retries con sleep fijo de 2s y sin `exit 1`
  al agotar: seeds en lote pueden perderse en silencio.
- `Makefile:130-141` — `audit`/`measure` dependen de scripts en `/tmp` no
  versionados y hacen no-op silencioso. Commitearlos o `exit 1`.

### 3.6 Video + integridad de datos

- `video/src/components/Background.tsx:181-185` — gradiente CSS malformado
  (`scanlineColor` parcial `'rgba(231, 76, 60,'`): el browser descarta el
  background y el efecto scanline no se ve en ningún tema.
- `video/render.ts:200` — el MIME del thumbnail se deriva de la URL original,
  no del content-type real; PNGs etiquetados `image/jpeg` pueden no decodificar
  en el Chromium headless de Remotion (6 URLs de artículo confirmadas en
  `daily-log.json`).
- `video/package.json` — `@remotion/bundler` en devDependencies pero se usa en
  el render de CI; `playwright` en dependencies y no se usa en ningún archivo
  (~100 MB de node_modules gratis).
- `public/_metrics/runs/` — archivos de runs huérfanos (p. ej.
  `2026-03-11T06-23-07Z.json`) que el prune de 90 días del index nunca borra:
  crecimiento indefinido. Borrar los runs que no estén en el index podado.
- `trackers/bts/tracker.json:163-168` — `relatedTrackers` incluye
  `india-pakistan-conflict` y `afghanistan-pakistan-war` para el tracker de
  BTS: contamina el sibling brief con contexto bélico irrelevante.
- **Correcciones a claims de agentes** (verificadas en shell): `sharp` SÍ
  resuelve (transitivo vía `astro@5.18.0`) — el build no está roto; aún así
  conviene declararlo como dependencia directa porque se importa explícitamente
  en `src/pages/og/[tracker].png.ts`. `scripts/hourly-triage.ts` sí existe (el
  copy de la página de auditoría es correcto).

### 3.7 Dependencias y configuración

- `zod` en `devDependencies` pero se importa en código que llega al bundle
  cliente (`package.json:56`) → mover a `dependencies`. `@astrojs/check` al
  revés: está en `dependencies` y es tooling → mover a `devDependencies`.
- Fallbacks de base path inconsistentes: los 3 endpoints RSS usan
  `|| '/watchboard'` (`rss.xml.ts:17`, etc.) mientras el resto usa `|| '/'`;
  `sitemap-news.xml.ts:29` y los `hreflang` de `BaseLayout.astro:67-69`
  omiten `basePath`. Hoy no rompe (`base: '/'`) pero es deuda que explota si
  el base cambia. **Actualizar también CLAUDE.md** (sección CSS: ya no es
  `/watchboard/fonts/`).
- Feeds RSS: GUIDs por fecha (duplicados si hay 2 digests/día), `<guid>`
  duplicado por item en `light-scan.xml.ts:67-73` (viola RSS 2.0), y HTML en
  `description` que `@astrojs/rss` escapa y se ve como texto literal
  (`light-scan.xml.ts:39-48`).
- Astro 6.4.5 disponible (corriendo 5.18.0) — planear upgrade.
- `.sr-only` duplicado en `index.astro:247-257` vs `global.css:87-97`.

---

## 4. Propuestas de mejora (diseño, UX y funcionalidades)

### 4.1 UX/UI

1. **i18n completo y por ruta** (resuelve #1 del Top 10 y el spanglish):
   locale decidido en SSR, catálogo único, lint de strings hardcodeados.
2. **Política de scroll del mapa**: zoom solo tras click/focus + botón
   fullscreen; en móvil, two-finger pan (Leaflet gestureHandling).
3. **Sistema de imagen robusto**: skeleton + `onError` → OSM tile → gradiente
   en *todas* las superficies (broadcast, sidebar, stories, /videos), y
   reutilizar el resultado de la validación HEAD del finalize para no intentar
   cargar URLs ya conocidas como rotas.
4. **KPI strip responsivo**: 4–5 KPIs visibles + popover; tooltips con la
   definición y fuente/tier de cada KPI.
5. **Search siempre disponible**: fallback client-side (nombres/tags de
   trackers) cuando Pagefind no está, y atajo `/` global en todas las páginas
   (hoy solo en la home).
6. **Audit page paginada**: servir `triage-log` particionado por semana
   (`triage-log-2026-W23.json`) y cargar bajo demanda; deja de crecer el
   payload y arregla de paso el problema de prune (#6).
7. **Onboarding accesible**: focus trap + `aria-modal` + `prefers-reduced-motion`.

### 4.2 Funcionalidades nuevas (ordenadas por valor/esfuerzo)

1. **Comparador de trackers** (la tecla `C COMPARAR` ya existe en el panel de
   atajos): vista 2-up con KPIs y timelines alineadas por fecha. Mucho del
   estado ya está en `CommandCenter`.
2. **Notificaciones web push para "Seguir"**: el follow y el
   `NotificationManager` ya existen; falta el canal (el SW ya está
   registrado). Alternativa barata: deep-link a los feeds RSS por tracker
   desde el botón follow.
3. **Briefing diario por email/Telegram personalizado**: combinar los digests
   existentes con los follows del usuario (client-side, mailto/share API; sin
   backend).
4. **Permalink de estado del globo/mapa** (`?date=…&cat=…&z=…`): el scrubber
   temporal ya existe; serializarlo a la URL habilita compartir vistas.
5. **Export CSV/JSON por sección** en cada dashboard (los datos ya son JSON
   estático; es un botón + transformación).
6. **Modo TV dedicado** (`/tv`): el BroadcastOverlay ya hace el 90%; una ruta
   propia fullscreen con autoplay sería embebible en pantallas.
7. **Página de changelog por tracker** alimentada de `digests.json` (hoy solo
   visible vía RSS).

---

## 5. Plan de remediación sugerido

| Fase | Contenido | Esfuerzo |
|------|-----------|----------|
| **P0 (esta semana)** | Llave de `globe.astro` (1 char); escape JSON-LD (helper 1 línea × 8 usos); validación de `accentColor`; `claude-code-action@main`→`@v1`; quoting de inputs en `batch-init-trackers.yml`; retry de push en tally/backfill | S |
| **P1 (siguientes 2 semanas)** | Fix hidratación i18n (locale por prop/SSR); fix `data.ts` fr/pt; partición + prune del triage-log; escrituras atómicas en scripts sociales; `concurrency` groups; sanitización del pipeline RSS→prompt | M |
| **P2 (mes)** | Migrar curl→fetch con allowlist (SSRF); accesibilidad onboarding/carousel; sistema de imágenes con fallback real; search fallback; KPI strip; deduplicar onboarding y utils de scripts; limpiar `backfill.ts`/`backfill-gaps.ts` legacy | M–L |
| **P3 (backlog)** | Comparador, push notifications, permalinks, export, modo TV; upgrade Astro 6; SHA-pinning de actions; revisar `relatedTrackers` de los 95 trackers | L |

---

*Generado el 2026-06-09 con exploración en Chrome (dev server local) + 6
agentes de revisión de código en paralelo. Los números de línea corresponden a
`main` en el commit `2a7fd122`.*

---

## 6. Estado de implementación (2026-06-10)

Todo lo accionable de las fases **P0, P1 y P2** quedó implementado en el
working tree (sin commits), verificado con `npm run build` (exit 0), vitest
(205/205 root + 32/32 video) y re-exploración en Chrome:

- **Verificado en navegador:** la home y las páginas de tracker cargan **sin
  errores de hidratación** (locale ahora inicia en `en` y cambia post-mount
  vía el nuevo hook `src/i18n/useLocale.ts`); el script del globo ya parsea;
  el scroll con rueda funciona en las páginas de tracker.
- **Hallazgo nuevo durante la verificación:** el scroll roto NO era (solo) el
  mapa — `body { overflow-x: hidden }` en `global.css:83` convertía al body en
  scroll container y el compositor de Chrome se tragaba wheel/PageDown en las
  páginas altas. Fix: `overflow-x: clip` (con `hidden` como fallback), más
  `overflow: clip` en `.theater-scroll` y sus `.section`. Diagnóstico por
  bisección en vivo; verificado bidireccional tras recarga.
- **Seguridad:** inputs de workflows neutralizados, prompts con bloques
  `<untrusted-feed-data>`, curl→`safeFetch` con allowlist anti-SSRF, JSON-LD
  escapado (10 usos), color del embed validado, PAT a sessionStorage,
  `@main`→`@v1`.
- **Pipeline:** retries de push con jitter en 5 workflows + concurrency group
  `main-commits`; triage-log con particionado semanal atómico (la migración
  del archivo de 7.2 MB ocurre sola en el próximo run programado); escrituras
  atómicas en scripts sociales y backfill; prune de metrics runs huérfanos;
  `backfill.ts`/`backfill-gaps.ts` parametrizados con `--tracker` y
  `backfill.yml` actualizado a `trackers/*/data/`.
- **Pendiente del entorno:** ya se corrió `npm install` (root y `video/`)
  para reflejar los movimientos de dependencias en ambos lockfiles.

**Diferido (P3 / backlog por diseño):** comparador de trackers, web push para
"Seguir", briefing personalizado, permalinks de estado del globo, export
CSV/JSON, modo TV, página de changelog, upgrade a Astro 6 y SHA-pinning de
actions. También quedó pendiente revisar `relatedTrackers` de los 95 trackers
(solo se depuró el caso flagrante de BTS).

*Nota de verificación: `npx astro check` se queda sin memoria en este repo
(preexistente, también en árbol limpio); el gate de tipos usado fue
`tsc --noEmit` (cero errores en archivos tocados) + el build completo.*
