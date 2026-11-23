 "use client";
import { useEffect, useRef } from "react";

const VERTEX_SHADER = [
  "attribute vec2 a_position;",
  "void main() { gl_Position = vec4(a_position, 0.0, 1.0); }",
].join("\\n");

const FRAGMENT_SHADER = [
"#ifdef GL_FRAGMENT_PRECISION_HIGH",
"precision highp float;",
"#else",
"precision mediump float;",
"#endif",
"uniform vec2 u_resolution;",
"uniform float u_time;",
"float hash21(vec2 p) { p = fract(p * vec2(234.34,435.345)); p += dot(p,p+34.23); return fract(p.x*p.y); }",
"float noise(vec2 p) { vec2 i=floor(p), f=fract(p), u=f*f*(3.0-2.0*f); return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),u.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),u.x),u.y); }",
"float fbm(vec2 p) { float v=0.0,a=0.5; for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(17.0,9.2);a*=0.5;} return v; }",
"vec3 palette(float x) { vec3 f=vec3(0.020,0.055,0.035),l=vec3(0.075,0.245,0.105),g=vec3(0.610,0.820,0.245),c=vec3(0.985,0.970,0.855); if(x<0.36)return mix(f,l,smoothstep(0.0,0.36,x)); if(x<0.76)return mix(l,g,smoothstep(0.36,0.76,x)); return mix(g,c,smoothstep(0.76,1.0,x)); }",
"void main(){",
"vec2 uv=gl_FragCoord.xy/u_resolution.xy;",
"vec2 p=(gl_FragCoord.xy-0.5*u_resolution.xy)/min(u_resolution.x,u_resolution.y);",
"float t=u_time*0.19;",
"float organic=fbm(p*1.25+vec2(t*0.11,-t*0.075));",
"float field=p.x*0.84+p.y*0.43+(organic-0.5)*1.25;",
"float bands=0.5+0.5*sin(field*7.4+t*0.42);",
"float fineBands=0.5+0.5*sin(field*14.8-t*0.24+organic*2.0);",
"float glow=1.0-smoothstep(0.08,0.92,length((uv-vec2(0.48,0.58))*vec2(1.0,0.82)));",
"float tone=clamp(bands*0.72+fineBands*0.16+organic*0.12,0.0,1.0);",
"vec3 color=palette(tone); color=mix(color,palette(min(1.0,tone+0.12)),glow*0.17); color*=0.64+0.34*glow;",
"float vignette=1.0-smoothstep(0.18,1.05,length((uv-0.5)*vec2(1.0,0.86))); color*=0.56+0.44*vignette;",
"gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);",
"}",
].join("\\n");

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
  return shader;
}

export function ShaderBackground({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.className = "main-shader-canvas";
    canvas.setAttribute("aria-hidden","true");
    host.appendChild(canvas);
    const gl = canvas.getContext("webgl", {
      alpha:false,antialias:false,depth:false,stencil:false,
      powerPreference:"low-power",preserveDrawingBuffer:false,
    });
    if (!gl) { canvas.remove(); return () => canvas.remove(); }
    const vertex = compileShader(gl,gl.VERTEX_SHADER,VERTEX_SHADER);
    const fragment = compileShader(gl,gl.FRAGMENT_SHADER,FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      if(vertex)gl.deleteShader(vertex); if(fragment)gl.deleteShader(fragment);
      if(program)gl.deleteProgram(program); canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return () => canvas.remove();
    }
    gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) {
      gl.deleteShader(vertex);gl.deleteShader(fragment);gl.deleteProgram(program);canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext(); return () => canvas.remove();
    }
    gl.useProgram(program);
    const buffer=gl.createBuffer(), position=gl.getAttribLocation(program,"a_position");
    if(!buffer || position<0) {
      if(buffer)gl.deleteBuffer(buffer);gl.deleteShader(vertex);gl.deleteShader(fragment);
      gl.deleteProgram(program);canvas.remove();gl.getExtension("WEBGL_lose_context")?.loseContext();
      return () => canvas.remove();
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const resolution=gl.getUniformLocation(program,"u_resolution");
    const time=gl.getUniformLocation(program,"u_time");
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf=0,timer=0,disposed=false,contextLost=false;
    let visible=document.visibilityState==="visible",inView=true;
    const started=performance.now();let lastFrame=0;
    const stop=()=>{if(raf)cancelAnimationFrame(raf);if(timer)window.clearTimeout(timer);raf=0;timer=0;};
    const resize=()=>{
      if(disposed||contextLost)return;
      const rect=host.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.25);
      const rw=Math.max(1,Math.round(rect.width*dpr)),rh=Math.max(1,Math.round(rect.height*dpr));
      const scale=Math.min(1,Math.sqrt(1200000/Math.max(1,rw*rh)));
      const w=Math.max(1,Math.round(rw*scale)),h=Math.max(1,Math.round(rh*scale));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
    };
    const draw=(now:number)=>{
      if(disposed||contextLost)return;
      gl.uniform2f(resolution,canvas.width,canvas.height);
      gl.uniform1f(time,reduced.matches?0:Math.max(0,(now-started)/1000));
      gl.drawArrays(gl.TRIANGLES,0,3);lastFrame=now;
    };
    const schedule=()=>{
      if(disposed||contextLost||!visible||!inView||reduced.matches||timer||raf)return;
      timer=window.setTimeout(()=>{timer=0;raf=requestAnimationFrame((now)=>{raf=0;resize();draw(now);schedule();});},
        Math.max(0,34-(performance.now()-lastFrame)));
    };
    const update=()=>{stop();if(disposed||contextLost||!visible||!inView)return;resize();draw(performance.now());schedule();};
    const visibility=()=>{visible=document.visibilityState==="visible";update();};
    const motion=()=>update();
    const lost=(event:Event)=>{event.preventDefault();contextLost=true;stop();canvas.style.display="none";};
    const ro=new ResizeObserver(update),io=new IntersectionObserver(([entry])=>{inView=entry?.isIntersecting??true;update();});
    ro.observe(host);io.observe(host);document.addEventListener("visibilitychange",visibility);
    reduced.addEventListener("change",motion);window.addEventListener("resize",update,{passive:true});
    canvas.addEventListener("webglcontextlost",lost,{passive:false});update();
    return ()=>{
      disposed=true;stop();ro.disconnect();io.disconnect();
      document.removeEventListener("visibilitychange",visibility);reduced.removeEventListener("change",motion);
      window.removeEventListener("resize",update);canvas.removeEventListener("webglcontextlost",lost);
      gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
      gl.getExtension("WEBGL_lose_context")?.loseContext();canvas.remove();
    };
  },[]);
  return <div ref={hostRef} aria-hidden="true" className={"main-shader-background "+className} />;
}
export default ShaderBackground;
