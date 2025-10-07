// components/BoidCanvas.tsx
'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

function Agent({ color, pos }: { color: string; pos: [number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const target = new THREE.Vector3(pos[0], pos[1], 0);
    ref.current.position.lerp(target, 0.1);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.035, 16, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export default function BoidCanvas({
  positions,
  colors,
  averageSimilarity,
}: {
  positions: Record<string, [number, number]>;
  colors: Record<string, string>;
  averageSimilarity: number;
}) {
  const map = ([x, y]: [number, number]) =>
    [THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)] as [number, number];

  return (
    <Canvas camera={{ position: [0, 0, 2.2] }}>
      <ambientLight />
      <pointLight position={[2, 2, 3]} intensity={1.2} />
      {Object.entries(positions).map(([id, p]) => (
        <Agent key={id} color={colors[id] ?? '#94a3b8'} pos={map(p)} />
      ))}
      {/* You can later render edges with line opacity = f(averageSimilarity) */}
    </Canvas>
  );
}
