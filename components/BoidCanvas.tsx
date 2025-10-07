// components/BoidCanvas.tsx
"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function Agent({ color, pos }: { color: string; pos: [number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    // Smoothly move towards target pos
    const target = new THREE.Vector3(pos[0], pos[1], 0);
    ref.current.position.lerp(target, 0.08);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export default function BoidCanvas({
  positions,
  averageSimilarity,
}: {
  positions: Record<string, [number, number]>;
  averageSimilarity: number;
}) {
  // map [-1,1] proj into viewport-ish range
  const map = ([x, y]: [number, number]) => [THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)] as [number, number];

  return (
    <Canvas camera={{ position: [0, 0, 2] }}>
      <ambientLight />
      <Agent color="#60a5fa" pos={map(positions.A ?? [0.2, 0.1])} />
      <Agent color="#34d399" pos={map(positions.B ?? [-0.3, -0.1])} />
      <Agent color="#f59e0b" pos={map(positions.C ?? [0.1, -0.3])} />
      {/* Optional: render a faint line thickness based on averageSimilarity */}
    </Canvas>
  );
}
