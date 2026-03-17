import { useEffect, useRef } from 'react';
import {
  Cartesian3,
  CallbackProperty,
  JulianDate,
  NearFarScalar,
  VerticalOrigin,
  HorizontalOrigin,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MapLine } from '../../../lib/schemas';
import {
  arc3D,
  lineWidth,
  arcMaterial,
  weaponPeakAlt,
  weaponColor,
  weaponTrailMaterial,
  weaponTrailWidth,
  weaponBillboardSize,
  weaponIconType,
} from './cesium-helpers';
import { getIconDataUri } from './cesium-icons';

interface MissileAnimation {
  lineId: string;
  simLaunchTime: number;
  wallStartMs: number;
  launchFraction: number;
  arcPositions: Cartesian3[];
  trailEntity: Entity | null;
  projectileEntity: Entity | null;
  started: boolean;
  completed: boolean;
}

/** Max projectile entities per arc (visual fidelity cap) */
const PER_ARC_CAP = 50;
/** Max total projectile entities across all arcs (performance cap) */
const MAX_TOTAL_PROJECTILES = 400;
/** Max animated arcs (lines with trails) */
const MAX_ARCS = 30;

/** Arc segments — higher = smoother projectile movement */
const ARC_SEGMENTS = 200;

/** Scratch Cartesian3 for interpolation (avoids GC pressure) */
const scratchLerp = new Cartesian3();

/** Linearly interpolate along a polyline arc at fractional position t ∈ [0,1] */
function lerpArc(arc: Cartesian3[], t: number): Cartesian3 {
  const maxIdx = arc.length - 1;
  const fIdx = t * maxIdx;
  const lo = Math.floor(fIdx);
  const hi = Math.min(lo + 1, maxIdx);
  const frac = fIdx - lo;
  return Cartesian3.lerp(arc[lo], arc[hi], frac, scratchLerp);
}

/**
 * Wall-clock animation duration (ms) scaled by clock multiplier.
 * 8s at 1x, shorter at higher speeds, min 1.5s.
 */
function realAnimMs(clockMultiplier: number): number {
  const m = Math.max(1, Math.abs(clockMultiplier) || 1);
  return Math.max(1500, 8000 / (Math.log10(m) + 1));
}

/** Read the viewer's current clock time as Unix ms */
function viewerNowMs(viewer: CesiumViewer): number {
  return JulianDate.toDate(viewer.clock.currentTime).getTime();
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
 * - When playing: missiles launch at their designated sim-time (line.time),
 *   then animate using wall-clock duration scaled by clock speed.
 *   Speed changes mid-flight adjust remaining duration smoothly.
 * - When not playing: shows all lines as static arcs.
 * - On date/lines change: cleans up all entities and rebuilds.
 */
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

    const lateralOffsets = computeLateralOffsets(lines);

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
      const isWeaponLine = line.cat === 'strike' || line.cat === 'retaliation';
      const positions = arc3D(line.from, line.to, 60, weaponPeakAlt(line.weaponType), offset);
      const entity = viewer.entities.add({
        name: line.label,
        polyline: {
          positions,
          width: isWeaponLine ? weaponTrailWidth(line.weaponType) : lineWidth(line.cat),
          material: isWeaponLine ? weaponTrailMaterial(line.weaponType) : arcMaterial(line.cat),
        },
      });
      staticEntitiesRef.current.push(entity);

      // Show weapon billboard at destination when paused
      if (isWeaponLine && line.weaponType) {
        const color = weaponColor(line.weaponType);
        const iconType = weaponIconType(line.weaponType);
        const size = weaponBillboardSize(line.weaponType, true);
        const endpointEntity = viewer.entities.add({
          position: Cartesian3.fromDegrees(line.to[0], line.to[1], 0),
          billboard: {
            image: getIconDataUri(iconType, color.toCssColorString()),
            width: size.width,
            height: size.height,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            scaleByDistance: new NearFarScalar(1e5, 1.0, 1e7, 0.3),
          },
        });
        staticEntitiesRef.current.push(endpointEntity);
      }
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
          width: weaponTrailWidth(line.weaponType),
          material: weaponTrailMaterial(line.weaponType),
        },
      });
      staticEntitiesRef.current.push(entity);

      // Endpoint billboard for overflow arcs
      if (line.weaponType) {
        const color = weaponColor(line.weaponType);
        const iconType = weaponIconType(line.weaponType);
        const size = weaponBillboardSize(line.weaponType, false);
        const endpointEntity = viewer.entities.add({
          position: Cartesian3.fromDegrees(line.to[0], line.to[1], 0),
          billboard: {
            image: getIconDataUri(iconType, color.toCssColorString()),
            width: size.width,
            height: size.height,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            scaleByDistance: new NearFarScalar(1e5, 1.0, 1e7, 0.3),
          },
        });
        staticEntitiesRef.current.push(endpointEntity);
      }
    }

    if (animatable.length === 0) {
      return () => {
        if (!viewer.isDestroyed()) {
          cleanup(viewer, animationsRef.current, staticEntitiesRef.current);
        }
        animationsRef.current = [];
        staticEntitiesRef.current = [];
      };
    }

    const baseSimTime = new Date(currentDate + 'T00:00:00Z').getTime();
    const simNow = viewer.isDestroyed() ? baseSimTime : viewerNowMs(viewer);
    let totalProjectiles = 0;

    for (let i = 0; i < animatable.length; i++) {
      const line = animatable[i];
      const peakAlt = weaponPeakAlt(line.weaponType);
      const arcOffset = lateralOffsets.get(line.id) ?? 0;
      const mainArc = arc3D(line.from, line.to, ARC_SEGMENTS, peakAlt, arcOffset);
      const color = weaponColor(line.weaponType);
      const iconType = weaponIconType(line.weaponType);
      const leadSize = weaponBillboardSize(line.weaponType, true);
      const swarmSize = weaponBillboardSize(line.weaponType, false);

      // Sub-day timing from line.time field
      let timeOffset = 0;
      if (line.time) {
        const match = line.time.match(/^(\d{1,2}):(\d{2})$/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const mins = parseInt(match[2], 10);
          timeOffset = (hours * 3600 + mins * 60) * 1000;
        }
      }

      const simLaunchTime = baseSimTime + timeOffset;
      // If sim clock already past launch time, start immediately
      const alreadyPast = simNow >= simLaunchTime;

      // How many projectiles for this line
      const launched = line.launched || 1;
      const remaining = MAX_TOTAL_PROJECTILES - totalProjectiles;
      const projCount = Math.min(launched, PER_ARC_CAP, Math.max(1, remaining));

      const trailW = weaponTrailWidth(line.weaponType) + Math.min(projCount / 10, 3);

      // ── Trail entity ──
      const trailAnim: MissileAnimation = {
        lineId: line.id,
        simLaunchTime,
        wallStartMs: alreadyPast ? Date.now() : 0,
        launchFraction: 0,
        arcPositions: mainArc,
        started: alreadyPast,
        trailEntity: viewer.entities.add({
          polyline: {
            positions: new CallbackProperty((_time?: JulianDate) => {
              if (trailAnim.completed) return mainArc;
              if (!trailAnim.started) return [mainArc[0]];
              const dur = realAnimMs(viewer.isDestroyed() ? 1 : viewer.clock.multiplier);
              const elapsed = Date.now() - trailAnim.wallStartMs;
              const progress = Math.min(Math.max(elapsed / dur, 0), 1);
              const segCount = Math.max(1, Math.floor(progress * mainArc.length));
              return mainArc.slice(0, segCount);
            }, false) as any,
            width: trailW,
            material: weaponTrailMaterial(line.weaponType, line.confidence === 'low' ? 0.4 : 0.9),
          },
        }),
        projectileEntity: null,
        completed: false,
      };
      animationsRef.current.push(trailAnim);

      // ── Projectile swarm ──
      const rng = seededRandom(hashString(line.id));
      const baseLateralSpread = projCount > 1 ? 0.4 : 0;

      for (let p = 0; p < projCount; p++) {
        const offsetLon = (rng() - 0.5) * baseLateralSpread;
        const offsetLat = (rng() - 0.5) * baseLateralSpread;
        const altFactor = 1 + (rng() - 0.5) * 0.2;

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
          projArc = arc3D(projFrom, projTo, ARC_SEGMENTS, peakAlt * altFactor, arcOffset);
        } else {
          projArc = mainArc;
        }

        const launchFrac = projCount > 1 ? rng() * 0.4 : 0;

        const projAnim: MissileAnimation = {
          lineId: `${line.id}_p${p}`,
          simLaunchTime,
          wallStartMs: alreadyPast ? Date.now() : 0,
          launchFraction: launchFrac,
          arcPositions: projArc,
          started: alreadyPast,
          trailEntity: null,
          projectileEntity: viewer.entities.add({
            position: new CallbackProperty((_time?: JulianDate) => {
              if (projAnim.completed) return projArc[projArc.length - 1];
              if (!projAnim.started) return projArc[0];
              const dur = realAnimMs(viewer.isDestroyed() ? 1 : viewer.clock.multiplier);
              const myDelay = launchFrac * dur;
              const elapsed = Date.now() - projAnim.wallStartMs - myDelay;
              const progress = Math.min(Math.max(elapsed / dur, 0), 1);
              return lerpArc(projArc, progress);
            }, false) as any,
            billboard: {
              image: getIconDataUri(iconType, color.toCssColorString()),
              width: p === 0 ? leadSize.width : swarmSize.width,
              height: p === 0 ? leadSize.height : swarmSize.height,
              verticalOrigin: VerticalOrigin.CENTER,
              horizontalOrigin: HorizontalOrigin.CENTER,
              scaleByDistance: new NearFarScalar(1e5, 1.0, 1e7, 0.3),
            },
          }),
          completed: false,
        };
        animationsRef.current.push(projAnim);
        totalProjectiles++;
      }
    }

    // Animation tick loop — start pending animations, complete finished ones
    const tick = () => {
      if (!viewer || viewer.isDestroyed()) {
        rafRef.current = 0;
        return;
      }

      let anyActive = false;
      const now = Date.now();
      const simNowTick = viewerNowMs(viewer);
      const dur = realAnimMs(viewer.clock.multiplier);

      for (const anim of animationsRef.current) {
        if (anim.completed) continue;

        // Check if sim clock has reached launch time
        if (!anim.started) {
          if (simNowTick >= anim.simLaunchTime) {
            anim.started = true;
            anim.wallStartMs = now;
          } else {
            anyActive = true;
            continue;
          }
        }

        const myDelay = anim.launchFraction * dur;
        const elapsed = now - anim.wallStartMs - myDelay;
        if (elapsed >= dur) {
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
