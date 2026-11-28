"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uScroll;

  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;
    vPosition = position;
    vec3 transformed = position;
    float wave = sin(position.y * 3.6 + uTime * 0.45) * 0.035;
    wave += sin(position.x * 4.4 - uTime * 0.32) * 0.025;
    transformed += normal * (wave + uScroll * 0.05);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float uTime;
  uniform float uScroll;
  uniform vec2 uPointer;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 cobalt = vec3(0.357, 0.486, 1.0);
    vec3 ink = vec3(0.012, 0.016, 0.03);
    vec3 offWhite = vec3(0.88, 0.91, 0.98);
    float edge = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 2.3);
    float grain = noise(vUv * 8.0 + uTime * 0.08);
    float pulse = 0.5 + 0.5 * sin(uTime * 0.7 + uScroll * 4.0);
    float pointerGlow = 1.0 - smoothstep(0.05, 0.75, distance(vUv, 0.5 + uPointer * 0.16));
    float glow = clamp(edge * 0.7 + grain * 0.18 + pointerGlow * 0.24 + pulse * 0.08, 0.0, 1.0);
    vec3 color = mix(ink, cobalt, glow * 0.82);
    color += offWhite * pow(glow, 5.0) * 0.14;
    gl_FragColor = vec4(color, 0.97);
  }
`;

function ShaderCore() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const { invalidate, pointer } = useThree();
  const reduceMotion = useRef(false);
  const scroll = useRef(0);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uPointer: { value: new THREE.Vector2() },
  }), []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => { reduceMotion.current = preference.matches; };
    const onScroll = () => {
      scroll.current = Math.min(window.scrollY / Math.max(window.innerHeight * 2, 1), 1);
      invalidate();
    };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      preference.removeEventListener("change", updatePreference);
      window.removeEventListener("scroll", onScroll);
    };
  }, [invalidate]);

  useFrame((state) => {
    if (!material.current) return;
    const elapsed = reduceMotion.current ? 0 : state.clock.elapsedTime;
    material.current.uniforms.uTime.value = elapsed;
    material.current.uniforms.uScroll.value = scroll.current;
    material.current.uniforms.uPointer.value.lerp(new THREE.Vector2(pointer.x, pointer.y), 0.08);
    invalidate();
  });

  return (
    <mesh rotation={[0.12, -0.18, 0]} scale={1.14}>
      <icosahedronGeometry args={[1, 5]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent />
    </mesh>
  );
}

function HeroScene() {
  return (
    <>
      <ambientLight intensity={0.22} />
      <directionalLight color="#5B7CFF" intensity={2.8} position={[2.5, 2.8, 4]} />
      <pointLight color="#5B7CFF" intensity={16} distance={4.8} position={[-2.4, -1, 2.5]} />
      <ShaderCore />
    </>
  );
}

export function KineticSphere() {
  const [webglAvailable, setWebglAvailable] = useState(false);
  const [dpr, setDpr] = useState(1.5);

  useEffect(() => {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    const available = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    setWebglAvailable(available);
  }, []);

  return (
    <div className="landing-orbit" aria-label="ANVIK intelligence visual">
      <div className="landing-orbit-grid" aria-hidden="true" />
      <div className="landing-orbit-glow" aria-hidden="true" />
      {webglAvailable ? (
        <Canvas
          dpr={dpr}
          camera={{ position: [0, 0, 4.6], fov: 38 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          frameloop="demand"
          performance={{ min: 0.55, max: 1, debounce: 180 }}
        >
          <PerformanceMonitor onIncline={() => setDpr(2)} onDecline={() => setDpr(1)} />
          <HeroScene />
        </Canvas>
      ) : (
        <div className="landing-orbit-fallback" aria-hidden="true" />
      )}
      <span className="landing-orbit-label landing-orbit-label-top">ANVIK / LIVE INTELLIGENCE</span>
      <span className="landing-orbit-label landing-orbit-label-bottom">01 — 05 / ONE THOUGHT, MANY FORMS</span>
    </div>
  );
}
