"use client";

import { useEffect, useRef } from "react";
import { Camera, Mesh, Program, Renderer, Transform, Triangle, Vec3 } from "ogl";

type MetaBallsProps = {
  className?: string;
  color?: string;
  speed?: number;
  enableMouseInteraction?: boolean;
  hoverSmoothness?: number;
  animationSize?: number;
  ballCount?: number;
  clumpFactor?: number;
  cursorBallSize?: number;
  cursorBallColor?: string;
  enableTransparency?: boolean;
  // Stretch the orbits to the container and keep every blob, the cursor one
  // included, a margin away from its edges, so none is ever cut off
  contain?: boolean;
};

// Distance, in shader units, that contained blobs keep from the edges: enough
// for the largest ball and the bulge where two of them merge
const CONTAIN_MARGIN = 3;

function parseHexColor(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

function fract(x: number) {
  return x - Math.floor(x);
}

function hash31(p: number) {
  const r = [p * 0.1031, p * 0.103, p * 0.0973].map(fract);
  const rYzx = [r[1], r[2], r[0]];
  const dotVal =
    r[0] * (rYzx[0] + 33.33) + r[1] * (rYzx[1] + 33.33) + r[2] * (rYzx[2] + 33.33);
  return r.map((v) => fract(v + dotVal));
}

function hash33(v: number[]) {
  const p = [v[0] * 0.1031, v[1] * 0.103, v[2] * 0.0973].map(fract);
  const pYxz = [p[1], p[0], p[2]];
  const dotVal =
    p[0] * (pYxz[0] + 33.33) + p[1] * (pYxz[1] + 33.33) + p[2] * (pYxz[2] + 33.33);
  const q = p.map((value) => fract(value + dotVal));
  const qXxy = [q[0], q[0], q[1]];
  const qYxx = [q[1], q[0], q[0]];
  const qZyx = [q[2], q[1], q[0]];
  return qXxy.map((value, i) => fract((value + qYxx[i]) * qZyx[i]));
}

const vertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform vec3 iMouse;
uniform vec3 iColor;
uniform vec3 iCursorColor;
uniform float iAnimationSize;
uniform int iBallCount;
uniform float iCursorBallSize;
uniform vec3 iMetaBalls[50];
uniform float iClumpFactor;
uniform bool enableTransparency;
out vec4 outColor;

float getMetaBallValue(vec2 c, float r, vec2 p) {
  vec2 d = p - c;
  float dist2 = dot(d, d);
  return (r * r) / dist2;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  float scale = iAnimationSize / iResolution.y;
  vec2 coord = (fc - iResolution.xy * 0.5) * scale;
  vec2 mouseW = (iMouse.xy - iResolution.xy * 0.5) * scale;
  float m1 = 0.0;
  for (int i = 0; i < 50; i++) {
    if (i >= iBallCount) break;
    m1 += getMetaBallValue(iMetaBalls[i].xy, iMetaBalls[i].z, coord);
  }
  float m2 = getMetaBallValue(mouseW, iCursorBallSize, coord);
  float total = m1 + m2;
  float f = smoothstep(-1.0, 1.0, (total - 1.3) / min(1.0, fwidth(total)));
  vec3 cFinal = vec3(0.0);
  if (total > 0.0) {
    float alpha1 = m1 / total;
    float alpha2 = m2 / total;
    cFinal = iColor * alpha1 + iCursorColor * alpha2;
  }
  outColor = vec4(cFinal * f, enableTransparency ? f : 1.0);
}
`;

export default function MetaBalls({
  className = "",
  color = "#ffffff",
  speed = 0.3,
  enableMouseInteraction = true,
  hoverSmoothness = 0.05,
  animationSize = 30,
  ballCount = 15,
  clumpFactor = 1,
  cursorBallSize = 3,
  cursorBallColor = "#ffffff",
  enableTransparency = true,
  contain = false,
}: MetaBallsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const dpr = 1;
    const renderer = new Renderer({ dpr, alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, enableTransparency ? 0 : 1);
    container.appendChild(gl.canvas);

    const camera = new Camera(gl, {
      left: -1,
      right: 1,
      top: 1,
      bottom: -1,
      near: 0.1,
      far: 10,
    });
    camera.position.z = 1;

    const geometry = new Triangle(gl);
    const [r1, g1, b1] = parseHexColor(color);
    const [r2, g2, b2] = parseHexColor(cursorBallColor);

    const metaBallsUniform: Vec3[] = [];
    for (let i = 0; i < 50; i++) {
      metaBallsUniform.push(new Vec3(0, 0, 0));
    }

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Vec3(0, 0, 0) },
        iMouse: { value: new Vec3(0, 0, 0) },
        iColor: { value: new Vec3(r1, g1, b1) },
        iCursorColor: { value: new Vec3(r2, g2, b2) },
        iAnimationSize: { value: animationSize },
        iBallCount: { value: ballCount },
        iCursorBallSize: { value: cursorBallSize },
        iMetaBalls: { value: metaBallsUniform },
        iClumpFactor: { value: clumpFactor },
        enableTransparency: { value: enableTransparency },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    const scene = new Transform();
    mesh.setParent(scene);

    const effectiveBallCount = Math.min(ballCount, 50);
    const ballParams: {
      st: number;
      dtFactor: number;
      baseScale: number;
      toggle: number;
      radius: number;
    }[] = [];

    for (let i = 0; i < effectiveBallCount; i++) {
      const h1 = hash31(i + 1);
      const h2 = hash33(h1);
      ballParams.push({
        st: h1[0] * (2 * Math.PI),
        dtFactor: 0.1 * Math.PI + h1[1] * (0.4 * Math.PI - 0.1 * Math.PI),
        baseScale: 5.0 + h1[1] * (10.0 - 5.0),
        toggle: Math.floor(h2[0] * 2.0),
        radius: 0.5 + h2[2] * (2.0 - 0.5),
      });
    }

    const mouseBallPos = { x: 0, y: 0 };
    let pointerInside = false;
    let pointerX = 0;
    let pointerY = 0;

    function resize() {
      const width = container!.clientWidth;
      const height = container!.clientHeight;
      renderer.setSize(width * dpr, height * dpr);
      gl.canvas.style.width = `${width}px`;
      gl.canvas.style.height = `${height}px`;
      program.uniforms.iResolution.value.set(gl.canvas.width, gl.canvas.height, 0);
    }

    // Track the container itself: it can resize without the window doing so
    // (layout shifts, font loading, or mounting before layout settles).
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    // Listens on the window and tests the container's box rather than using
    // enter/leave on the container: the canvas usually sits behind other
    // content (cards, panels), which would swallow those events.
    function onPointerMove(event: PointerEvent) {
      if (!enableMouseInteraction) return;
      const rect = container!.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      pointerInside = inside;
      if (!inside) return;
      pointerX = ((event.clientX - rect.left) / rect.width) * gl.canvas.width;
      pointerY = (1 - (event.clientY - rect.top) / rect.height) * gl.canvas.height;
    }
    function onPointerLeaveWindow() {
      pointerInside = false;
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeaveWindow);

    const startTime = performance.now();
    let animationFrameId = 0;

    function update(t: number) {
      animationFrameId = visible ? requestAnimationFrame(update) : 0;
      const elapsed = (t - startTime) * 0.001;
      program.uniforms.iTime.value = elapsed;

      // Contained: the field is sized by the container's shorter side, so a
      // tall, narrow container still has room across for its blobs; then the
      // widest orbit (baseScale tops out at 10) is mapped onto the container,
      // less the margin, separately on each axis
      const aspect = gl.canvas.width / Math.max(1, gl.canvas.height);
      const size = contain ? animationSize * Math.max(1, 1 / aspect) : animationSize;
      program.uniforms.iAnimationSize.value = size;
      const halfH = size / 2;
      const halfW = halfH * aspect;
      const reach = 10 * clumpFactor;
      const sx = contain ? Math.max(0, halfW - CONTAIN_MARGIN) / reach : 1;
      const sy = contain ? Math.max(0, halfH - CONTAIN_MARGIN) / reach : 1;
      for (let i = 0; i < effectiveBallCount; i++) {
        const p = ballParams[i];
        const dt = elapsed * speed * p.dtFactor;
        const th = p.st + dt;
        const x = Math.cos(th);
        const y = Math.sin(th + dt * p.toggle);
        metaBallsUniform[i].set(
          x * p.baseScale * clumpFactor * sx,
          y * p.baseScale * clumpFactor * sy,
          p.radius,
        );
      }

      let targetX: number;
      let targetY: number;
      if (pointerInside) {
        targetX = pointerX;
        targetY = pointerY;
      } else {
        const cx = gl.canvas.width * 0.5;
        const cy = gl.canvas.height * 0.5;
        targetX = cx + Math.cos(elapsed * speed) * gl.canvas.width * 0.15;
        targetY = cy + Math.sin(elapsed * speed) * gl.canvas.height * 0.15;
      }
      if (contain) {
        // Keep the cursor blob inside the margin even with the pointer at an edge
        const px = CONTAIN_MARGIN * (gl.canvas.height / size);
        const w = gl.canvas.width;
        const h = gl.canvas.height;
        targetX = w > px * 2 ? Math.min(w - px, Math.max(px, targetX)) : w / 2;
        targetY = h > px * 2 ? Math.min(h - px, Math.max(px, targetY)) : h / 2;
      }
      mouseBallPos.x += (targetX - mouseBallPos.x) * hoverSmoothness;
      mouseBallPos.y += (targetY - mouseBallPos.y) * hoverSmoothness;
      program.uniforms.iMouse.value.set(mouseBallPos.x, mouseBallPos.y, 0);

      renderer.render({ scene, camera });
    }

    // Off screen there is nothing to draw; with more than one instance on
    // the page, idle WebGL loops add up
    let visible = true;
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !animationFrameId) animationFrameId = requestAnimationFrame(update);
    });
    intersection.observe(container);

    animationFrameId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeaveWindow);
      container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [
    color,
    cursorBallColor,
    speed,
    enableMouseInteraction,
    hoverSmoothness,
    animationSize,
    ballCount,
    clumpFactor,
    cursorBallSize,
    enableTransparency,
    contain,
  ]);

  return <div ref={containerRef} className={`relative h-full w-full ${className}`} />;
}
