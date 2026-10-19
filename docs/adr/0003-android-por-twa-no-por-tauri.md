# ADR-0003: La app de Android se publica como Trusted Web Activity, no como shell de Tauri

**Estado:** Propuesto
**Fecha:** 2026-10-19
**Autores:** Watchboard

## Contexto

`docs/superpowers/plans/2026-08-19-tauri-android-play-store.md` (1.107 líneas,
escrito el 19 ago 2026, revisado por cinco revisores, nunca implementado)
envuelve el PWA existente en una shell de Tauri v2 y publica un AAB firmado en
el canal interno de Play. Su Task 1 bloquea todo lo demás y son dos decisiones:
el identificador de la app y cómo recibe la app el contenido del sitio.

**La segunda ya no es una decisión, es una medición.** `dist/` son 2,3 GB
—medido el 19 oct 2026, y con las imágenes OG por evento capadas a 25, así que
un build completo es mayor—: `fr/`, `es/` y `pt/` 231 MB cada uno, `og/` 216 MB,
`pagefind/` 128 MB, `briefing/` 114 MB, `api/` 90 MB. Play limita la descarga
comprimida del módulo base a 200 MB. Empaquetar `dist/` no es un caso ajustado
ni se arregla recortando: solo inglés, sin `og/` ni `pagefind`, sigue cerca del
gigabyte. **La app tiene que cargar el sitio en remoto.**

Y ahí aparece el problema que el plan no podía ver cuando se escribió: una
shell que solo carga un sitio existente en un WebView es exactamente la forma
que Google describe como *webview spam* bajo la política de funcionalidad
mínima, y que retira de Play. Tauri v2 en Android renderiza en el System
WebView; cargando contenido remoto, la app no aporta nada que el navegador no
diera ya.

Google publica una ruta sancionada para este caso exacto —un PWA que quiere
estar en Play— y es Trusted Web Activity.

El sitio **ya cumple los criterios hoy**, sin tocar nada
(`public/manifest.json`, `public/sw.js`):

| criterio *Add to Home Screen* | estado |
|---|---|
| `name` + `short_name` | `Watchboard` / `WB` |
| `start_url` + `scope` | `/` y `/` |
| `display` | `standalone` |
| iconos 192 + 512 + maskable | los tres presentes |
| `theme_color` / `background_color` | `#0d1117` |
| service worker con handler `fetch` | sí, `public/sw.js` |
| HTTPS | `watchboard.dev` |

## Decisión

Publicar la app de Android como **Trusted Web Activity generada con
Bubblewrap**, apuntando a `https://watchboard.dev`, y **reemplazar** el plan de
Tauri para Android por esta vía.

Detalles que necesita quien lo implemente:

- **Verificación de dominio.** Digital Asset Links. `assetlinks.json` va en
  `public/.well-known/assetlinks.json` y lleva el `package_name` y la huella
  SHA-256 del certificado de firma. Con Play App Signing esa huella la emite
  Play Console, así que **el fichero no se puede cerrar hasta que exista la
  ficha en Play**. Si la verificación falla, Chrome degrada a Custom Tab —
  visible, no silencioso.
- **Identificador.** Sigue siendo permanente tras la primera subida. La
  propuesta sigue siendo `dev.watchboard.app`.
- **Build.** `npx @bubblewrap/cli init --manifest https://watchboard.dev/manifest.json`
  y `bubblewrap build --aab`. Node ≥ 14.15 y un JDK; **ni Rust, ni NDK, ni los
  cuatro targets de cross-compile** que pinaba el Task 5 del plan de Tauri, ni
  el parcheo de `targetSdkVersion` dentro del `build.gradle.kts` generado.
- **Locales.** Bubblewrap declara que la app soporta todos los idiomas salvo
  que se fije `resConfigs`. Con cuatro locales en el sitio, hay que fijarlo
  explícitamente.
- **Firma.** Una sola clave para siempre; perderla impide actualizar la app.
  Va a Play App Signing, no al repositorio — el `.gitignore` del plan de Tauri
  para keystore y service-account JSON sigue siendo necesario tal cual.

## Consecuencias

**Qué mejora**

- *UX*: renderiza **Chrome completo**, no el System WebView. Para este producto
  no es un detalle: el globo es Cesium/WebGL y el conjunto e2e ya prueba contra
  Chromium, así que la app muestra exactamente lo que está probado, en vez de
  depender del WebView que traiga cada fabricante. Sin barra de URL. Las
  actualizaciones del sitio son actualizaciones de la app, al instante y sin
  pasar por revisión.
- *Seguridad*: la app anfitriona **no puede leer** el contenido web ni cookies
  ni `localStorage` de la TWA; el único canal es la URL. Digital Asset Links
  ata app y dominio criptográficamente. El motor se actualiza por Chrome, con
  sus parches, sin publicar una versión. No hay puente IPC propio que asegurar
  —el `security.csp: null` que la propia revisión del plan de Tauri marcó como
  desactivador del endurecimiento IPC deja de existir como riesgo.
- *DX*: una herramienta npm y un `twa-manifest.json` contra un toolchain de
  Rust + Android NDK pinado a mano. El CI pasa de instalar NDK 26.1.10909125,
  Java 17 y cuatro targets de Rust a instalar un JDK.
- **Cero cambios en el sitio.** La TWA corre sobre el origen real
  `https://watchboard.dev`, que ya está en `ALLOWED_ORIGINS` de
  `functions/api/push/_shared.ts`, así que el segundo hallazgo de la revisión
  del plan de Tauri —ampliar la allowlist CORS a un origen de Tauri— deja de
  hacer falta. El primero, la guarda del service worker contra un hostname
  escrito a mano, ya está arreglado (#366) y con TWA ni siquiera se habría
  disparado, porque no hay origen nuevo.

**Qué se vuelve más difícil / qué se acepta**

- No hay acceso a APIs nativas más allá de lo que expone la web. Watchboard no
  usa ninguna hoy; si algún día hace falta (p. ej. widgets de pantalla de
  inicio), esta vía no sirve y habría que revisar la decisión.
- La app depende de que el usuario tenga Chrome 72+ o un navegador que
  implemente el protocolo. En Android actual es lo normal, pero es una
  dependencia que Tauri no tendría.
- Sin red, la app vale lo que valga el service worker. Hoy eso es una caché, no
  una experiencia offline completa.
- Sigue siendo una app que muestra un sitio. TWA es la ruta sancionada y el PWA
  aporta instalabilidad, offline parcial y push, pero la política de
  funcionalidad mínima la aplica un revisor: conviene que la ficha describa el
  valor de app, no solo el sitio.

**Qué cambia en el roadmap**

- `rm-tauri-android` pasa de "el plan está escrito, la decisión no" a esta
  decisión, con el esfuerzo bajando de XL a M: desaparecen el crate de Rust, el
  NDK, los cuatro targets y el parcheo de gradle.
- `docs/superpowers/plans/2026-08-19-tauri-android-play-store.md` **no se
  borra**: queda como el análisis que produjo la medición y los dos hallazgos
  cross-origin, marcado como reemplazado por este ADR.

**Qué sigue bloqueado en el dueño** (y no lo desbloquea este ADR)

1. Crear la ficha en Play Console (cuenta de desarrollador, 25 USD únicos).
2. Confirmar `dev.watchboard.app` — irreversible tras la primera subida.
3. Play App Signing, de donde sale la huella SHA-256 para `assetlinks.json`.

Con 1-3 hechos, lo demás es scriptable: generar el proyecto, publicar
`assetlinks.json`, y un workflow de build+upload contra el canal interno.

## Alternativas consideradas

- **Tauri v2 con `dist/` empaquetado** — imposible: 2,3 GB contra 200 MB.
- **Tauri v2 con carga remota** — es la forma que Google llama webview spam, y
  paga un toolchain de Rust y NDK por un WebView peor que Chrome.
- **Capacitor / Cordova** — mismo problema de política que Tauri remoto, con un
  WebView igualmente vendor-dependiente; el DX en JS no compensa.
- **Solo PWA, sin Play** — es el statu quo y es defendible; Play solo añade
  descubribilidad. Esta decisión no la vuelve obligatoria, la abarata.
- **App nativa de verdad** — reescribir el producto. Fuera de proporción.

## Referencias

- Plan reemplazado: `docs/superpowers/plans/2026-08-19-tauri-android-play-store.md`
- [Overview of Trusted Web Activities](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
  — Chrome 72+, Digital Asset Links, el anfitrión no accede a cookies ni `localStorage`
- [Trusted Web Activities Quick Start](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2)
- [Developer tips: common policy pitfalls](https://android-developers.googleblog.com/2020/10/developer-tips-and-guides-common-policy.html)
  — "webview spam" bajo funcionalidad mínima
- [Submitting a PWA to Google Play using Bubblewrap](https://vaadin.com/blog/submitting-a-pwa-to-google-play-store-using-bubblewrap)
  — `--aab`, firma, `assetlinks.json`
- [Publishing a PWA (dApp Store)](https://docs.solanamobile.com/dapp-publishing/publishing-a-pwa)
  — el aviso de `resConfigs` y los locales
- Medición de `dist/`: #366, y `rm-tauri-android` en `src/data/roadmap-items.ts`
