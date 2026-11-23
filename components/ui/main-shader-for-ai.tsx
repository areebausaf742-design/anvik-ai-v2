"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";

const vertexShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  void main() {
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform float uStrength;
  varying vec3 vPosition;
  varying vec3 vNormal;

  vec3 ringPalette(float phase) {
    vec3 ice = vec3(0.91, 0.97, 1.0);
    vec3 blue = vec3(0.20, 0.51, 0.98);
    vec3 periwinkle = vec3(0.42, 0.49, 1.0);
    vec3 violet = vec3(0.63, 0.27, 0.98);
    if (phase < 0.25) return mix(ice, blue, smoothstep(0.0, 0.25, phase));
    if (phase < 0.52) return mix(blue, periwinkle, smoothstep(0.25, 0.52, phase));
    if (phase < 0.79) return mix(periwinkle, violet, smoothstep(0.52, 0.79, phase));
    return mix(violet, ice, smoothstep(0.79, 1.0, phase));
  }

  void main() {
    float angle = atan(vPosition.y, vPosition.x);
    float phase = mod(angle + 1.57079632679 + uTime * 0.014, 6.28318530718) / 6.28318530718;
    vec3 color = ringPalette(phase);
    float lowerArc = smoothstep(0.02, 0.92, -sin(angle));
    color = mix(color, vec3(0.96, 0.985, 1.0), lowerArc * 0.68);
    float facing = 0.72 + 0.28 * max(0.0, dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
    float breathe = 0.95 + 0.05 * sin(uTime * 1.1);
    gl_FragColor = vec4(color * facing * breathe * uStrength, 1.0);
  }
`;

function RingMesh({ pointer }: { pointer: MutableRefObject<{ x: number; y: number }> }) {
  const group = useRef<THREE.Group>(null);
  const coreMaterial = useRef<THREE.ShaderMaterial>(null);
  const glowMaterial = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uStrength: { value: 1 },
  }), []);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    if (coreMaterial.current) coreMaterial.current.uniforms.uTime.value = elapsed;
    if (glowMaterial.current) glowMaterial.current.uniforms.uTime.value = elapsed;
    if (group.current) {
      const dt = Math.min(delta, 0.05);
      group.current.rotation.z += dt * 0.035;
      group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, 0.055 + pointer.current.y * 0.12, 4, dt);
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, pointer.current.x * 0.16, 4, dt);
      const pulse = 1 + Math.sin(elapsed * 0.8) * 0.009;
      group.current.scale.setScalar(pulse);
    }
  });

  const sharedShader = {
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms,
    blending: THREE.AdditiveBlending,
  };

  return (
    <group ref={group} rotation={[0.055, 0, -0.06]}>
      <mesh>
        <torusGeometry args={[1.02, 0.10, 24, 256]} />
        <shaderMaterial ref={glowMaterial} {...sharedShader} uniforms={{ ...uniforms, uStrength: { value: 0.12 } }} />
      </mesh>
      <mesh>
        <torusGeometry args={[1.02, 0.038, 20, 256]} />
        <shaderMaterial ref={coreMaterial} {...sharedShader} uniforms={{ ...uniforms, uStrength: { value: 0.29 } }} />
      </mesh>
      <mesh>
        <torusGeometry args={[1.02, 0.012, 16, 256]} />
        <meshBasicMaterial color="#dbeaff" transparent opacity={0.52} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function ShaderBackground({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let pageVisible = document.visibilityState === "visible";
    let inView = true;
    let darkTheme = document.documentElement.dataset.theme !== "light";

    const updateMode = () => {
      const active = pageVisible && inView && darkTheme && !reduced.matches;
      setAnimate(active);
    };
    const onVisibility = () => {
      pageVisible = document.visibilityState === "visible";
      updateMode();
    };
    const onMotion = () => updateMode();
    const onPointer = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      pointer.current.x = inside ? ((event.clientX - bounds.left) / bounds.width) * 2 - 1 : 0;
      pointer.current.y = inside ? -(((event.clientY - bounds.top) / bounds.height) * 2 - 1) : 0;
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      updateMode();
    }, { threshold: 0 });
    const themeObserver = new MutationObserver(() => {
      darkTheme = document.documentElement.dataset.theme !== "light";
      updateMode();
    });

    observer.observe(host);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onMotion);
    window.addEventListener("pointermove", onPointer, { passive: true });
    updateMode();

    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotion);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div ref={hostRef} aria-hidden="true" className={"main-shader-background " + className}>
      <Canvas
        frameloop={animate ? "always" : "demand"}
        dpr={[1, 1.25]}
        camera={{ position: [0, 0, 4.6], fov: 38, near: 0.1, far: 30 }}
        gl={{ alpha: true, antialias: false, depth: true, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.domElement.setAttribute("aria-hidden", "true");
          if (hostRef.current) hostRef.current.dataset.webgl = "ready";
          gl.domElement.addEventListener("webglcontextlost", () => {
            if (hostRef.current) hostRef.current.dataset.webgl = "lost";
          }, { once: true });
        }}
      >
        <RingMesh pointer={pointer} />
      </Canvas>
    </div>
  );
}

export default ShaderBackground;
