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
const VERT = `attribute vec2 aPos; void main(){gl_Position=vec4(aPos,0.0,1.0);}`
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uHost;
uniform float uBleed;
uniform float uRadius;
uniform float uTime;
uniform float uEnergy;
uniform float uPulse;
uniform float uStream;
uniform float uFocus;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  // canvas covers host + bleed on every side
  vec2 q = (frag - uBleed) - 0.5 * uHost;
  vec2 b = 0.5 * uHost;
  float r = max(uRadius, 2.0);
  float sd = sdRoundBox(q, b, r);

  // razor-thin specular core along the edge
  float core = 1.0 - smoothstep(0.0, 1.0 + uEnergy * 0.6, abs(sd));
  // soft outer bloom bleeding past the edge
  float glow = exp(-max(sd, 0.0) / (6.0 + uEnergy * 10.0));
  // inner ambient lift
  float inner = exp(-max(-sd, 0.0) / (10.0 + (1.0 - uEnergy) * 8.0));

  // ribbons travel around the ring with time + energy
  float spin = atan(q.y, q.x);
  float ribbonA = 0.5 + 0.5 * sin(spin * 4.0 - uTime * (0.9 + uEnergy * 1.6) + sd * 0.05);
  float ribbonB = 0.5 + 0.5 * sin(spin * 7.0 + uTime * (0.6 + uStream * 1.2) - sd * 0.08);

  vec3 chrome = vec3(0.82, 0.88, 0.98);
  vec3 blue = vec3(0.31, 0.61, 1.00);
  vec3 amber = vec3(1.00, 0.66, 0.33);
  vec3 warmWhite = vec3(1.00, 0.95, 0.86);

  vec3 col = chrome;
  col = mix(col, blue, ribbonA * (0.35 + uStream * 0.45));
  col = mix(col, amber, ribbonB * (0.28 + uPulse * 0.55 + uStream * 0.25));
  col = mix(col, warmWhite, core * (0.55 + uFocus * 0.25));

  float mask = clamp(core * 1.6 + glow * 0.85, 0.0, 1.0);
  float alpha = clamp(mask * (0.55 + uEnergy * 0.45 + uFocus * 0.15), 0.0, 1.0);
  // deep glossy lift inside
  col += vec3(0.04, 0.05, 0.07) * inner * 0.25;

  gl_FragColor = vec4(col * alpha, alpha);
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

  // detect content changes -> pulse
  React.useEffect(() => {
    const prev = lastContent.current
    lastContent.current = contentLength
    if (contentLength !== prev) pulseTarget.current = 1
    const norm = Math.min(1, contentLength / Math.max(maxLength, 1))
    energyTarget.current = Math.min(1, 0.15 + norm * 0.85)
  }, [contentLength, maxLength])

  React.useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true })
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
    const uRes = u("uRes"), uHost = u("uHost"), uBleed = u("uBleed"), uRadius = u("uRadius")
    const uTime = u("uTime"), uEnergy = u("uEnergy"), uPulse = u("uPulse"), uStream = u("uStream"), uFocus = u("uFocus")

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const readRadius = () => {
      const r = parseFloat(getComputedStyle(host).borderRadius) || 22
      return r
    }

    let cw = 0, ch = 0, bh = 0, bw = 0, bleed = 18
    const resize = () => {
      const r = host.getBoundingClientRect()
      bw = Math.max(1, r.width)
      bh = Math.max(1, r.height)
      bleed = Math.max(12, Math.min(26, Math.round(Math.min(bw, bh) * 0.08)))
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / Math.max((bw + 2 * bleed) * (bh + 2 * bleed), 1)))
      cw = Math.max(1, Math.round((bw + 2 * bleed) * dpr))
      ch = Math.max(1, Math.round((bh + 2 * bleed) * dpr))
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
      springStep(pulse.current, pulseTarget.current, dt, 4.5)
      springStep(focus.current, active ? 1 : 0, dt, 5)
      springStep(stream.current, streaming ? 1 : 0, dt, 3)
      // decay pulse target
      pulseTarget.current *= Math.exp(-dt * 2.2)
      if (pulseTarget.current < 1e-3) pulseTarget.current = 0

      const dpr = cw / (bw + 2 * bleed)
      gl!.uniform2f(uRes, cw, ch)
      gl!.uniform2f(uHost, bw * dpr, bh * dpr)
      gl!.uniform1f(uBleed, bleed * dpr)
      gl!.uniform1f(uRadius, readRadius() * dpr)
      gl!.uniform1f(uTime, clock)
      gl!.uniform1f(uEnergy, energy.current.x)
      gl!.uniform1f(uPulse, pulse.current.x)
      gl!.uniform1f(uStream, stream.current.x)
      gl!.uniform1f(uFocus, focus.current.x)
      gl!.clearColor(0, 0, 0, 0)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, streaming])

  return (
    <div ref={hostRef} className={`chatbar-light-host ${className ?? ""}`} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      {fallback ? null : (
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