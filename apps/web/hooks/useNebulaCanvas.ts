"use client";

import { useRef, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────

interface Star {
  x: number; y: number;
  size: number;
  baseBrightness: number;
  brightness: number;
  phase: number;
  speed: number; angle: number;
  layer: number; // 0=far 1=mid 2=near
}

interface Nebula {
  x: number; y: number;
  radius: number;
  speed: number; angle: number;
  opacity: number;
  hue: number;
}

// ─── Color helpers ───────────────────────────────────────────────────────

function getAccentRGB(): { r: number; g: number; b: number } {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue("--theme-accent").trim();
  if (val.startsWith("#")) {
    const h = val.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }
  return { r: 0, g: 255, b: 65 };
}

// ─── Hook ────────────────────────────────────────────────────────────────

export function useNebulaCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const starsRef = useRef<Star[]>([]);
  const nebulaRef = useRef<Nebula[]>([]);
  const mouseRef = useRef({ x:0, y:0, tx:0, ty:0 });
  const rafRef = useRef(0);
  const lastTime = useRef(0);
  const logW = useRef(0);
  const logH = useRef(0);
  const fpsLog = useRef<number[]>([]);
  const mul = useRef(1);
  const accentRef = useRef({ r:0, g:255, b:65 });
  const isMobile = useRef(false);

  // ─── Generate stars ──────────────────────────────────────────────────
  const generateStars = useCallback((w: number, h: number) => {
    const base = isMobile.current ? 30 : 60;
    const n = Math.max(15, Math.round(base * mul.current));
    const stars: Star[] = [];
    for (let i = 0; i < n; i++) {
      const layer = i < n * 0.5 ? 0 : i < n * 0.8 ? 1 : 2;
      const sizeScale = layer === 0 ? 0.6 : layer === 1 ? 1.5 : 3;
      stars.push({
        x: Math.random() * w, y: Math.random() * h,
        size: (0.5 + Math.random() * 1.0) * sizeScale,
        baseBrightness:
          layer === 0 ? 0.3 + Math.random() * 0.4 :
          layer === 1 ? 0.5 + Math.random() * 0.3 :
          0.7 + Math.random() * 0.3,
        brightness: 1,
        phase: Math.random() * Math.PI * 2,
        speed: layer === 0 ? 0 : 0.2 + Math.random() * 0.4,
        angle: Math.random() * Math.PI * 2,
        layer,
      });
    }
    starsRef.current = stars;
  }, []);

  // ─── Generate nebula ─────────────────────────────────────────────────
  const generateNebula = useCallback((w: number, h: number) => {
    const count = isMobile.current ? 1 : 3;
    const list: Nebula[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        x: Math.random() * w, y: Math.random() * h,
        radius: 150 + Math.random() * 250,
        speed: 2 + Math.random() * 4,
        angle: Math.random() * Math.PI * 2,
        opacity: 0.1 + Math.random() * 0.12,
        hue: i * 30 + Math.random() * 40,
      });
    }
    nebulaRef.current = list;
  }, []);

  // ─── Regenerate ──────────────────────────────────────────────────────
  const regenerate = useCallback((w: number, h: number) => {
    logW.current = w; logH.current = h;
    generateStars(w, h);
    generateNebula(w, h);
  }, [generateStars, generateNebula]);

  // ─── Render ──────────────────────────────────────────────────────────
  const render = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!lastTime.current) lastTime.current = ts;
    const dt = Math.min((ts - lastTime.current) / 1000, 0.1);
    lastTime.current = ts;

    // FPS
    fpsLog.current.push(dt);
    if (fpsLog.current.length > 30) fpsLog.current.shift();
    if (fpsLog.current.length >= 10) {
      const avg = fpsLog.current.slice(-10).reduce((a, b) => a + b, 0) / 10;
      if (avg > 0.033 && mul.current > 0.25) {
        mul.current = Math.max(0.25, mul.current / 2);
        regenerate(logW.current, logH.current);
      } else if (avg < 0.025 && mul.current < 1) {
        const all = fpsLog.current.reduce((a, b) => a + b, 0) / fpsLog.current.length;
        if (all < 0.025) { mul.current = Math.min(1, mul.current * 2); regenerate(logW.current, logH.current); }
      }
    }

    const w = logW.current;
    const h = logH.current;
    const accent = accentRef.current;

    // ── Clear ──
    ctx.clearRect(0, 0, w, h);

    // ── Mouse ──
    const m = mouseRef.current;
    m.x += (m.tx - m.x) * 0.05;
    const px = m.x * 2;
    const py = m.y * 2;

    // ── Draw nebula ──
    for (const neb of nebulaRef.current) {
      neb.angle += neb.speed * dt * 0.03;
      neb.x += Math.cos(neb.angle) * neb.speed * dt * 2;
      neb.y += Math.sin(neb.angle) * neb.speed * dt * 2;
      if (neb.x < -neb.radius) neb.x = w + neb.radius;
      if (neb.x > w + neb.radius) neb.x = -neb.radius;
      if (neb.y < -neb.radius) neb.y = h + neb.radius;
      if (neb.y > h + neb.radius) neb.y = -neb.radius;

      const g = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius);
      g.addColorStop(0, `rgba(${accent.r},${accent.g},${accent.b},${neb.opacity})`);
      g.addColorStop(0.3, `rgba(${accent.r},${accent.g},${accent.b},${neb.opacity * 0.5})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // ── Draw stars ──
    for (const star of starsRef.current) {
      if (star.speed > 0) {
        star.angle += star.speed * dt * 0.15;
        star.x += Math.cos(star.angle) * star.speed * dt * 6 + px * dt * 0.5;
        star.y += Math.sin(star.angle) * star.speed * dt * 6 + py * dt * 0.5;
        if (star.x < -10) star.x = w + 10;
        if (star.x > w + 10) star.x = -10;
        if (star.y < -10) star.y = h + 10;
        if (star.y > h + 10) star.y = -10;
      }

      star.phase += dt * (1 + Math.random() * 0.5);
      const twinkle = 0.6 + 0.4 * Math.sin(star.phase);
      star.brightness = star.baseBrightness * twinkle;

      // Mix accent color with white — even dim stars keep 30% accent
      const accentMix = 0.3 + 0.7 * star.brightness;
      const whiteMix = 1 - accentMix;
      const acR = Math.round(accent.r * accentMix + 255 * whiteMix);
      const acG = Math.round(accent.g * accentMix + 255 * whiteMix);
      const acB = Math.round(accent.b * accentMix + 255 * whiteMix);

      ctx.beginPath();
      ctx.arc(star.x, star.y, Math.max(0.5, star.size), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${acR},${acG},${acB},${star.brightness})`;
      ctx.fill();

      // Glow halo for near stars
      if (star.layer === 2) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent.r},${accent.g},${accent.b},${star.brightness * 0.06})`;
        ctx.fill();
      }
    }

    rafRef.current = requestAnimationFrame(render);
  }, [canvasRef, regenerate]);

  // ─── Effects ──────────────────────────────────────────────────────────

  // Init
  useEffect(() => {
    isMobile.current = window.innerWidth < 768;
    accentRef.current = getAccentRGB();
  }, []);

  // Resize
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const fn = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth, h = window.innerHeight;
        canvas.width = w * dpr; canvas.height = h * dpr;
        canvas.style.width = w + "px"; canvas.style.height = h + "px";
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
        regenerate(w, h);
      }, 100);
    };
    fn();
    window.addEventListener("resize", fn);
    return () => { window.removeEventListener("resize", fn); clearTimeout(t); };
  }, [canvasRef, regenerate]);

  // Render loop
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq.matches && !document.hidden) {
      lastTime.current = 0;
      rafRef.current = requestAnimationFrame(render);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [render]);

  // Visibility
  useEffect(() => {
    const fn = () => {
      if (document.hidden) { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; lastTime.current = 0; }
      else { lastTime.current = 0; rafRef.current = requestAnimationFrame(render); }
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [render]);

  // Reduced motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => {
      if (mq.matches) { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = 0; render(performance.now()); }
      else if (!document.hidden) { lastTime.current = 0; rafRef.current = requestAnimationFrame(render); }
    };
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [render]);

  // Mouse
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      mouseRef.current.tx = ((e.clientX - r.left - cx) / cx) * 3;
      mouseRef.current.ty = ((e.clientY - r.top - cy) / cy) * 3;
    };
    const onTouch = (e: TouchEvent) => {
      if (!e.touches.length) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const t = e.touches[0]!;
      const cx = r.width / 2, cy = r.height / 2;
      mouseRef.current.tx = ((t.clientX - r.left - cx) / cx) * 3;
      mouseRef.current.ty = ((t.clientY - r.top - cy) / cy) * 3;
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => { window.removeEventListener("mousemove", onMouse); window.removeEventListener("touchmove", onTouch); };
  }, [canvasRef]);

  // Theme sync
  useEffect(() => {
    const obs = new MutationObserver(() => { accentRef.current = getAccentRGB(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
}
