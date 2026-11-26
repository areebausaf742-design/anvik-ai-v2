"use client"

import * as React from "react"

export interface ChatbarLightProps {
  /** Current input length (live content). */
  contentLength: number
  /** Maximum expected input length, for normalisation. */
  maxLength?: number
  /** Whether the composer is focused. */
  active?: boolean
  /** Whether a response is currently streaming. */
  streaming?: boolean
  className?: string
}

const MAX_PIXELS = 2560 * 1600

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uPulse;
uniform float uStream;
uniform float uFocus;

float lineDist(vec2 p, vec2 a, vec2 d) {
  return abs(cross(d, p - a));
}

float ribbon(vec2 p, vec2 a, vec2 d, float width, float spec) {
  float d = lineDist(p, a, d);
  float half = width * 0.5;
  float fill = smoothstep(half, half - 3.0, d);
  float specEdge = 1.0 - smoothstep(half - spec, half + spec, d);
  return max(fill, specEdge * 0.6);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 q = fc - 0.5 * uRes;

  vec3 col = vec3(0.0);

  float angle = -0.42;
  float c = cos(angle), s = sin(angle);
  vec2 rp = vec2(c * q.x - s * q.y, s * q.x + c * q.y);

  float baseSpacing = 150.0;
  float widthBase = 90.0;
  float specWidth = 2.0 + uEnergy * 1.5;

  float sway = sin(uTime * 0.8 + 1.0) * 12.0;

  for (int i = 0; i < 7; i++) {
    float idx = float(i);
    float curve = sin(rp.x * 0.0018 + uTime * 0.6 + idx * 1.3) * (28.0 + uEnergy * 16.0);
    float centerY = -idx * baseSpacing + sway + curve;

    vec2 a = vec2(-uRes.x * 0.6, centerY);
    vec2 d = vec2(1.0, 0.0);

    float width = widthBase + sin(uTime * 0.4 + idx) * 8.0;
    float r = ribbon(rp, a, d, width, specWidth);

    if (r > 0.001) {
      vec3 chrome = vec3(0.08, 0.10, 0.14);
      float edgeDist = lineDist(rp, a, d);
      float half = width * 0.5;
      float rel = (edgeDist - half) / 3.0;
      float blueSheen = clamp(-rel * 1.5, 0.0, 1.0);
      float amberSheen = clamp(rel * 1.5, 0.0, 1.0);

      vec3 ribbonCol = chrome;
      ribbonCol = mix(ribbonCol, vec3(0.18, 0.42, 0.95), blueSheen * 0.85 * r);
      ribbonCol = mix(ribbonCol, vec3(1.00, 0.62, 0.28), amberSheen * 0.75 * r);
      float specEdge = 1.0 - smoothstep(half - specWidth, half + specWidth, edgeDist);
      ribbonCol = mix(ribbonCol, vec3(1.0, 0.92, 0.85), specEdge * (0.7 + uFocus * 0.3));

      ribbonCol *= (0.55 + uEnergy * 0.7 + uPulse * 0.4 + uStream * 0.3);

      float depth = 1.0 - idx * 0.11;
      col += ribbonCol * r * depth;
    }
  }

  float bloom = 0.0;
  for (int i = 0; i < 5; i++) {
    float idx = float(i);
    float centerY = -idx * baseSpacing + sway + sin(rp.x * 0.0018 + uTime * 0.6 + idx * 1.3) * 28.0;
    float d = abs(rp.y - centerY);
    bloom += exp(-d * d / (140.0 * 140.0)) * 0.12;
  }
  col += vec3(0.03, 0.04, 0.06) * bloom * (0.4 + uEnergy * 0.4);

  float vignette = 1.0 - clamp(length(q) / (0.55 * uRes.x), 0.0, 1.0);
  col *= vignette * vignette;

  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s))
  return s
}

function springStep(s: { x: number; v: number }, target: number, dt: number, omega: number) {
  const f = 1 + 2 * dt * omega
  const oo = omega * omega
  const det = 1 / (f + dt * dt * oo)
  const x = (f * s.x + dt * s.v + dt * dt * oo * target) * det
  s.v = (s.v + dt * oo * (target - s.x)) * det
  s.x = x
}

export function ChatbarLight({
  contentLength,
  maxLength = 800,
  active = false,
  streaming = false,
  className,
}: ChatbarLightProps) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [fallback, setFallback] = React.useState(false)

  const energyTarget = React.useRef(0)
  const pulseTarget = React.useRef(0)
  const lastContent = React.useRef(contentLength)
  const energy = React.useRef({ x: 0, v: 0 })
  const pulse = React.useRef({ x: 0, v: 0 })
  const focus = React.useRef({ x: 0, v: 0 })
  const stream = React.useRef({ x: 0, v: 0 })
  const kick = React.useRef<() => void>(() => {})

  React.useEffect(() => {
    const prev = lastContent.current
    lastContent.current = contentLength
    if (contentLength !== prev && contentLength > 0) pulseTarget.current = 1
    const norm = Math.min(1, contentLength / Math.max(maxLength, 1))
    energyTarget.current = Math.min(1, 0.12 + norm * 0.88)
  }, [contentLength, maxLength])

  React.useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false })
    if (!gl) { setFallback(true); return }

    const prog = gl.createProgram()!
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFallback(true); return }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, "aPos")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = (n: string) => gl.getUniformLocation(prog, n)
    const uRes = u("uRes"), uTime = u("uTime"), uEnergy = u("uEnergy")
    const uPulse = u("uPulse"), uStream = u("uStream"), uFocus = u("uFocus")

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    let cw = 0, ch = 0, bw = 0, bh = 0
    const resize = () => {
      const r = host.getBoundingClientRect()
      bw = Math.max(1, r.width)
      bh = Math.max(1, r.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / Math.max(bw * bh, 1)))
      cw = Math.max(1, Math.round(bw * dpr))
      ch = Math.max(1, Math.round(bh * dpr))
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch }
      gl.viewport(0, 0, cw, ch)
      kick.current()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    let raf = 0
    let visible = true
    let last = -1
    let clock = 0
    const start = performance.now()
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const moving = !reduce
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible && !raf) raf = requestAnimationFrame(frame)
    })
    io.observe(canvas)

    function frame(now: number) {
      raf = 0
      const dt = last < 0 ? 0 : Math.min(Math.max(now - last, 0) / 1000, 1 / 20)
      last = now
      if (moving) clock = (now - start) / 1000

      springStep(energy.current, energyTarget.current, dt, 3.5)
      springStep(pulse.current, pulseTarget.current, dt, 5.0)
      springStep(focus.current, active ? 1 : 0, dt, 6.0)
      springStep(stream.current, streaming ? 1 : 0, dt, 3.0)
      pulseTarget.current *= Math.exp(-dt * 2.5)
      if (pulseTarget.current < 1e-3) pulseTarget.current = 0

      gl!.uniform2f(uRes, cw, ch)
      gl!.uniform1f(uTime, clock)
      gl!.uniform1f(uEnergy, energy.current.x)
      gl!.uniform1f(uPulse, pulse.current.x)
      gl!.uniform1f(uStream, stream.current.x)
      gl!.uniform1f(uFocus, focus.current.x)
      gl!.clearColor(0, 0, 0, 1)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)

      const settled = Math.abs(energy.current.v) + Math.abs(pulse.current.v) + Math.abs(focus.current.v) + Math.abs(stream.current.v) + Math.abs(pulse.current.x - pulseTarget.current) < 1e-3
      if (visible && (moving || !settled)) raf = requestAnimationFrame(frame)
    }
    kick.current = () => { if (visible && !raf) raf = requestAnimationFrame(frame) }
    raf = requestAnimationFrame(frame)

    const lost = (e: Event) => { e.preventDefault(); setFallback(true) }
    canvas.addEventListener("webglcontextlost", lost)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      kick.current = () => {}
      canvas.removeEventListener("webglcontextlost", lost)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [active, streaming])

  return (
    <div ref={hostRef} className={`chatbar-light-host ${className ?? ""}`} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "#000" }}>
      {fallback ? (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #0a0a0a 0%, #000 100%)" }} />
      ) : (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
        />
      )}
    </div>
  )
}

export default ChatbarLight
