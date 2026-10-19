# Dónde se va el tiempo (medición, 19 oct 2026)

El item `rm-cloudflare-pages` llevaba desde abril como P0 con esta
justificación: *«GH Pages TTFB is 1.8-2.5s; Cloudflare Pages typically
200-400ms + automatic Brotli compression»*. Nadie la había vuelto a medir.
Esto es esa medición, hecha desde diez países con
[Globalping](https://globalping.io) y con un control dentro del propio
proyecto.

## 1. TTFB de GitHub Pages, diez países

`GET https://watchboard.dev/` — una sonda por país, HTTP 200 en los diez:

| país | TTFB | total | | país | TTFB | total |
|---|---|---|---|---|---|---|
| FR Roubaix | 127 ms | 171 ms | | JP Tokio | 189 ms | 240 ms |
| ES Madrid | 132 ms | **1.219 ms** | | US Buffalo | 182 ms | 316 ms |
| GB Londres | 134 ms | 169 ms | | AU Sídney | 235 ms | 254 ms |
| BR São Paulo | 163 ms | 242 ms | | IN Bombay | 236 ms | **1.274 ms** |
| DE Falkenstein | 260 ms | 355 ms | | ZA Johannesburgo | 259 ms | 467 ms |

**TTFB: mínimo 127 ms, mediana 189 ms, máximo 260 ms.** En ningún sitio se
acerca a 1,8-2,5 s. La premisa del P0 no se reproduce en 2026.

Y gzip ya está activo: 735.734 B de HTML salen como 168.003 B.

## 2. El control: Cloudflare contra GitHub Pages, mismo dueño, mismas regiones

`push.watchboard.dev` ya está en Cloudflare (el worker de notificaciones). Eso
permite comparar las dos plataformas desde las mismas sondas, el mismo rato:

| | mediana | mínimo | máximo |
|---|---|---|---|
| Cloudflare (`push.watchboard.dev`) | **75 ms** | 30 ms | 427 ms |
| GitHub Pages (`/bolivia-crisis/`, 12 KB) | 177 ms | 49 ms | 265 ms |

Por país (TTFB, Cloudflare → Pages): DE 30→143 · ES 40→265 · FR 43→124 ·
GB 34→69 · IN 75→232 · JP 141→177 · US 64→**49** · BR 145→147 ·
AU 207→231 · ZA **427**→229.

**Hay ~100 ms de mediana que ganar, concentrados en Europa.** No son los 1-2
segundos del item, pero tampoco es nada. En EE. UU. y Sudáfrica Pages gana.

*Cautela:* no es un A/B limpio. Un worker que responde dinámicamente y un
fichero estático de 12 KB no son la misma carga de trabajo, aunque el TTFB
dependa poco del tamaño. Es indicativo, no concluyente.

## 3. Lo que de verdad cuesta un segundo no es el host

Madrid: TTFB 132 ms, total **1.219 ms**. Bombay: 236 ms y **1.274 ms**. La
misma página de 12 KB desde Madrid: total ~231 ms. La diferencia no es
latencia de servidor, es **transferencia**.

Y el HTML de la portada es así:

```
735.734 B en crudo (168.003 B con gzip)
  669.160 B  (90%)  en dos atributos props de <astro-island>
    el mayor:  644.321 B
    1.185 B   JSON-LD
   12.484 B   scripts inline
    6.062 B   <style> inline
```

**El 90% de la portada son dos atributos HTML.** Ningún cambio de CDN toca
eso. `rm-cut-html-payload` estima «157 KB → ~40 KB» con una cifra que, dice el
propio item, *«predates 125 trackers and has not been re-measured»*: medido
hoy son 735 KB, 4,7× la estimación registrada.

Ese item depende hoy de `rm-cloudflare-pages`. Es al revés: recortar el
payload no necesita cambiar de host, y es la palanca grande.

## 4. El coste de mantener la opción abierta

`functions/api/push/` es una segunda implementación de la API de push —la que
correría si el sitio se mudara a Cloudflare Pages— junto a la que sí está
desplegada en `worker/`. No la despliega nada, y **`functions` está en el
`exclude` de `tsconfig.check.json`**, así que no la compila nada tampoco.

Ya han divergido:

| handler | líneas que difieren |
|---|---|
| `cron.ts` | 329 |
| `preferences.ts` | 135 |
| `subscribe.ts` | 87 |
| `unsubscribe.ts` | 69 |
| `web-push.ts` | 29 |

El arreglo de tipos de `Uint8Array`/`BufferSource` de #360 está solo en la
copia de `worker/`. La de `functions/` sigue con el problema latente, invisible
porque nadie la compila. Dos copias de código que hace criptografía y CORS,
uno de ellos muerto.

## Qué hacer con esto

1. `rm-cloudflare-pages` no es un P0 por rendimiento: la ganancia medida es
   ~100 ms de mediana en Europa, no 1-2 s. Si se hace, que sea por otras
   razones (Workers, control del edge, la API de push unificada) y con estos
   números delante.
2. `rm-cut-html-payload` deja de depender de él y sube de prioridad: 735 KB,
   90% en dos atributos, y es lo que cuesta el segundo en Madrid y Bombay.
3. La copia de `functions/` o se despliega, o se compila, o se borra. Hoy no
   es ninguna de las tres.

## Reproducirlo

```bash
curl -s -X POST https://api.globalping.io/v1/measurements \
  -H 'Content-Type: application/json' \
  -d '{"type":"http","target":"watchboard.dev","limit":10,
       "locations":[{"country":"DE"},{"country":"GB"},{"country":"FR"},
                    {"country":"ES"},{"country":"US"},{"country":"BR"},
                    {"country":"IN"},{"country":"JP"},{"country":"AU"},
                    {"country":"ZA"}],
       "measurementOptions":{"protocol":"HTTPS","request":{"path":"/"}}}'
# y luego GET /v1/measurements/<id> hasta status: finished
```
