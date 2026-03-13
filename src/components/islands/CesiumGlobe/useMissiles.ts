import { useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  CallbackProperty,
  JulianDate,
  PolylineGlowMaterialProperty,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MapLine } from '../../../lib/schemas';
import {
  arc3D,
  catToCesiumColor,
  lineWidth,
  arcMaterial,
  simFlightDurationTyped,
  weaponPeakAlt,
  weaponProjectileSize,
  weaponGlowPower,
} from './cesium-helpers';

interface MissileAnimation {
  lineId: string;
  arcStartTime: number;
  launchFraction: number;
  simDuration: number;
  arcPositions: Cartesian3[];
  trailEntity: Entity | null;
  projectileEntity: Entity | null;
  completed: boolean;
}

/** Max projectile entities per arc (visual fidelity cap) */
const PER_ARC_CAP = 50;
/** Max total projectile entities across all arcs (performance cap) */
const MAX_TOTAL_PROJECTILES = 400;
/** Max animated arcs (lines with trails) */
const MAX_ARCS = 30;

/** Animation duration bounds in real (wall-clock) seconds */
const MIN_REAL_SEC = 2;
const MAX_REAL_SEC = 12;

/**
 * Cap sim duration so animation takes MIN_REAL_SEC–MAX_REAL_SEC wall-clock
 * seconds regardless of playback speed.
 */
function effectiveDuration(simDuration: number, clockMultiplier: number): number {
  const m = Math.abs(clockMultiplier) || 1;
  const minSim = MIN_REAL_SEC * m * 1000;
  const maxSim = MAX_REAL_SEC * m * 1000;
  return Math.max(minSim, Math.min(simDuration, maxSim));
}

// Seeded random for deterministic spread per line
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Compute lateral offsets (degrees) for lines that share similar from/to
 * coordinates, so overlapping arcs fan out and are all visible.
 */
function computeLateralOffsets(lines: MapLine[]): Map<string, number> {
  const offsets = new Map<string, number>();
  const groups = new Map<string, string[]>();

  // Group by rounded endpoints (0.5° grid) to detect overlaps
  for (const line of lines) {
    const key = [
      Math.round(line.from[0] * 2) / 2,
      Math.round(line.from[1] * 2) / 2,
      Math.round(line.to[0] * 2) / 2,
      Math.round(line.to[1] * 2) / 2,
    ].join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(line.id);
  }

  for (const [, ids] of groups) {
    if (ids.length <= 1) {
      offsets.set(ids[0], 0);
    } else {
      // Spread increases with group size, capped at 1.5°
      const totalSpread = Math.min(0.3 * ids.length, 1.5);
      for (let i = 0; i < ids.length; i++) {
        const offset = (i / (ids.length - 1) - 0.5) * totalSpread;
        offsets.set(ids[i], offset);
      }
    }
  }

  return offsets;
}

/**
 * Renders arcs for the current date's lines.
 * - When playing: animates strike/retaliation synced to sim-time velocity.
 *   Each arc spawns up to PER_ARC_CAP projectiles along randomized parallel
 *   paths with staggered launch times — creating a realistic missile swarm.
 *   Animation duration is dynamically capped to 2–12 real seconds at any
 *   clock speed via viewer.clock.multiplier.
 * - When not playing: shows all lines as static arcs.
 * - On date/lines change: cleans up all entities and rebuilds.
 */
/** Read the viewer's current clock time as Unix ms */
function viewerNowMs(viewer: CesiumViewer): number {
  return JulianDate.toDate(viewer.clock.currentTime).getTime();
}

export function useMissiles(
  viewer: CesiumViewer | null,
  lines: MapLine[],
  currentDate: string,
  isPlaying: boolean,
): void {
  const animationsRef = useRef<MissileAnimation[]>([]);
  const staticEntitiesRef = useRef<Entity[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Clean up everything from the previous render
    cleanup(viewer, animationsRef.current, staticEntitiesRef.current);
    animationsRef.current = [];
    staticEntitiesRef.current = [];
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (lines.length === 0) return;

    // Compute lateral offsets so overlapping arcs fan out
    const lateralOffsets = computeLateralOffsets(lines);

    // Determine which lines to animate vs show static
    const toAnimate: MapLine[] = [];
    const toStatic: MapLine[] = [];

    for (const line of lines) {
      if (isPlaying && (line.cat === 'strike' || line.cat === 'retaliation')) {
        toAnimate.push(line);
      } else {
        toStatic.push(line);
      }
    }

    // Render static arcs immediately
    for (const line of toStatic) {
      const offset = lateralOffsets.get(line.id) ?? 0;
      const positions = arc3D(line.from, line.to, 60, weaponPeakAlt(line.weaponType), offset);
      const entity = viewer.entities.add({
        name: line.label,
        polyline: {
          positions,
          width: lineWidth(line.cat),
          material: arcMaterial(line.cat),
        },
      });
      staticEntitiesRef.current.push(entity);
    }

    // Cap animated arcs — overflow goes to static
    const animatable = toAnimate.slice(0, MAX_ARCS);
    for (const line of toAnimate.slice(MAX_ARCS)) {
      const offset = lateralOffsets.get(line.id) ?? 0;
      const positions = arc3D(line.from, line.to, 60, weaponPeakAlt(line.weaponType), offset);
      const entity = viewer.entities.add({
        name: line.label,
        polyline: {
          positions,
          width: lineWidth(line.cat),
          material: arcMaterial(line.cat),
        },
      });
      staticEntitiesRef.current.push(entity);
    }

    if (animatable.length === 0) {
      // Return cleanup for static entities even when no animated arcs exist
      return () => {
        if (!viewer.isDestroyed()) {
          cleanup(viewer, animationsRef.current, staticEntitiesRef.current);
        }
        animationsRef.current = [];
        staticEntitiesRef.current = [];
      };
    }

    const baseSimTime = new Date(currentDate + 'T00:00:00Z').getTime();
    let totalProjectiles = 0;

    for (let i = 0; i < animatable.length; i++) {
      const line = animatable[i];
      const peakAlt = weaponPeakAlt(line.weaponType);
      const arcOffset = lateralOffsets.get(line.id) ?? 0;
      const mainArc = arc3D(line.from, line.to, 60, peakAlt, arcOffset);
      // Physics-based sim duration — dynamically capped per clock speed in callbacks
      const simDuration = simFlightDurationTyped(line.from, line.to, line.weaponType);
      const color = catToCesiumColor(line.cat);
      const baseSize = weaponProjectileSize(line.weaponType);
      const glowPwr = weaponGlowPower(line.weaponType);

      // Sub-day timing offset
      let timeOffset = 0;
      if (line.time) {
        const match = line.time.match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const mins = parseInt(match[2], 10);
          timeOffset = (hours * 3600 + mins * 60) * 1000;
        }
      }

      const arcStartTime = baseSimTime + timeOffset;

      // How many projectiles for this line
      const launched = line.launched || 1;
      const remaining = MAX_TOTAL_PROJECTILES - totalProjectiles;
      const projCount = Math.min(launched, PER_ARC_CAP, Math.max(1, remaining));

      // Scale projectile size down for large swarms
      const projSize = projCount > 10
        ? Math.max(2, baseSize - 2)
        : projCount > 5
          ? Math.max(3, baseSize - 1)
          : baseSize;

      // Trail width scales with volume
      const trailW = lineWidth(line.cat) + Math.min(projCount / 10, 3);

      // ── Trail entity (single growing polyline per arc) ──
      const trailAnim: MissileAnimation = {
        lineId: line.id,
        arcStartTime,
        launchFraction: 0,
        simDuration,
        arcPositions: mainArc,
        trailEntity: viewer.entities.add({
          polyline: {
            positions: new CallbackProperty((_time?: JulianDate) => {
              if (trailAnim.completed) return mainArc;
              const mult = viewer.isDestroyed() ? 1 : viewer.clock.multiplier;
              const effDur = effectiveDuration(simDuration, mult);
              const nowMs = viewer.isDestroyed() ? arcStartTime : viewerNowMs(viewer);
              const simElapsed = nowMs - arcStartTime;
              const progress = Math.min(Math.max(simElapsed / effDur, 0), 1);
              const segCount = Math.max(1, Math.floor(progress * mainArc.length));
              return mainArc.slice(0, segCount);
            }, false) as any,
            width: trailW,
            material: new PolylineGlowMaterialProperty({
              glowPower: glowPwr,
              color: color.withAlpha(line.confidence === 'low' ? 0.4 : 0.9),
            }),
          },
        }),
        projectileEntity: null,
        completed: false,
      };
      animationsRef.current.push(trailAnim);

      // ── Projectile swarm ──
      const rng = seededRandom(hashString(line.id));
      // Lateral spread in degrees — scales with distance
      const baseLateralSpread = projCount > 1 ? 0.4 : 0;

      for (let p = 0; p < projCount; p++) {
        // Randomize path for each projectile
        const offsetLon = (rng() - 0.5) * baseLateralSpread;
        const offsetLat = (rng() - 0.5) * baseLateralSpread;
        const altFactor = 1 + (rng() - 0.5) * 0.2;

        // Generate spread arc for this projectile
        let projArc: Cartesian3[];
        if (projCount > 1) {
          const projFrom: [number, number] = [
            line.from[0] + offsetLon * 0.15,
            line.from[1] + offsetLat * 0.15,
          ];
          const projTo: [number, number] = [
            line.to[0] + offsetLon * 0.15,
            line.to[1] + offsetLat * 0.15,
          ];
          projArc = arc3D(projFrom, projTo, 60, peakAlt * altFactor, arcOffset);
        } else {
          projArc = mainArc;
        }

        // Stagger: fraction of flight time (0–0.4), computed dynamically
        const launchFrac = projCount > 1 ? rng() * 0.4 : 0;

        const projAnim: MissileAnimation = {
          lineId: `${line.id}_p${p}`,
          arcStartTime,
          launchFraction: launchFrac,
          simDuration,
          arcPositions: projArc,
          trailEntity: null,
          projectileEntity: viewer.entities.add({
            position: new CallbackProperty((_time?: JulianDate) => {
              if (projAnim.completed) return projArc[projArc.length - 1];
              const mult = viewer.isDestroyed() ? 1 : viewer.clock.multiplier;
              const effDur = effectiveDuration(simDuration, mult);
              const myStart = arcStartTime + launchFrac * effDur;
              const nowMs = viewer.isDestroyed() ? arcStartTime : viewerNowMs(viewer);
              const simElapsed = nowMs - myStart;
              const progress = Math.min(Math.max(simElapsed / effDur, 0), 1);
              const idx = Math.min(
                Math.floor(progress * (projArc.length - 1)),
                projArc.length - 1,
              );
              return projArc[idx];
            }, false) as any,
            point: {
              pixelSize: p === 0 ? baseSize : projSize,
              color: Color.WHITE.withAlpha(p === 0 ? 1 : 0.8),
              outlineColor: color.withAlpha(p === 0 ? 0.8 : 0.5),
              outlineWidth: p === 0 ? (baseSize > 6 ? 5 : 4) : Math.max(2, projSize - 1),
            },
          }),
          completed: false,
        };
        animationsRef.current.push(projAnim);
        totalProjectiles++;
      }
    }

    // Animation tick loop — check for completion
    const tick = () => {
      if (!viewer || viewer.isDestroyed()) {
        rafRef.current = 0;
        return;
      }

      let anyActive = false;
      const nowMs = viewer.isDestroyed() ? 0 : viewerNowMs(viewer);
      const mult = viewer.clock.multiplier;

      for (const anim of animationsRef.current) {
        if (anim.completed) continue;

        const effDur = effectiveDuration(anim.simDuration, mult);
        const myStart = anim.arcStartTime + anim.launchFraction * effDur;
        const simElapsed = nowMs - myStart;
        if (simElapsed >= effDur) {
          if (anim.projectileEntity) {
            try { viewer.entities.remove(anim.projectileEntity); } catch { /* ok */ }
            anim.projectileEntity = null;
          }
          if (anim.trailEntity?.polyline) {
            anim.trailEntity.polyline.positions = anim.arcPositions as any;
          }
          anim.completed = true;
        } else {
          anyActive = true;
        }
      }

      if (anyActive) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (!viewer.isDestroyed()) {
        cleanup(viewer, animationsRef.current, staticEntitiesRef.current);
      }
      animationsRef.current = [];
      staticEntitiesRef.current = [];
    };
  }, [viewer, currentDate, isPlaying, lines]);
}

function cleanup(
  viewer: CesiumViewer,
  anims: MissileAnimation[],
  statics: Entity[],
) {
  for (const anim of anims) {
    if (anim.trailEntity) {
      try { viewer.entities.remove(anim.trailEntity); } catch { /* ok */ }
    }
    if (anim.projectileEntity) {
      try { viewer.entities.remove(anim.projectileEntity); } catch { /* ok */ }
    }
  }
  for (const entity of statics) {
    try { viewer.entities.remove(entity); } catch { /* ok */ }
  }
}
