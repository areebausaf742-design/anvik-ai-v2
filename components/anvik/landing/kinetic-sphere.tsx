"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

function MineralForm() {
  const core = useRef<THREE.Mesh>(null);
  const orbitOne = useRef<THREE.Mesh>(null);
  const orbitTwo = useRef<THREE.Mesh>(null);
  const progress = useRef(0);
  const reduceMotion = useRef(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => { reduceMotion.current = preference.matches; };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useFrame((state, delta) => {
    if (reduceMotion.current) return;
    const elapsed = state.clock.elapsedTime;
    const scrollProgress = Math.min(window.scrollY / Math.max(window.innerHeight * 2.4, 1), 1);
    progress.current = THREE.MathUtils.damp(progress.current, scrollProgress, 1.4, Math.min(delta, 0.05));

    if (core.current) {
      core.current.rotation.y = elapsed * 0.12 + progress.current * Math.PI * 2;
      core.current.rotation.x = Math.sin(elapsed * 0.17) * 0.12 + progress.current * 0.38;
      const breathing = 1 + Math.sin(elapsed * 0.72) * 0.018;
      core.current.scale.setScalar(breathing + progress.current * 0.06);
    }
    if (orbitOne.current) {
      orbitOne.current.rotation.z = elapsed * 0.08 - progress.current * Math.PI * 0.8;
      orbitOne.current.rotation.x = 0.78 + Math.sin(elapsed * 0.1) * 0.025;
    }
    if (orbitTwo.current) {
      orbitTwo.current.rotation.z = -elapsed * 0.055 + progress.current * Math.PI * 0.6;
      orbitTwo.current.rotation.x = 1.23;
    }
  });

  return (
    <Float speed={0.65} rotationIntensity={0.055} floatIntensity={0.12}>
      <mesh ref={core}>
        <icosahedronGeometry args={[1.02, 5]} />
        <MeshDistortMaterial
          color="#bbd981"
          emissive="#273522"
          emissiveIntensity={0.72}
          roughness={0.23}
          metalness={0.78}
          distort={0.2}
          speed={0.62}
        />
      </mesh>
      <mesh ref={orbitOne} scale={1.42}>
        <torusGeometry args={[1, 0.008, 8, 180]} />
        <meshStandardMaterial color="#e4a27a" emissive="#5b3428" emissiveIntensity={0.6} metalness={0.8} roughness={0.28} />
      </mesh>
      <mesh ref={orbitTwo} scale={1.6}>
        <torusGeometry args={[1, 0.004, 8, 180]} />
        <meshStandardMaterial color="#e7e4d8" emissive="#737064" emissiveIntensity={0.3} metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh rotation={[0.2, 0.4, 0]} scale={1.19}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial color="#e5ebd2" wireframe transparent opacity={0.12} />
      </mesh>
      <pointLight color="#d6e7ad" intensity={38} distance={5.2} position={[2.6, 1.5, 2.8]} />
      <pointLight color="#db8b65" intensity={16} distance={4.5} position={[-2, -1.5, 1.8]} />
    </Float>
  );
}

export function KineticSphere() {
  const [webglAvailable, setWebglAvailable] = useState(false);

  useEffect(() => {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    const available = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    setWebglAvailable(available);
  }, []);

  return (
    <div className="landing-orbit" aria-hidden="true">
      <div className="landing-orbit-grid" />
      <div className="landing-orbit-glow" />
      {webglAvailable ? (
        <Canvas
          dpr={[1, 1.35]}
          camera={{ position: [0, 0, 4.8], fov: 38 }}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          frameloop="always"
        >
          <ambientLight intensity={0.38} />
          <directionalLight color="#f1e9d5" intensity={2.1} position={[-3, 3, 4]} />
          <MineralForm />
        </Canvas>
      ) : (
        <div className="landing-orbit-fallback" />
      )}
      <span className="landing-orbit-label landing-orbit-label-top">A workspace in motion</span>
      <span className="landing-orbit-label landing-orbit-label-bottom">01 — 05 / ONE THOUGHT, MANY FORMS</span>
    </div>
  );
}
