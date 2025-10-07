// components/BoidCanvas.tsx
'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

// --- helpers ---
function lerp01(a: number, b: number, t: number) { return a + (b - a) * Math.min(1, Math.max(0, t)); }
function glowIntensity(last?: number, now = Date.now(), halfLife = 3200) { // was 900
  if (!last) return 0;
  const dt = Math.max(0, now - last);
  const k = Math.log(2) / halfLife;
  return Math.exp(-k * dt);
}

function Agent({
  color, pos, speakAt, label, bubbleHalfLifeMs = 3200,   // NEW prop with default
}: {
  color: string;
  pos: [number, number];
  speakAt?: number;
  label?: string;
  bubbleHalfLifeMs?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!ref.current) return;
    const target = new THREE.Vector3(pos[0], pos[1], 0);
    ref.current.position.lerp(target, 0.22); // slightly snappier
    const gi = glowIntensity(speakAt, Date.now(), bubbleHalfLifeMs);
    const s = lerp01(1, 1.25, gi);          // subtler size pulse
    ref.current.scale.set(s, s, s);
    const mat = ref.current.material as THREE.MeshStandardMaterial;
    if (mat) {
      mat.emissive = new THREE.Color(color);
      mat.emissiveIntensity = 0.45 * gi;    // softer glow
    }
  });

  const gi = glowIntensity(speakAt, Date.now(), bubbleHalfLifeMs);

  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[0.032, 16, 16]} /> {/* a touch smaller */}
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Chat bubble: smaller font, narrower width, lingers longer */}
      {gi > 0.12 && !!label && (
        <Html transform distanceFactor={3.6} position={[pos[0], pos[1] + 0.085, 0]}>
          <div
            style={{
              background: 'rgba(17,24,39,0.92)',
              color: 'white',
              border: '1px solid rgba(148,163,184,0.35)',
              borderRadius: 8,
              padding: '4px 6px',          // smaller padding
              maxWidth: 160,               // narrower
              fontSize: 11,                // smaller type
              lineHeight: 1.25,
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              opacity: gi,
              transform: `scale(${0.92 + gi * 0.12})`,
              pointerEvents: 'none',
              whiteSpace: 'pre-wrap',
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function ProximityLinks({
  positions,
  talkRadius,
}: {
  positions: Record<string, [number, number]>;
  talkRadius: number;
}) {
  const lines = useMemo(() => {
    const entries = Object.entries(positions);
    const segs: { a: [number, number]; b: [number, number]; d: number }[] = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [, A] = entries[i];
        const [, B] = entries[j];
        const d = Math.hypot(A[0] - B[0], A[1] - B[1]);
        if (d <= talkRadius) segs.push({ a: A, b: B, d });
      }
    }
    return segs;
  }, [positions, talkRadius]);

  return (
    <>
      {lines.map((seg, idx) => (
        <line key={idx}>
          <bufferGeometry>
            {/* IMPORTANT: use args to construct BufferAttribute */}
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([seg.a[0], seg.a[1], 0, seg.b[0], seg.b[1], 0]), 3]}
            />
          </bufferGeometry>
          {/* opacity strengthens as agents get closer */}
          <lineBasicMaterial transparent opacity={1 - seg.d / talkRadius} />
        </line>
      ))}
    </>
  );
}


export default function BoidCanvas({
  positions, colors, averageSimilarity, speakingTimes, talkRadius = 0.28, bubbles = {},
  bubbleHalfLifeMs = 3200,            // NEW
}: {
  positions: Record<string, [number, number]>;
  colors: Record<string, string>;
  averageSimilarity: number;
  speakingTimes?: Record<string, number>;
  talkRadius?: number;
  bubbles?: Record<string, string>;
  bubbleHalfLifeMs?: number;          // NEW
}) {
  const clamp2 = ([x, y]: [number, number]) => [THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)] as [number, number];

  return (
    <Canvas
      camera={{ position: [0, 0, 2.2] }}
      onCreated={({ gl }) => { gl.setPixelRatio(Math.min(window.devicePixelRatio, 2)); }}
    >
      <ambientLight />
      <pointLight position={[2, 2, 3]} intensity={1.2} />

      <ProximityLinks positions={positions} talkRadius={talkRadius} />

      {Object.entries(positions).map(([id, p]) => (
        <Agent
          key={id}
          color={colors[id] ?? '#94a3b8'}
          pos={clamp2(p)}
          speakAt={speakingTimes?.[id]}
          label={bubbles[id]}
          bubbleHalfLifeMs={bubbleHalfLifeMs}   // <-- NEW
        />

      ))}
    </Canvas>
  );
}
