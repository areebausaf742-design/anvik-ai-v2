"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface ElectricWavesShaderProps {
  waveCount?: number;
  amplitude?: number;
  frequency?: number;
  brightness?: number;
  colorSeparation?: number;
  className?: string;
}

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_waveCount;
  uniform float u_amplitude;
  uniform float u_frequency;
  uniform float u_brightness;
  uniform float u_colorSeparation;

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
    float intensity = 0.0;
    vec3 color = vec3(0.0);

    for (int index = 0; index < 8; index++) {
      float layer = float(index);
      if (layer >= u_waveCount) continue;

      float phase = layer * u_colorSeparation;
      float center = (layer - (u_waveCount - 1.0) * 0.5) * 0.12
        + sin(uv.x * u_frequency + u_time * (0.16 + layer * 0.025) + phase) * u_amplitude
        + sin(uv.x * u_frequency * 0.42 - u_time * 0.11 + phase) * u_amplitude * 0.32;
      float distanceToWave = abs(uv.y - center);
      float line = exp(-distanceToWave * 78.0);
      float halo = exp(-distanceToWave * 15.0) * 0.12;
      vec3 tint = mix(vec3(0.74, 0.86, 0.55), vec3(0.83, 0.60, 0.43), layer / max(u_waveCount - 1.0, 1.0));

      color += tint * (line + halo);
      intensity += line + halo;
    }

    float edgeFade = 1.0 - smoothstep(0.45, 1.05, abs(uv.x));
    float alpha = min(intensity * u_brightness, 0.72) * edgeFade;
    gl_FragColor = vec4(color * u_brightness * edgeFade, alpha);
  }
`;

const defaultProps = {
  waveCount: 5,
  amplitude: 0.105,
  frequency: 2.2,
  brightness: 0.44,
  colorSeparation: 0.16,
};

export function ElectricWavesShader({
  waveCount = defaultProps.waveCount,
  amplitude = defaultProps.amplitude,
  frequency = defaultProps.frequency,
  brightness = defaultProps.brightness,
  colorSeparation = defaultProps.colorSeparation,
  className = "",
}: ElectricWavesShaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const uniformsRef = useRef({ waveCount, amplitude, frequency, brightness, colorSeparation });

  useEffect(() => {
    uniformsRef.current = { waveCount, amplitude, frequency, brightness, colorSeparation };
    const uniforms = materialRef.current?.uniforms;
    if (!uniforms) return;

    uniforms.u_waveCount.value = waveCount;
    uniforms.u_amplitude.value = amplitude;
    uniforms.u_frequency.value = frequency;
    uniforms.u_brightness.value = brightness;
    uniforms.u_colorSeparation.value = colorSeparation;
  }, [waveCount, amplitude, frequency, brightness, colorSeparation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "low-power",
      });

      if (!context) {
        container.dataset.webgl = "unavailable";
        return;
      }

      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas,
        context,
        powerPreference: "low-power",
      });
    } catch {
      container.dataset.webgl = "unavailable";
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(renderer.domElement);
    container.dataset.webgl = "ready";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2() },
      u_waveCount: { value: uniformsRef.current.waveCount },
      u_amplitude: { value: uniformsRef.current.amplitude },
      u_frequency: { value: uniformsRef.current.frequency },
      u_brightness: { value: uniformsRef.current.brightness },
      u_colorSeparation: { value: uniformsRef.current.colorSeparation },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    materialRef.current = material;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clock = new THREE.Clock();
    let inView = false;
    let visible = document.visibilityState === "visible";
    let frameRateLimit = 0;

    const render = () => {
      uniforms.u_time.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    };
    const syncAnimation = () => {
      if (inView && visible && !reducedMotion.matches) {
        renderer.setAnimationLoop((time) => {
          if (time - frameRateLimit < 33) return;
          frameRateLimit = time;
          render();
        });
      } else {
        renderer.setAnimationLoop(null);
        render();
      }
    };
    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      uniforms.u_resolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
      render();
    });
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncAnimation();
    });
    intersectionObserver.observe(container);

    const onVisibilityChange = () => {
      visible = document.visibilityState === "visible";
      syncAnimation();
    };
    const onMotionChange = () => syncAnimation();
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.addEventListener("change", onMotionChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotion.removeEventListener("change", onMotionChange);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      renderer.setAnimationLoop(null);
      materialRef.current = null;
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`electric-waves ${className}`.trim()}
      data-webgl="pending"
    />
  );
}

export default ElectricWavesShader;
