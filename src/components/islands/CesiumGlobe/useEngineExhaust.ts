import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  Cartesian3,
  Cartesian2,
  Color,
  ParticleSystem,
  ParticleBurst,
  CircleEmitter,
  Matrix4,
  JulianDate,
  type Viewer as CesiumViewer,
} from 'cesium';
import type { VectorSet } from './mission-vectors';

const THRUST_VISIBLE_THRESHOLD = 0.01; // m/s² — same as mission-vectors.ts

/**
 * Engine exhaust particle effect — emits glowing particles from the
 * spacecraft when thrust is detected (during burn phases).
 */
export function useEngineExhaust(
  viewer: CesiumViewer | null,
  positionRef: MutableRefObject<Cartesian3 | null>,
  vectorsRef: MutableRefObject<VectorSet | null>,
  simTimeRef: MutableRefObject<number>,
) {
  const particleSystemRef = useRef<ParticleSystem | null>(null);

  useEffect(() => {
    if (!viewer) return;

    // Create particle system (initially hidden — no emission when no thrust)
    const ps = new ParticleSystem({
      image: createExhaustImage(),
      startColor: Color.fromCssColorString('#ff6600').withAlpha(0.9),
      endColor: Color.fromCssColorString('#ffaa00').withAlpha(0.0),
      startScale: 1.0,
      endScale: 4.0,
      minimumParticleLife: 0.3,
      maximumParticleLife: 1.2,
      minimumSpeed: 50,
      maximumSpeed: 200,
      imageSize: new Cartesian2(8, 8),
      emissionRate: 0, // start with no emission
      emitter: new CircleEmitter(2.0),
      lifetime: 16.0,
      modelMatrix: Matrix4.IDENTITY,
    });

    viewer.scene.primitives.add(ps);
    particleSystemRef.current = ps;

    // Per-frame: position the emitter at spacecraft and toggle based on thrust
    const onPreRender = () => {
      const pos = positionRef.current;
      const vecs = vectorsRef.current;
      if (!pos || !ps) return;

      // Move particle system to spacecraft position
      ps.modelMatrix = Matrix4.fromTranslation(pos);

      // Toggle emission based on thrust magnitude
      const thrustMag = vecs ? Cartesian3.magnitude(vecs.thrust) : 0;
      if (thrustMag > THRUST_VISIBLE_THRESHOLD) {
        // Scale emission rate and speed with thrust magnitude
        ps.emissionRate = Math.min(300, thrustMag * 30);
        ps.minimumSpeed = 50 + thrustMag * 10;
        ps.maximumSpeed = 200 + thrustMag * 20;
      } else {
        ps.emissionRate = 0;
      }
    };

    viewer.scene.preRender.addEventListener(onPreRender);

    return () => {
      viewer.scene.preRender.removeEventListener(onPreRender);
      if (particleSystemRef.current) {
        viewer.scene.primitives.remove(particleSystemRef.current);
        particleSystemRef.current = null;
      }
    };
  }, [viewer]);
}

/** Create a small radial gradient canvas for particles */
function createExhaustImage(): HTMLCanvasElement {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, 'rgba(255, 200, 50, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 120, 20, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return canvas;
}
