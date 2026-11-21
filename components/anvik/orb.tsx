"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

const Scene = dynamic(() => import("./orb-scene"), {
  ssr: false,
  loading: () => null,
});

function OrbFallback({ active = false }: { active?: boolean }) {
  return (
    <div className={`orb-fallback${active ? " orb-active" : ""}`} aria-hidden="true">
      <span className="fallback-ring" />
      <span className="fallback-ring fallback-ring-b" />
      <span className="fallback-core" />
    </div>
  );
}

class OrbBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function detectSoftwareGl(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(renderer);
  } catch {
    return true;
  }
}

export default function Orb({
  size = "large",
  active = false,
}: {
  size?: "large" | "small" | "mini";
  active?: boolean;
}) {
  const [mount, setMount] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [softwareGl, setSoftwareGl] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    setSoftwareGl(detectSoftwareGl());
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced || size === "mini" || softwareGl) return;
    const node = host.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMount(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, size, softwareGl]);

  const useWebgl = mount && !reduced && !softwareGl && size !== "mini";

  return (
    <div
      ref={host}
      className={`orb-wrap orb-${size}${active ? " orb-active" : ""}`}
      role="img"
      aria-label="ANVIK animated AI core orb"
      data-active={active ? "true" : "false"}
    >
      <OrbFallback active={active} />
      {useWebgl && (
        <OrbBoundary fallback={null}>
          <div className="orb-canvas">
            <Scene active={active} />
          </div>
        </OrbBoundary>
      )}
    </div>
  );
}
