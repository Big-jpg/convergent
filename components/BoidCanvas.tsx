'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { AGENTS } from '@/lib/agents';
import { SimilarityMatrix } from '@/lib/types';

interface BoidProps {
  agentId: string;
  color: string;
  position: [number, number, number];
  similarity: number;
  label: string;
}

function Boid({ agentId, color, position, similarity, label }: BoidProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetPosition = useRef(new THREE.Vector3(...position));
  const velocity = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Update target position based on similarity (agents converge as similarity increases)
    targetPosition.current.set(...position);

    // Smooth movement toward target
    const current = meshRef.current.position;
    const target = targetPosition.current;
    
    // Calculate desired velocity
    const desired = new THREE.Vector3()
      .subVectors(target, current)
      .multiplyScalar(0.05);

    // Apply steering force
    velocity.current.lerp(desired, 0.1);
    current.add(velocity.current);

    // Gentle floating animation
    meshRef.current.position.y += Math.sin(state.clock.elapsedTime * 2 + position[0]) * 0.001;
    
    // Slow rotation
    meshRef.current.rotation.y += delta * 0.5;
  });

  return (
    <group>
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      <Text
        position={[position[0], position[1] + 0.6, position[2]]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

function ConnectionLines({ positions, similarities }: { 
  positions: { [key: string]: [number, number, number] };
  similarities: SimilarityMatrix | null;
}) {
  const agentIds = Object.keys(positions);

  return (
    <>
      {agentIds.map((agentA, i) =>
        agentIds.slice(i + 1).map((agentB) => {
          const similarity = similarities?.[agentA]?.[agentB] || 0;
          const opacity = Math.max(0.1, similarity);
          const width = 0.01 + similarity * 0.05;

          const posA = positions[agentA];
          const posB = positions[agentB];

          const start = new THREE.Vector3(...posA);
          const end = new THREE.Vector3(...posB);
          const direction = new THREE.Vector3().subVectors(end, start);
          const length = direction.length();
          const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

          return (
            <group key={`${agentA}-${agentB}`}>
              <mesh position={midpoint}>
                <cylinderGeometry args={[width, width, length, 8]} />
                <meshBasicMaterial
                  color="#ffffff"
                  transparent
                  opacity={opacity}
                />
              </mesh>
            </group>
          );
        })
      )}
    </>
  );
}

interface BoidCanvasProps {
  similarities: SimilarityMatrix | null;
  consensusReached: boolean;
}

export default function BoidCanvas({ similarities, consensusReached }: BoidCanvasProps) {
  // Calculate positions based on similarity
  const positions: Record<string, [number, number, number]> = useMemo(() => {
    if (!similarities) {
      // Initial positions: triangle formation
      return {
        'agent-a': [2, 0, 0] as [number, number, number],
        'agent-b': [-1, 0, 1.7] as [number, number, number],
        'agent-c': [-1, 0, -1.7] as [number, number, number],
      };
    }

    // As similarity increases, agents move closer together
    const avgSim = Object.keys(similarities).reduce((sum, agentA) => {
      return sum + Object.keys(similarities[agentA])
        .filter(agentB => agentA !== agentB)
        .reduce((s, agentB) => s + similarities[agentA][agentB], 0);
    }, 0) / 6; // 3 agents, 3 pairs (bidirectional)

    // Scale factor: high similarity = closer together
    const scale = Math.max(0.3, 1 - avgSim * 0.7);

    return {
      'agent-a': [2 * scale, 0, 0] as [number, number, number],
      'agent-b': [-1 * scale, 0, 1.7 * scale] as [number, number, number],
      'agent-c': [-1 * scale, 0, -1.7 * scale] as [number, number, number],
    };
  }, [similarities]);

  const avgSimilarity = useMemo(() => {
    if (!similarities) return 0;
    const agentIds = Object.keys(similarities);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        sum += similarities[agentIds[i]][agentIds[j]];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }, [similarities]);

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-900 to-black">
      <Canvas camera={{ position: [0, 5, 8], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />

        {AGENTS.map((agent) => (
          <Boid
            key={agent.id}
            agentId={agent.id}
            color={agent.color}
            position={positions[agent.id]}
            similarity={avgSimilarity}
            label={agent.name.split(' ')[0] + ' ' + agent.name.split(' ')[1]}
          />
        ))}

        <ConnectionLines positions={positions} similarities={similarities} />

        {consensusReached && (
          <Text
            position={[0, 3, 0]}
            fontSize={0.5}
            color="#10b981"
            anchorX="center"
            anchorY="middle"
            fontWeight="bold"
          >
            CONSENSUS REACHED
          </Text>
        )}

        <OrbitControls
          enableZoom={true}
          enablePan={true}
          enableRotate={true}
          minDistance={3}
          maxDistance={15}
        />

        {/* Grid helper */}
        <gridHelper args={[20, 20, '#333333', '#1a1a1a']} />
      </Canvas>

      {/* Similarity indicator overlay */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-2 rounded-lg">
        <div className="text-sm font-semibold">Average Similarity</div>
        <div className="text-2xl font-bold">
          {(avgSimilarity * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
