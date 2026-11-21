"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";

function Sphere({ active }: { active: boolean }) {
  const core = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (core.current) {
      core.current.rotation.y += dt * (active ? 0.55 : 0.18);
      core.current.rotation.x += dt * (active ? 0.25 : 0.06);
      const pulse = active
        ? 1 + Math.sin(state.clock.elapsedTime * 5.2) * 0.075
        : 1 + Math.sin(state.clock.elapsedTime * 1.4) * 0.025;
      core.current.scale.setScalar(pulse);
    }
    if (ringA.current) ringA.current.rotation.z += dt * (active ? 0.45 : 0.12);
    if (ringB.current) ringB.current.rotation.z -= dt * (active ? 0.35 : 0.09);
  });

  return (
    <Float speed={active ? 1.8 : 0.8} rotationIntensity={0.18} floatIntensity={0.22}>
      <mesh ref={core}>
        <icosahedronGeometry args={[1.0, 4]} />
        <MeshDistortMaterial
          color="#7C3AED"
          emissive="#1e1b4b"
          emissiveIntensity={active ? 0.75 : 0.42}
          roughness={0.22}
          metalness={0.38}
          distort={active ? 0.36 : 0.22}
          speed={active ? 2.4 : 1.1}
        />
      </mesh>
      <mesh ref={ringA} rotation={[0.45, 0.2, 0]} scale={1.36}>
        <torusGeometry args={[1, 0.006, 10, 128]} />
        <meshBasicMaterial color="#22D3EE" transparent opacity={active ? 0.65 : 0.38} />
      </mesh>
      <mesh ref={ringB} rotation={[1.25, -0.35, 0.4]} scale={1.54}>
        <torusGeometry args={[1, 0.004, 8, 96]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={active ? 0.5 : 0.28} />
      </mesh>
      <pointLight color="#22D3EE" intensity={active ? 14 : 9} distance={7} position={[2.2, 2.2, 3]} />
      <pointLight color="#7C3AED" intensity={active ? 10 : 5} distance={6} position={[-2.2, -1.6, 2]} />
    </Float>
  );
}

export default function OrbScene({ active = false }: { active?: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 4.1], fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      frameloop="always"
    >
      <ambientLight intensity={0.9} />
      <Sphere active={active} />
    </Canvas>
  );
}
