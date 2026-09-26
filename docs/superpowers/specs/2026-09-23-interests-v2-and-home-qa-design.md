# Diseño: intereses v2 (visibles en el feed + redescubrimiento) y QA del homepage

**Estado:** Propuesto
**Fecha:** 2026-09-23
**Contexto:** sigue a #294 (intereses declarados: `src/lib/interests.ts`,
`useInterests`, `InterestChips` en sidebar + panel `?` + paso de tour
`hero-interests`, `INTEREST_BONUS = +10` en `src/lib/relevance.ts:18`) y a
#290/#291/#293 (capa de radio; toggle del homepage apagado por defecto,
atajo `R`, píldora de estado). Ninguna de las dos piezas tiene una prueba
end-to-end que falle si deja de funcionar, y el defecto dominante del repo es
justamente ese: un paso que "funciona" sin producir efecto
(`docs/silent-failure-patterns.md`).

## Resumen

Cuatro piezas, en un solo PR:

1. **Los intereses se ven en el feed.** Hoy solo reordenan *dentro* de un
   bucket de recencia; un tracker viejo que coincide nunca sube sobre uno
   reciente. Se añade una **banda "Tus intereses"** acotada (máx. 6 filas)
   justo después de los seguidos, en la vista OPS con orden Relevancia.
   Sin intereses declarados, la salida es idéntica a la de hoy.
2. **Redescubrimiento.** Quien ya completó el tour de escritorio nunca ve el
   paso `hero-interests`. Se añade un **aviso en línea, de una sola vez**,
   dentro del sidebar (que también es la pestaña TRACKERS en móvil), junto al
   botón INTERESES. Se descarta subir la versión del tour y se descarta el
   `CoachMark` flotante.
3. **QA móvil.** Los chips de interés y `.cc-sort-option` miden ~18 px de alto
   (por debajo de WCAG 2.5.8, 24 px). En móvil, el toggle de radio queda
   debajo del toggle de luces, y la píldora de estado se superpone a éste. Se
   corrige con CSS y se verifica con Playwright a 360×740 y 390×844, en `en`
   y `fr`, con aserciones geométricas y capturas.
4. **Guardas automáticas.** Tres specs de Playwright nuevos (intereses, capa
   de radio, móvil). Además, un test de vitest que falla si existe un
   `e2e/*.spec.ts` que `e2e.yml` no ejecuta, para que los specs nuevos no
   acaben siendo "225 tests que ningún workflow corría".

Fuera de alcance: vista DOMAIN y GEOGRAPHIC, orden Actividad (sigue plano y
sin intereses), traducir los `COACH_HINTS` existentes, paso de intereses en el
tour móvil, la desincronización de idioma en `/fr/` (ver preguntas abiertas).

## 1. Intereses que cruzan buckets

### 1.1 Problema (verificado en código)

- `SidebarPanel.tsx:538-541`: `sortedFiltered` usa
  `sortByRelevance(filtered, followedSlugs, interests)`, así que la
  coincidencia suma +10 (`relevance.ts:43`).
- `SidebarPanel.tsx:454-482`: la vista OPS parte esa lista en tres buckets:
  seguidos, recientes (≤ 48 h, `OLDER_THRESHOLD_MS` en `:330`) y viejos
  (> 48 h, atenuados). El +10 solo cambia el orden dentro de cada bucket.
  Un tracker de `governance` actualizado hace 3 días queda debajo de todos
  los recientes, lo haya elegido el usuario o no.
- `SidebarPanel.tsx:553-570`: `flatSlugs` (navegación con flechas) duplica
  la misma lógica de buckets, copiada a mano. Además ignora el modo
  Actividad: `FeedList` pinta la lista plana (`:450-452`) pero las flechas
  siguen el orden por buckets. Es una divergencia real que ya existe hoy.

Datos reales (125 trackers, `trackers/*/data/meta.json` a
2026-09-24T03:00Z): 70 están en el bucket "viejo". Por dominio,
`governance` tiene 46 trackers, 33 viejos; `science` 14, 10 viejos. Por
región, `north-america` tiene 27, 17 viejos; `global` 19, 14 viejos.

### 1.2 Alternativas

| Opción | Qué hace | Problema |
|---|---|---|
| A. Banda sin límite | seguidos → *todas* las coincidencias → recientes → viejos | Elegir `governance` coloca 46 filas (33 viejas) antes de cualquier noticia reciente de otro tema. El feed deja de ser un feed. |
| B. Aplanar cuando hay intereses | Orden de relevancia puro, sin buckets, cada fila vieja atenuada | No garantiza que la coincidencia cruce: la recencia (0-15) supera al +10, así que un tracker viejo que coincide sigue abajo. Además, declarar un interés cambia *todo* el layout, no solo esas filas. |
| C. Subir `INTEREST_BONUS` | +10 → +25 | No cruza buckets (los buckets se calculan por edad, no por score). Además altera hero, stories y broadcast, que ya consumen el score. |
| **D. Banda acotada (recomendada)** | seguidos → hasta `INTEREST_BAND_MAX = 6` coincidencias (las 6 primeras en orden de relevancia) → recientes → viejos. Las coincidencias que sobran se quedan en su bucket de recencia. | Hay que elegir el límite (ver preguntas abiertas). |

### 1.3 Recomendación: D

- **Cruza de verdad.** Una coincidencia vieja puede aparecer arriba de
  todas las recientes, que es exactamente lo que pidió el usuario al
  elegirla.
- **Acotada.** Nunca hay más de 6 filas entre los seguidos y las noticias
  recientes. Entran las 6 primeras coincidencias **en orden de relevancia**,
  y relevancia *no* es frescura: breaking +40, actividad 0-30
  (`activity × 0.3`), recencia solo 0-15 (`15·e^(−días/3)`,
  `relevance.ts:37-62`). Una coincidencia vieja con mucha actividad gana
  hueco a una fresca con poca, y la fresca queda en su bucket reciente,
  debajo de la banda. Es intencional: la banda muestra las coincidencias
  *más relevantes*, y así es como una vieja cruza. Medido con los datos del
  2026-09-24 (simulando `sortByRelevance` sobre `meta.json` +
  `public/api/v1/trackers.json`): `north-america` → 2 viejas en la banda y
  6 recientes que quedan fuera; `governance` → 1 y 8; `global` → 2 y 1;
  `science` → 2 y 0. Un test unitario fija esta regla (una vieja de mucha
  actividad antes de una fresca de poca). La alternativa ("recientes
  primero") se deja como pregunta abierta 4.
- **Honesta sobre la frescura.** Las filas viejas dentro de la banda siguen
  atenuadas (`cc-feed-row-dim`), así que la banda no hace pasar un tracker
  viejo por noticia fresca.
- **Visible.** La banda lleva una etiqueta, "Tus intereses"
  (`cc-feed-group-divider`, el mismo estilo que usa la vista DOMAIN en
  `SidebarPanel.tsx:439`). Los separadores de 1 px de la vista OPS no dicen
  por qué una fila vieja aparece arriba; la etiqueta sí.
- **Sin intereses, idéntico.** Si `hasInterests(interests)` es falso, la
  banda queda vacía y los buckets y separadores salen exactamente como hoy.
  Un test lo comprueba contra una copia literal del algoritmo actual.

Reglas:
- Un tracker seguido que además coincide se queda en seguidos (seguir es la
  señal más fuerte). No cuenta para el límite de la banda.
- La banda solo existe en OPS + Relevancia. En Actividad (plano), DOMAIN y
  GEOGRAPHIC no cambia nada. Por eso **Elegir** en el aviso (§2.3) cambia
  además a OPS + Relevancia, y el texto del aviso dice dónde está el efecto.
- **Sin banda durante una búsqueda**, igual que la tarjeta hero
  (`SidebarPanel.tsx:739`, `!isSearching`). Buscar ordena por coincidencia
  de texto y relevancia; subir coincidencias de interés por encima de
  mejores resultados de texto confundiría. Se implementa con `bandMax: 0`,
  que ya se prueba como idéntico al algoritmo sin intereses.
- La etiqueta de la banda se anuncia una sola vez: el grupo usa
  `aria-labelledby` apuntando al separador visible, no `aria-label`.
- La lógica sale a un módulo puro, `src/lib/feed-buckets.ts`
  (`bucketFeed`, `feedOrder`, `isOlder`, `OLDER_THRESHOLD_MS`,
  `INTEREST_BAND_MAX`). Lo usan tanto `FeedList` como `flatSlugs`, así que
  las flechas siguen siempre el orden visible, incluido el modo Actividad.
  Con eso se corrige la divergencia de §1.1.

## 2. Redescubrimiento

### 2.1 Problema

- `useOnboardingController.ts:25-30` solo lanza el tour si
  `!isTourCompleted(surface)`. Quien lo completó antes de #294 tiene
  `watchboard-tour-desktop-v1` con `completed: true` y nunca ve el paso
  `hero-interests` (`onboarding-steps.ts:17`).
- El tour móvil (`MOBILE_STEPS`, `onboarding-steps.ts:23-27`) no tiene
  paso de intereses.

### 2.2 Alternativas

| Opción | Pros | Contras |
|---|---|---|
| Subir la versión del tour (`-v2`) | Sin UI nueva | Vuelve a mostrar los 7 pasos modales a todos los visitantes recurrentes para enseñarles un solo botón. `runLegacyMigrationOnce` (`onboarding.ts:93-111`) ya muestra lo delicadas que son estas migraciones. No resuelve móvil. |
| "Tour delta" (solo los pasos nuevos) | Enfocado | Hay que registrar qué pasos vio cada visitante, lo que es un nuevo modelo de estado. Sigue sin cubrir móvil. |
| `CoachMark` en la cola `COACH_HINTS` | Reusa la persistencia (`watchboard-features-discovered`) | Solo se muestra en escritorio (`CommandCenter.tsx:1132`, `!isMobile`). Tiene posición fija y no apunta al botón (`CoachMark.tsx:32-33`, `sidebar` → `top:120 right:12`). El texto está en inglés fijo (`onboarding.ts:15-21`, sin `TranslationKey`). La cola va en orden, así que el aviso esperaría a que se descarten 5 pistas antes. |
| **Aviso en línea en el sidebar (recomendada)** | Está anclado al botón INTERESES porque vive a su lado. Funciona en escritorio y en la pestaña TRACKERS de móvil. Tiene i18n. Reusa `markFeatureDiscovered` / `getDiscoveredFeatures` (`onboarding.ts:41-56`). | Es UI nueva, aunque pequeña (una línea con dos botones). |

### 2.3 Recomendación: aviso en línea

Es una fila bajo la barra de orden: *"Nuevo: elige temas o regiones y las
coincidencias más relevantes tendrán su propia sección arriba del feed
(vista OPS, orden Relevancia)."* con los botones **Elegir** y **×**
(descarta). **Elegir** abre los chips y, si el visitante estaba en
Actividad, DOMAIN o GEOGRAPHIC (preferencias guardadas), cambia a OPS +
Relevancia; si no, elegiría un chip y no vería ningún cambio. Usa la clave
`'interests'` en el mismo almacenamiento de
`watchboard-features-discovered`. No se añade a `COACH_HINTS`, así que no
aparece como `CoachMark`.

**Sidebar colapsado (768-1279 px).** Allí el sidebar arranca colapsado
(`CommandCenter.tsx:166` `useState(true)`, solo se expande solo con
`innerWidth ≥ 1280` o preferencia guardada, `:306-313`) y `SidebarPanel`
no se monta (`:884`), así que el aviso no se vería nunca. Con el aviso en
`show`, el botón "Expand sidebar" del riel colapsado lleva un punto
(`data-testid="sidebar-expand-nudge-dot"`) y su `aria-label` añade el
texto del aviso. Al expandir, se ve la fila del aviso.

Elegibilidad (función pura `shouldShowInterestsNudge` en `onboarding.ts`):

- `false` si `'interests'` ya está descubierto, o si el visitante ya tiene
  intereses declarados.
- En móvil, `true` (no hay paso de tour que lo cubra).
- En escritorio, `true` solo si el tour de escritorio ya estaba completado
  al montar. Un visitante nuevo ve primero el tour. Al llegar al paso
  `hero-interests`, `OnboardingTour` marca `'interests'` como descubierto,
  así que en la siguiente visita no ve el aviso. Si saltó el tour antes de
  llegar a ese paso, lo ve en la siguiente visita. Es intencional: nunca vio
  la función.
- `false` hasta que `CommandCenter` haya leído el estado tras montar, para
  que el SSR y el primer render coincidan (evita React #418).

Se marca como descubierto en cualquiera de estos casos: **Elegir**, **×**,
abrir el toggle INTERESES y alternar cualquier chip desde el sidebar o el
panel `?`. Esto último evita que el aviso reaparezca si el usuario elige y
luego borra sus intereses.

## 3. QA móvil

### 3.1 Objetivos táctiles

`.cc-sort-option` (`global.css:4154`) y `.interest-chip` (`global.css:4163`)
tienen `padding: 2px 7px` y fuente de 0.55-0.6 rem, lo que da ~18 px de
alto con `gap: 4px`. Fallan WCAG 2.5.8 (24 px, o espaciado equivalente)
también en escritorio.

Corrección:
- Base (todas las pantallas): `min-height: 24px; display: inline-flex;
  align-items: center` en `.cc-sort-option` y `.interest-chip`.
- `@media (max-width: 767px)` (solo teléfonos; los táctiles anchos,
  tablets y portátiles, se quedan con los 24 px de la base, que ya cumplen
  2.5.8, y así no hay un segundo layout de escritorio sin probar):
  `min-height: 32px;
  padding: 4px 10px`, y `gap: 6px` en `.cc-sort-toggle`, `.cc-sort-group` e
  `.interest-chips-row`. Se eligen 32 px y no 44 px (el valor del toggle de
  luces en `index.astro:310-315`) porque la lista de chips llega a 23
  botones (10 dominios + 11 regiones con trackers + Borrar + toggle), y a
  44 px empujaría el feed fuera de la primera pantalla de 740 px.
- Los botones del aviso (§2) usan las mismas medidas.

### 3.2 Toggle de radio y píldora en el teléfono

Leyendo el CSS:
- `src/pages/{,es/,fr/,pt/}index.astro:310-315` mueve, en `max-width:
  767px`, `.globe-lights-toggle` a `top:48px`, 44×44, `z-index:60`, con
  `!important`.
- El toggle de radio tiene estilos inline `top:44`, 28×28, `z-index:15`
  (`GlobePanel.tsx:785-790`), `right:10` (heredado de `lightsToggle`,
  `GlobePanel.tsx:885-899`). Ninguna regla móvil lo toca, así que queda
  **debajo** del toggle de luces (48-92 px vs 44-72 px, misma columna
  derecha). La predicción es que en el teléfono no se puede tocar.
- `.cc-radio-layer-status` (`global.css:3437-3459`: `top:44px;
  right:44px`, 28 px de alto, `z-index:15`) se solapa con el borde
  izquierdo del toggle de luces (que en móvil ocupa `right` 10-54 px).

Corrección, una sola vez en `global.css` y no en los cuatro `index.astro`:
toggle de radio a `top:100px` (48 + 44 + 8), 44×44, `z-index:60`; la
píldora a `top:106px; right:62px; min-height:32px; height:auto;
max-width: calc(100% - 80px); z-index:60`, y en el teléfono **puede
partirse en dos líneas** (`white-space: normal; flex-wrap: wrap`). Hoy es
`nowrap` + `overflow: hidden` (`global.css:3452-3454`): a 280 px la
atribución (`… radio-browser.info … (PDDL 1.0)`, `translations.ts:211`) y
el error en pt/fr ("Estações de rádio indisponíveis" + "Tentar novamente")
quedan recortados, y `toContainText` pasaría igual sobre texto que no se
ve.

**Botón Reintentar.** `.cc-radio-layer-status button` tiene `padding: 0`
con fuente 0.56 rem (`global.css:3461-3468`): mide ~11 px de alto, por
debajo de 24 px. Se le da `min-height: 24px; padding: 0 6px` en todas las
pantallas y `min-height: 32px` en el teléfono.

La predicción se da por buena solo si el spec móvil falla *antes* del
cambio de CSS. Si pasa, la lectura estaba mal: se para y se revisan las
capturas antes de tocar CSS.

### 3.3 Método de verificación

`e2e/home-mobile.spec.ts` recorre {360×740, 390×844} × {en en `./`, fr en
`./fr/` con locale de navegador `fr-FR`}, con `isMobile`, `hasTouch` y
`deviceScaleFactor: 2`:

- Comprueba que el idioma es el esperado (el toggle dice "Interests" o
  "Intérêts"). Así una captura etiquetada `fr` no puede ser inglés en
  silencio (ver pregunta abierta 2).
- En TRACKERS con los chips abiertos: todo `.cc-sort-option`,
  `.interest-chip` y botón del aviso visibles tiene ≥ 32 px de alto y
  ≥ 24 px de ancho, y no hay desbordamiento horizontal (`scrollWidth ≤
  innerWidth` en el documento y en `.cc-sidebar-inner`).
- Capa de radio (con el GeoJSON interceptado): el toggle de radio y el de
  luces miden ≥ 44 px y son el elemento superior en su centro
  (`document.elementFromPoint`). La píldora cabe en el viewport y no
  interseca a ninguno de los dos toggles, y su texto no está recortado
  (`scrollWidth ≤ clientWidth` y `scrollHeight ≤ clientHeight`).
- Estado de error (GeoJSON con 500), en los 4 casos más uno extra a
  360 px en `pt` (textos más largos): el botón Reintentar es visible, mide
  ≥ 32 px de alto y ≥ 24 px de ancho, es el elemento superior en su centro
  y la píldora no está recortada.
- **Idioma de `/fr/` con navegador en inglés** (pregunta abierta 2): un caso
  con `en-US` en `./fr/` fija el comportamiento *actual* (tras hidratar dice
  "LIVE"). No se esconde detrás de `fr-FR`: si el dueño decide corregirlo,
  ese test falla y se invierte en el mismo PR.
- Guarda capturas `mobile-*.png` con `testInfo.outputPath`. `e2e.yml` las
  sube como artefacto con `if-no-files-found: error`, así que un spec que
  no generó capturas no pasa en verde.

## 4. Guardas automáticas (Playwright)

**`e2e/interests.spec.ts`**
- Abre INTERESES y elige un chip (región o dominio). El test **no**
  predice qué filas entran en la banda a partir del DOM: el DOM viene
  agrupado en seguidos → recientes → viejos, y la banda toma las
  coincidencias en orden de relevancia, que no es ese orden (§1.3). Elige
  un chip con 1 a `INTEREST_BAND_MAX` coincidencias de las que al menos una
  es vieja (`cc-feed-row-dim`) y con al menos una fila reciente que no
  coincide. Con eso la banda contiene *todas* las coincidencias (el
  conjunto esperado no depende del orden de relevancia), y la vieja
  necesariamente sube por encima de una reciente, así que el orden cambia.
  Hoy lo cumplen `south-asia` (5, 2 viejas) y otros; si ningún chip lo
  cumple, el test falla con un mensaje explícito, no se salta.
- Comprueba: la banda tiene exactamente esas filas; al menos una de ellas
  está atenuada (una vieja cruzó, que es el objetivo de §1); ninguna
  coincidencia queda fuera de la banda; el conjunto de slugs no cambió
  (ninguna fila perdida ni duplicada); el orden cambió.
- Recarga: el chip sigue `aria-pressed="true"` y la banda es la misma.
- Borrar: la banda desaparece y el orden vuelve a ser el original.
- Aviso: visible con el tour hecho y sin intereses. **×** lo oculta y sigue
  oculto tras recargar. **Elegir** abre los chips. No aparece con intereses
  guardados ni en una primera visita (tour activo). **Elegir** con la
  preferencia de orden guardada en Actividad deja el orden en Relevancia.
- Aviso con sidebar colapsado: a 1024×768 con el tour hecho, el riel
  muestra `sidebar-expand-nudge-dot`; al expandir aparece el aviso.
- Búsqueda: con un interés elegido y texto en el buscador, no hay banda.
- `INTEREST_BAND_MAX` se importa de `src/lib/feed-buckets.ts`, no se copia
  como literal (ver "Stale literals" en `silent-failure-patterns.md`).

**`e2e/radio-layer.spec.ts`**
- Apagado por defecto: `aria-pressed="false"` y **cero** peticiones a
  `geo/layers/radio-stations-global.geojson` con el globo montado.
- Al encenderlo: exactamente una petición, píldora con la atribución y 2
  pines (`radio-pin`) del fixture. Recargar mantiene la preferencia y vuelve
  a pedir el archivo una vez.
- 500: la píldora pasa a `cc-radio-layer-error` con Reintentar. Reintentar
  contra un fixture sano pasa a `ready`, con 2 peticiones en total.
- Se prueba que el spec puede fallar: forzar temporalmente la capa a
  encendida en `CommandCenter.tsx:199` debe romper el test de "apagado por
  defecto".

**Cobertura del workflow.** `tests/e2e-workflow-coverage.test.ts` (vitest,
node) lee `e2e/*.spec.ts` y `.github/workflows/e2e.yml`, y falla si un spec
no está en el workflow ni en una lista explícita de exclusiones con motivo.
Solo cuentan las rutas en líneas no comentadas que contienen
`npx playwright test`; un spec nombrado en un comentario no cuenta como
ejecutado. También falla si el workflow tiene algún `if: false`.
Hoy esa lista es `command-center.spec.ts` y `tracker-page.spec.ts`, según la
cabecera de `e2e.yml`.

## Testing

- `src/lib/feed-buckets.test.ts`: equivalencia con el algoritmo actual sin
  intereses (con seguidos, fecha inválida y el borde exacto de 48 h), límite
  de la banda, desborde a su bucket, seguidos que coinciden, `bandMax = 0`,
  conservación del orden de entrada y ninguna fila perdida ni duplicada.
- `src/lib/onboarding.test.ts`: la tabla de verdad de
  `shouldShowInterestsNudge`.
- `translations.test.ts` y el tipo `TranslationKeys` (`translations.ts:6`)
  cubren las 4 claves nuevas × 4 idiomas.
- Los tres specs de Playwright de §3-4 se añaden a `e2e.yml`.
- `npm test` y `npm run build` en verde antes del PR. `npm run check`
  (`astro check`, `package.json:9`) se queda sin memoria en local: se corre
  con `NODE_OPTIONS=--max-old-space-size=8192`. Si aun así no termina, el
  plan lo registra como desviación y usa `npx tsc --noEmit -p .` filtrado a
  los archivos tocados, y el PR lo dice.
- `feed-buckets.test.ts` fija además la regla de pertenencia a la banda
  (§1.3): la entrada manda, una coincidencia vieja que llega antes en orden
  de relevancia entra antes que una reciente.
- Duración: se mide la suite e2e completa en local con los specs nuevos y
  se anota en el PR (hoy el job tarda ~6-7 min, límite 25).

## Riesgos

- **Límite de 6.** Con un interés amplio (`governance`: 46 trackers), 40
  coincidencias quedan en su bucket. Es intencional, pero el usuario puede
  pensar que "no funcionó" para las que no ve arriba. La etiqueta de la
  banda ayuda. Si hace falta, se puede añadir un contador ("6 de 46") en
  una iteración futura.
- **Datos vivos en e2e.** El spec de intereses usa los trackers reales
  (llegan como props del SSR, no por `fetch`, así que no se pueden
  interceptar). Para que no dependa del orden de relevancia, el chip se
  elige de modo que la banda contenga todas sus coincidencias (§4). Si un
  día ningún chip cumple la condición, el test falla con un mensaje que lo
  dice, no se salta en verde. `e2e.yml` corre en cada push a `main` (bots
  cada hora), pero `cancel-in-progress` sobre `e2e-refs/heads/main` cancela
  la ejecución anterior, y ningún check es obligatorio; un rojo esporádico
  por datos se ve en el log con ese mensaje.
- **Swiftshader y pines.** Los pines de radio son elementos HTML de
  globe.gl. El spec de pines pendientes (`e2e/pending-pins.spec.ts:38-39`)
  ya depende de lo mismo con un timeout de 60 s.
- **Salto de layout.** El aviso aparece después de montar (no puede estar
  en el SSR), así que desplaza el sidebar una línea una sola vez por
  visitante.
- **Otros controles del sidebar móvil** (`ViewModeToggle`, buscador) no se
  auditan aquí. El spec móvil puede ampliarse a ellos en otro PR.

## Preguntas abiertas para el dueño

1. **Límite de la banda: ¿6?** Se eligió para que en escritorio los
   seguidos más la banda quepan en la primera pantalla del sidebar. Es una
   constante (`INTEREST_BAND_MAX`) y cambiarla no afecta a los tests, que
   la importan.
2. **`/fr/` se muestra en inglés si el navegador está en inglés.**
   `CommandCenter.tsx:301` llama a `setLocale(getPreferredLocale())` sin
   mirar `initialLocale` (el prop que `src/pages/fr/index.astro:225` pasa
   como `"fr"`). `getPreferredLocale` (`translations.ts:2848-2857`) usa
   `localStorage` o `navigator.language`, así que una visita a `/fr/` con el
   navegador en inglés y sin preferencia guardada cambia a inglés al
   hidratar. Este diseño no lo corrige. El spec móvil usa `fr-FR` para
   verificar el francés *y* tiene un caso `en-US` en `./fr/` que fija el
   comportamiento actual, para que la brecha quede visible. **Decidir antes
   del merge**: ¿es intencional (la preferencia del visitante gana a la
   URL) o se corrige (en este PR o en uno aparte)?
3. **24 px también en escritorio.** Subir `.cc-sort-option`,
   `.interest-chip` y el botón Reintentar de la píldora de radio a 24 px
   cambia un poco el aspecto en escritorio, también en tablets y portátiles
   táctiles (que se quedan en 24 px, no 32). WCAG 2.5.8 aplica igual, así
   que la recomendación es hacerlo. ¿De acuerdo?
4. **Qué filas lleva la banda.** Hoy: las 6 coincidencias más relevantes
   (actividad + breaking + recencia), de modo que con un interés amplio
   entran 1-2 viejas y quedan recientes debajo (cifras en §1.3). Opciones:
   (a) así; (b) recientes primero y viejas en los huecos (casi ninguna vieja
   cruzaría con intereses amplios); (c) reservar N huecos para viejas;
   (d) todas las coincidencias tras un "6 de 46, ver todas". La
   recomendación es (a) porque es la única que cumple a la vez "acotada" y
   "una vieja relevante cruza"; los tests fijan (a) y hay que cambiarlos si
   se elige otra.
5. **Elegir cambia la vista.** Si el visitante tenía guardado Actividad,
   DOMAIN o GEOGRAPHIC, **Elegir** pasa a OPS + Relevancia para que el
   efecto se vea. ¿Aceptable, o se prefiere solo el texto del aviso sin
   tocar sus preferencias?

## Adversarial review log

Revisión 2026-09-24. Cada hallazgo se verificó contra el código. Cifras de
la banda: simulación de `sortByRelevance` (`relevance.ts:33-114`) sobre
`trackers/*/data/meta.json` + `public/api/v1/trackers.json` a
2026-09-24T03:00Z (125 trackers, todos con `activity`).

| # | lens | severity | finding | verdict | action/rationale |
|---|---|---|---|---|---|
| 1 | truth | important | `pickRegion` predice los miembros de la banda desde el DOM agrupado por recencia; la banda usa orden de relevancia | Aceptado | Verificado: en `north-america` la banda real tiene 2 viejas y deja 6 recientes fuera, mientras el DOM daría 6 recientes. §4 y plan Task 3: `pickChip` elige un chip con 1..6 coincidencias (≥ 1 vieja) y la banda debe contener *todas*; no depende del orden. |
| 2 | truth | important | §1.3 "las 6 más frescas, los viejos solo en los huecos" es falso | Aceptado | Recencia 0-15 contra actividad 0-30 y breaking 40 (`relevance.ts:37-62`). §1.3 reescrito con las cifras medidas; unit test nuevo fija "vieja activa antes que fresca tranquila"; bullet de CLAUDE.md corregido; alternativa → pregunta 4. |
| 3 | truth | important | Task 7 Step 4: `grep sidebar-feed dist/index.html` da 0 | Aceptado | `CommandCenter.tsx:166` `useState(true)`, `:884` pinta el riel en SSR; `dist/index.html` actual: 0 `cc-sidebar-inner`. Aserción eliminada, con la razón escrita en el paso. |
| 4 | truth | minor | `npm run check` del spec sustituido en silencio por `tsc` | Aceptado | Plan: desviación listada; Task 7 Step 3 corre `NODE_OPTIONS=--max-old-space-size=8192 npm run check` y, si falla, lo dice el PR. Spec "Testing" actualizado. |
| 5 | truth | minor | `(pointer: coarse)` aplica 32 px a tablets/portátiles sin prueba | Aceptado | Regla limitada a `max-width: 767px` (spec §3.1, plan Global Constraints y Task 6 Step 4). Los táctiles anchos quedan con 24 px, que ya cumplen 2.5.8. |
| 6 | product | important | Con intereses amplios la banda se llena de frescas y el caso motivador (vieja bajo recientes) sigue sin resolver | Parcial | Rechazado en su premisa: los datos muestran 1-2 viejas en la banda para cada interés amplio (`north-america` 2, `governance` 1, `global` 2, `science` 2), no "casi nunca". Aceptado lo demás: el e2e exige ≥ 1 fila atenuada dentro de la banda, y la regla de pertenencia pasa al dueño (pregunta 4, opciones a-d). |
| 7 | product | important | Reintentar en la píldora de error: ~11 px, recortable a 360 px en fr/pt; solo se prueba "ready" | Aceptado | `global.css:3461-3468` `padding: 0`, 0.56 rem; píldora `nowrap`+`overflow: hidden` (`:3452-3454`). Botón `min-height` 24/32 px; píldora puede partirse en el teléfono; casos de error móviles (4 + pt a 360) con tamaño, topmost y no recorte; el caso "ready" también comprueba el recorte. |
| 8 | product | important | El aviso dice "suben", pero el efecto solo existe en OPS + Relevancia | Aceptado | `feedLayout` devuelve `flat`/`domain` sin banda. Texto nuevo en 4 idiomas dice dónde está el efecto; **Elegir** cambia a OPS + Relevancia; e2e con Actividad guardada; pregunta 5 para el dueño. |
| 9 | product | minor | `fr-FR` en el spec móvil esconde el bug de `/fr/` → inglés | Aceptado | `CommandCenter.tsx:301` confirmado. Caso nuevo `en-US` en `./fr/` que fija el comportamiento actual (falla si se corrige); pregunta 2 marcada "decidir antes del merge"; Task 7 Step 7 lo exige. |
| 10 | product | minor | Cambio de layout en táctiles de escritorio no consultado | Aceptado | Resuelto con #5 (sin rama `coarse`); pregunta 3 menciona tablets y portátiles táctiles y el botón Reintentar. |
| 11 | product | minor | La etiqueta de la banda se anuncia dos veces (`aria-label` + texto visible) | Aceptado | Grupo con `aria-labelledby="cc-interest-band-label"` apuntando al separador (spec §1.3, plan Task 3 Step 4 y contrato DOM). |
| 12 | product | minor | La banda aparece en resultados de búsqueda | Aceptado | Verificado: `FeedList` recibe `sortedFiltered` filtrado por `searchQuery` y no mira `isSearching` en OPS; la hero sí se oculta (`SidebarPanel.tsx:739`). `bandMax: 0` al buscar en `FeedList` y `flatSlugs`; paso e2e "no band while searching" (busca el valor del chip, que `matchesSearch` cubre por dominio/región). |
| 13 | failure | important | La banda no elige las coincidencias más frescas; filas viejas atenuadas pueden ocuparla sobre frescas | Aceptado (duplicado de #2) | Se mantiene el orden de relevancia a propósito (es la única regla que cumple "acotada" y "una vieja relevante cruza"), pero ahora está escrito, fijado por test y consultado (pregunta 4). |
| 14 | failure | important | El e2e reimplementa mal el algoritmo de la banda: fallo intermitente según los datos del día | Aceptado (duplicado de #1) | Mismo arreglo que #1. Si ningún chip cumple la condición, el test falla con un mensaje explícito, nunca se salta en verde. |
| 15 | failure | important | A 768-1279 px el sidebar está colapsado y el aviso nunca se ve | Aceptado | Verificado `CommandCenter.tsx:166`, `:306-313`, `:884`. Punto `sidebar-expand-nudge-dot` en el botón de expandir + `aria-label` con el texto del aviso; e2e a 1024×768. |
| 16 | failure | minor | Task 7 Step 4 grep SSR imposible | Aceptado (duplicado de #3) | Ver #3. |
| 17 | failure | minor | Reintentar ~11 px sin prueba móvil | Aceptado (duplicado de #7) | Ver #7. |
| 18 | failure | minor | Specs con datos vivos y globo en cada push de bots a `main` → rojos que se aprenden a ignorar | Parcial | Aceptado: el spec de intereses ya no depende del orden de relevancia; Task 7 Step 5 mide la suite y para si pasa de 15 min. Rechazado "datos fijos / saltar en push a main": los trackers llegan como props del SSR (no se pueden interceptar con `page.route`), y saltar en `main` quitaría la guarda justo donde los bots cambian datos. `cancel-in-progress` ya cancela la ejecución anterior en cada push. |
| 19 | failure | minor | La guarda de cobertura cuenta un spec nombrado en un comentario o en un paso `if: false` | Aceptado | `specsRunBy()` solo lee líneas no comentadas con `npx playwright test` (con test propio), y otro test falla si hay `if: false`; Task 1 Step 3 prueba el caso del comentario. |
