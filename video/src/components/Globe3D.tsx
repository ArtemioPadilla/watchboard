import React, { useRef, useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import * as THREE from 'three';

interface Globe3DProps {
  center: { lat: number; lon: number };
  accentColor: string;
}

/** Convert lat/lng to 3D position on sphere */
function latLngToVector3(
  lat: number,
  lng: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Create a procedural earth wireframe geometry (meridians + parallels) */
function useGlobeLines(radius: number): THREE.BufferGeometry {
  return useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 64;

    // Parallels (latitude lines every 20 degrees)
    for (let lat = -80; lat <= 80; lat += 20) {
      for (let i = 0; i <= segments; i++) {
        const lng = (i / segments) * 360 - 180;
        points.push(latLngToVector3(lat, lng, radius));
        if (i < segments) {
          points.push(latLngToVector3(lat, lng + 360 / segments, radius));
        }
      }
    }

    // Meridians (longitude lines every 30 degrees)
    for (let lng = -180; lng < 180; lng += 30) {
      for (let i = 0; i <= segments; i++) {
        const lat = (i / segments) * 160 - 80;
        points.push(latLngToVector3(lat, lng, radius));
        if (i < segments) {
          points.push(
            latLngToVector3(lat + 160 / segments, lng, radius),
          );
        }
      }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }, [radius]);
}

/** Simplified continent outlines as lat/lng polylines */
const CONTINENT_OUTLINES: [number, number][][] = [
  // North America (simplified)
  [[-130,50],[-120,60],[-100,60],[-80,45],[-70,30],[-90,25],[-105,30],[-120,35],[-130,50]],
  // South America
  [[-80,-5],[-70,5],[-60,-5],[-50,-15],[-40,-20],[-50,-35],[-60,-40],[-70,-55],[-75,-45],[-80,-20],[-80,-5]],
  // Europe
  [[-10,35],[0,40],[5,45],[10,50],[20,55],[30,55],[40,50],[30,45],[25,40],[20,35],[10,35],[0,35],[-10,35]],
  // Africa
  [[-15,15],[0,35],[10,35],[30,30],[40,15],[50,10],[40,0],[35,-10],[30,-25],[20,-35],[15,-30],[10,-5],[0,5],[-15,15]],
  // Asia (simplified)
  [[40,50],[60,55],[80,50],[100,55],[120,50],[140,45],[130,35],[120,30],[110,20],[100,15],[80,15],[70,25],[60,35],[40,50]],
  // Australia
  [[115,-15],[130,-15],[150,-20],[155,-30],[145,-38],[130,-35],[115,-25],[115,-15]],
];

function useContinentLines(radius: number): THREE.BufferGeometry {
  return useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (const outline of CONTINENT_OUTLINES) {
      for (let i = 0; i < outline.length - 1; i++) {
        const [lng1, lat1] = outline[i];
        const [lng2, lat2] = outline[i + 1];
        // Subdivide for smoothness
        const steps = 8;
        for (let s = 0; s < steps; s++) {
          const t1 = s / steps;
          const t2 = (s + 1) / steps;
          const la1 = lat1 + (lat2 - lat1) * t1;
          const lo1 = lng1 + (lng2 - lng1) * t1;
          const la2 = lat1 + (lat2 - lat1) * t2;
          const lo2 = lng1 + (lng2 - lng1) * t2;
          points.push(latLngToVector3(la1, lo1, radius + 0.005));
          points.push(latLngToVector3(la2, lo2, radius + 0.005));
        }
      }
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [radius]);
}

/** Inner scene rendered by ThreeCanvas */
const GlobeScene: React.FC<{
  center: { lat: number; lon: number };
  accentColor: string;
}> = ({ center, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groupRef = useRef<THREE.Group>(null);
  const RADIUS = 1.8;

  // Entry animation
  const entrySpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 80, mass: 1.2 },
  });
  const scale = interpolate(entrySpring, [0, 1], [0.6, 1]);

  // Slow rotation + zoom toward target
  const baseRotationY = interpolate(frame, [0, 150], [0, Math.PI * 0.3]);

  // Compute target rotation to face the tracker location
  const targetTheta = -(center.lon + 90) * (Math.PI / 180);
  const rotationY = interpolate(frame, [0, 80], [baseRotationY, targetTheta], {
    extrapolateRight: 'clamp',
  });

  const tiltX = interpolate(
    frame,
    [0, 80],
    [0.1, -(center.lat * 0.4 * Math.PI) / 180],
    { extrapolateRight: 'clamp' },
  );

  // Camera zoom
  const cameraZ = interpolate(frame, [0, 90], [5.5, 4.0], {
    extrapolateRight: 'clamp',
  });

  // Pulsing dot
  const dotPos = latLngToVector3(center.lat, center.lon, RADIUS + 0.03);
  const pulseScale = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.03, 0.06],
  );
  const dotOpacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Ring pulse
  const ringScale = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.06, 0.14],
  );
  const ringOpacity = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.2, 0.5],
  );

  const globeLines = useGlobeLines(RADIUS);
  const continentLines = useContinentLines(RADIUS);

  const accentColorObj = useMemo(
    () => new THREE.Color(accentColor),
    [accentColor],
  );

  return (
    <>
      {/* Camera */}
      <perspectiveCamera
        position={[0, 0, cameraZ]}
        fov={45}
        near={0.1}
        far={100}
      />

      {/* Ambient + directional light */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 2, 5]} intensity={0.8} color="#ffffff" />
      <directionalLight
        position={[-2, -1, -3]}
        intensity={0.2}
        color="#3498db"
      />

      {/* Globe group */}
      <group
        ref={groupRef}
        rotation={[tiltX, rotationY, 0]}
        scale={[scale, scale, scale]}
      >
        {/* Dark sphere body */}
        <mesh>
          <sphereGeometry args={[RADIUS, 48, 48]} />
          <meshStandardMaterial
            color="#0d1117"
            roughness={0.9}
            metalness={0.1}
          />
        </mesh>

        {/* Grid wireframe */}
        <lineSegments geometry={globeLines}>
          <lineBasicMaterial color="#1a2535" transparent opacity={0.35} />
        </lineSegments>

        {/* Continent outlines */}
        <lineSegments geometry={continentLines}>
          <lineBasicMaterial color="#2a4060" transparent opacity={0.7} />
        </lineSegments>

        {/* Atmosphere rim (slightly larger transparent sphere) */}
        <mesh>
          <sphereGeometry args={[RADIUS * 1.02, 48, 48]} />
          <meshBasicMaterial
            color="#3498db"
            transparent
            opacity={0.06}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Pulsing ring at tracker location */}
        <mesh position={dotPos} lookAt={new THREE.Vector3(0, 0, 0)}>
          <ringGeometry args={[ringScale * 0.8, ringScale, 32]} />
          <meshBasicMaterial
            color={accentColor}
            transparent
            opacity={ringOpacity * dotOpacity}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Outer glow ring */}
        <mesh position={dotPos} lookAt={new THREE.Vector3(0, 0, 0)}>
          <ringGeometry args={[ringScale * 1.5, ringScale * 1.8, 32]} />
          <meshBasicMaterial
            color={accentColor}
            transparent
            opacity={ringOpacity * 0.3 * dotOpacity}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Center dot */}
        <mesh position={dotPos}>
          <sphereGeometry args={[pulseScale, 16, 16]} />
          <meshBasicMaterial
            color={accentColor}
            transparent
            opacity={dotOpacity}
          />
        </mesh>

        {/* Bright core */}
        <mesh position={dotPos}>
          <sphereGeometry args={[pulseScale * 0.5, 12, 12]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={dotOpacity * 0.9}
          />
        </mesh>
      </group>
    </>
  );
};

/**
 * 3D Globe component rendered via @remotion/three's ThreeCanvas.
 * Procedural dark earth with wireframe grid, continent outlines,
 * atmosphere glow, and animated pulsing dot at tracker location.
 */
export const Globe3D: React.FC<Globe3DProps> = ({ center, accentColor }) => {
  return (
    <div
      style={{
        width: 400,
        height: 400,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Atmosphere glow behind the globe */}
      <div
        style={{
          position: 'absolute',
          inset: -20,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(52,152,219,0.15) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <ThreeCanvas
        width={400}
        height={400}
        style={{ width: 400, height: 400 }}
        camera={{ position: [0, 0, 5.5], fov: 45 }}
      >
        <GlobeScene center={center} accentColor={accentColor} />
      </ThreeCanvas>
    </div>
  );
};
