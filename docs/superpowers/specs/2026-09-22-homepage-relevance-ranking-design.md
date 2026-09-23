# Diseño: ranking de relevancia en la vista de directorio + intereses de usuario

**Estado:** Propuesto
**Fecha:** 2026-09-22
**Contexto:** el homepage tiene dos vistas — la del globo/broadcast
(`CommandCenter`) y la cuadrícula de directorio (`TrackerDirectory.tsx`).
La primera ya tiene un sistema de ranking completo (`src/lib/relevance.ts`,
`src/lib/activity-index.ts`) con un toggle Relevancia/Actividad en
`SidebarPanel.tsx`. La segunda agrupa trackers por categoría
(`groupTrackers()`) pero no los ordena dentro de cada grupo — es la vista
donde el usuario notó que "la noticia más importante" no sube al tope.

Este documento cubre dos piezas relacionadas pero separables:
1. Aplicar el ranking ya existente a `TrackerDirectory.tsx` (gap real, gratis).
2. Extender la personalización más allá de "seguir" (`followedSlugs`,
   ya existente) a intereses declarados por tema/región, con dos superficies
   para declararlos: un panel de configuración persistente y un paso
   opcional en el onboarding.

## Resumen de lo que ya existe (no se reconstruye)

- `src/lib/activity-index.ts` — `computeActivity()`, score 0-100
  determinístico con factores declarados y pesos visibles (eventos
  recientes, breaking, secciones actualizadas, deltas de KPI, frescura del
  digest, calidad de fuente). Ya se calcula en `index.astro` para cada
  tracker.
- `src/lib/relevance.ts` — `computeRelevanceScore()` (breaking +40,
  seguido +15, editorial 0-30 desde activity-index, recencia 0-15),
  `sortByActivity()` (orden general, sin personalización) y
  `sortByRelevance()` (orden personalizado, usa `followedSlugs`).
- `followedSlugs` — estado real en `CommandCenter.tsx`, ya persistido,
  ya usado por el ranking, notificaciones y visuales del globo.
- `SidebarPanel.tsx` — ya tiene el toggle Relevancia/Actividad
  (`sortMode`), persistido en `localStorage['watchboard:sidebar-sort']`.
- `DomainSchema` / `RegionSchema` (`src/lib/tracker-config.ts`) — taxonomía
  ya existente en cada `tracker.json` (`domain`, `region`, ambos
  opcionales). No se inventa vocabulario nuevo.

## 1. Ranking en `TrackerDirectory.tsx`

`TrackerDirectory.tsx:879` hoy hace `groupTrackers(filtered)` directo,
sin ordenar. Cambio: ordenar `filtered` con `sortByRelevance` (o
`sortByActivity` si se agrega un toggle equivalente ahí; a decidir en el
plan si vale la pena replicar el toggle o si un solo modo por defecto
basta para esta vista) antes de agrupar, igual que ya hace
`SidebarPanel.tsx:526`. Reutiliza exactamente las mismas funciones — no
hay lógica nueva de scoring en esta pieza.

## 2. Intereses de usuario (tema/región)

### Estado

Nuevo hook `src/lib/interests.ts` (nombre a confirmar en el plan),
mismo patrón que el manejo de `followedSlugs` hoy en `CommandCenter.tsx`
(estado en `localStorage`, con `try/catch`, sin backend — coherente con
que todo lo personalizado en este sitio hoy vive en el navegador del
visitante, nunca en el servidor):

```ts
interface Interests {
  domains: Domain[];
  regions: Region[];
}
```

### Scoring

`computeRelevanceScore()` en `relevance.ts` gana un término adicional,
junto al `isFollowed: +15` ya existente:

```
interestScore: +10 si tracker.domain o tracker.region coincide con
  alguno de los intereses declarados; 0 si no hay intereses declarados
  o no hay coincidencia.
```

Valor propuesto (+10) intencionalmente menor que "seguir" (+15): seguir
es una señal explícita por tracker; el interés por tema/región es una
señal explícita pero más amplia/inferida sobre categorías. Sin
intereses declarados, el ranking se comporta exactamente como hoy
(Actividad + Seguido + recencia) — no hay regresión para quien no
interactúa con la función nueva.

### Superficie 1 — Panel de configuración persistente

Componente nuevo, ubicado cerca del panel de atajos `?` ya existente
(mismo nivel de descubribilidad — siempre accesible, no exclusivo del
primer visit). Chips togglables por cada valor de `DomainSchema` y
`RegionSchema`, i18n en las 4 locales existentes. Editable en cualquier
momento, sin fricción de guardar/cancelar (cada click persiste de
inmediato, mismo patrón que "seguir").

### Superficie 2 — Paso de onboarding (saltable)

El tour actual (`onboarding-steps.ts`) solo tiene tres tipos de paso:
`hero`, `spotlight`, `closing` — ninguno es interactivo. Este es el
único componente genuinely nuevo del diseño: un cuarto tipo de paso
(`type: 'interest-picker'`, nombre a confirmar) que reutiliza el chrome
visual de `HeroStep.tsx` pero renderiza los mismos chips del panel de
configuración en lugar de solo texto. Insertado como paso opcional
(saltable como el resto del tour, sin bloquear "Siguiente"), en
`DESKTOP_STEPS` — no se agrega a `MOBILE_STEPS` en esta fase salvo que
el plan decida que vale la pena replicarlo ahí también.

Sin selección durante el onboarding, el usuario simplemente no tiene
intereses declarados — el ranking usa Actividad + Seguido + recencia
como hoy, y puede declarar intereses después desde el panel persistente.

## Testing

- `computeRelevanceScore` — casos nuevos: con intereses coincidentes
  (+10), sin coincidencia (+0), sin intereses declarados (+0,
  comportamiento idéntico al actual).
- `sortByRelevance` — orden estable con intereses de por medio.
- Hook de intereses — persistencia, degradación si `localStorage` no
  está disponible (mismo patrón `try/catch` que el resto del proyecto).
- Prueba manual: `TrackerDirectory.tsx` con y sin intereses declarados,
  confirmar que el orden cambia visiblemente cuando corresponde.

## Riesgos / decisiones abiertas para el plan

- **Si `TrackerDirectory.tsx` necesita su propio toggle Relevancia/
  Actividad** (como `SidebarPanel.tsx`) o si un solo modo por defecto
  (Relevancia) es suficiente para esa vista — afecta cuánta UI nueva
  hace falta ahí.
- **Nombre final del hook y del tipo de paso de onboarding** — deja
  espacio para que el plan elija nombres consistentes con el resto del
  código (ej. revisar convenciones de `onboarding.ts` antes de fijar
  `interest-picker` como nombre literal).
- **Si el paso de onboarding se replica en `MOBILE_STEPS`** — fuera de
  alcance salvo decisión explícita en el plan.
