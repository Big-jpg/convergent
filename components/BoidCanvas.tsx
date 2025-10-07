// components/BoidCanvas.tsx
'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

function Halo({ intensity, color }: { intensity: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const s = 1 + intensity * 0.8;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.25 * intensity} />
    </mesh>
  );
}

function SpeakingIcon({ intensity, color }: { intensity: number; color: string }) {
  const y = 0.08 + intensity * 0.02;
  return (
    <mesh position={[0, y, 0]}>
      <sphereGeometry args={[0.015, 8, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function Agent({
  color,
  pos,
  freshness,
}: {
  color: string;
  pos: [number, number];
  freshness: number; // 0..1 recency glow
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const target = new THREE.Vector3(pos[0], pos[1], 0);
    ref.current.position.lerp(target, 0.1);
  });

  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {freshness > 0.02 && (
        <group position={[pos[0], pos[1], 0]}>
          <Halo intensity={freshness} color={color} />
          <SpeakingIcon intensity={freshness} color={color} />
        </group>
      )}
    </group>
  );
}

export default function BoidCanvas({
  positions,
  colors,
  averageSimilarity,
  lastSpokeAt,
  talkRadius = 0.28,
}: {
  positions: Record<string, [number, number]>;
  colors: Record<string, string>;
  averageSimilarity: number;
  lastSpokeAt: Record<string, number>; // ms timestamps
  talkRadius?: number;
}) {
  const map = ([x, y]: [number, number]) =>
    [THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)] as [number, number];

  // Build proximity line segments
  const verts = useMemo(() => {
    const ids = Object.keys(positions);
    const arr: number[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions[ids[i]];
        const b = positions[ids[j]];
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const d = Math.hypot(dx, dy);
        if (d <= talkRadius) {
          arr.push(a[0], a[1], 0, b[0], b[1], 0);
        }
      }
    }
    return new Float32Array(arr);
  }, [positions, talkRadius]);

  const now = Date.now();
  const freshness = (id: string) => {
    const t = lastSpokeAt[id] ?? 0;
    const age = (now - t) / 1500; // fades over ~1.5s
    return Math.max(0, 1 - age);
  };

  return (
    <Canvas camera={{ position: [0, 0, 2.2] }}>
      <ambientLight />
      <pointLight position={[2, 2, 3]} intensity={1.2} />

      {/* proximity links */}
      {verts.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            {/* Preferred typing across r3f versions */}
            <bufferAttribute attach="attributes-position" args={[verts, 3]} />
            {/*
            // If your TS/r3f combo prefers explicit props, swap to:
            <bufferAttribute
              attach="attributes-position"
              array={verts}
              itemSize={3}
              count={verts.length / 3}
            />
            */}
          </bufferGeometry>
          <lineBasicMaterial color="#94a3b8" transparent opacity={0.28 + 0.2 * averageSimilarity} />
        </lineSegments>
      )}

      {/* agents */}
      {Object.entries(positions).map(([id, p]) => (
        <Agent key={id} color={colors[id] ?? '#94a3b8'} pos={map(p)} freshness={freshness(id)} />
      ))}
    </Canvas>
  );
}
