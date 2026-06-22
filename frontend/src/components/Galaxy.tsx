// Animated ASCII nebula banner. A landscape, full-width framed band: an organic
// billowing cloud (fractal value-noise + domain warping) with a bright core and
// a twinkling starfield around it. Inherits the theme accent via `.banner-art`,
// so it shifts with the theme. Width is responsive — it measures its container
// and renders enough columns to fill it, so it works on smaller monitors too.
// (Export name kept as `Galaxy` — same banner slot, no title/subtitle anymore.)

import { useEffect, useRef, useState } from "react";

const ROWS = 18;
const FPS = 20;
const STAR_COUNT = 300;
const BOOT_MS = 1600; // left-to-right "being generated" wipe on first run / reset
// Dim → bright character ramp for the cloud body. Deliberately avoids the
// letters s/e/x so drifting cells can't spell an unfortunate word in the core.
const RAMP = " .,-~:;=+*oacknwm#%@";

interface Star {
  sx: number; // normalized 0..1 (kept across resizes)
  sy: number;
  b: number; // base brightness
  tw: number; // twinkle phase
}

function makeStars(): Star[] {
  const out: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    out.push({
      sx: Math.random(),
      sy: Math.random(),
      b: 0.35 + Math.random() * 0.6,
      tw: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

// ── value noise + fractal Brownian motion (organic clouds) ──────────────────
function hash(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);
  const a = lerp(hash(xi, yi), hash(xi + 1, yi), u);
  const b = lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u);
  return lerp(a, b, v);
}

function fbm(x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum; // ~0..0.93
}

const starChar = (v: number) => (v < 0.45 ? "." : v < 0.78 ? "+" : "*");

/** Measures one monospace character at the banner font, in px. */
function measureCharWidth(): number {
  const probe = document.createElement("span");
  probe.className = "banner banner-art";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  probe.textContent = "0".repeat(100);
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 100;
  document.body.removeChild(probe);
  return w;
}

export function Galaxy({ boot = false, reduceMotion = false }: { boot?: boolean; reduceMotion?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(80);
  const [frame, setFrame] = useState("");
  const stars = useRef<Star[]>(makeStars());
  // Once the banner scrolls out of view (a long session), stop doing the heavy
  // per-frame grid math + re-render. The rAF keeps ticking (cheap) and resumes
  // the moment it's visible again.
  const visible = useRef(true);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Responsive width: fit as many columns (+ frame) as the container allows.
  useEffect(() => {
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const charW = measureCharWidth();
      if (!charW) return;
      const c = Math.max(24, Math.floor(el.clientWidth / charW) - 2);
      setCols((prev) => (prev === c ? prev : c));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const COLS = cols;
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const cx = (COLS - 1) / 2;
    const cy = (ROWS - 1) / 2;
    const grid = new Float32Array(COLS * ROWS);
    const starV = new Float32Array(COLS * ROWS);

    const top = "┌" + "─".repeat(COLS) + "┐";
    const bottom = "└" + "─".repeat(COLS) + "┘";
    const F = 0.085; // noise frequency per character cell

    function tick(now: number) {
      if (!reduceMotion) raf = requestAnimationFrame(tick); // static = one frame
      // Off-screen → skip the expensive grid build + setFrame (re-render).
      if (!visible.current && !reduceMotion) return;
      if (now - last < 1000 / FPS) return;
      last = now;
      const t = (now - start) / 1000;
      grid.fill(0);
      starV.fill(0);

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const nx = (x - cx) / (COLS * 0.5);
          const ny = (y - cy) / (ROWS * 0.5);
          // Tighter than the frame so the cloud sits centrally, stars around it.
          const rad = Math.hypot(nx * 1.35, ny * 1.15);
          let fall = 1 - rad;
          if (fall <= 0) continue;
          fall = fall * fall; // soft edge

          // Drifting, domain-warped fractal cloud (y*1.8 ≈ char aspect → round).
          const sx = x * F;
          const sy = y * F * 1.8;
          const wx = sx + 1.3 * fbm(sx * 0.5 + t * 0.06, sy * 0.5 + 11.0);
          const wy = sy + 1.3 * fbm(sx * 0.5 + 5.0, sy * 0.5 + t * 0.05);
          const n = fbm(wx + t * 0.05, wy - t * 0.02) * 1.35;

          // Bright twinkling core (the central star + glow).
          const cr = Math.hypot(x - cx, (y - cy) * 1.9);
          const core = Math.exp(-cr * cr * 0.02) * (0.85 + 0.15 * Math.sin(t * 3));

          grid[y * COLS + x] = n * fall + core;
        }
      }

      // Twinkling starfield — only over the darker areas, so the cloud stays clean.
      for (const st of stars.current) {
        const gx = Math.min(COLS - 1, (st.sx * COLS) | 0);
        const gy = Math.min(ROWS - 1, (st.sy * ROWS) | 0);
        const idx = gy * COLS + gx;
        if (grid[idx] > 0.22) continue;
        const v = st.b * (0.5 + 0.5 * Math.sin(t * 2.2 + st.tw));
        if (v > starV[idx]) starV[idx] = v;
      }

      // Boot reveal: rows appear top-to-bottom, like the art is being printed.
      const revealRows = boot ? Math.round(Math.min(1, (now - start) / BOOT_MS) * ROWS) : ROWS;

      const lines: string[] = [top];
      for (let y = 0; y < ROWS; y++) {
        if (y >= revealRows) {
          lines.push("│" + " ".repeat(COLS) + "│");
          continue;
        }
        let row = "";
        for (let x = 0; x < COLS; x++) {
          const idx = y * COLS + x;
          const nd = grid[idx];
          if (nd > 0.06) {
            row += RAMP[Math.min(RAMP.length - 1, Math.floor(nd * RAMP.length))];
          } else if (starV[idx] > 0.18) {
            row += starChar(starV[idx]);
          } else {
            row += " ";
          }
        }
        lines.push("│" + row + "│");
      }
      lines.push(bottom);
      setFrame(lines.join("\n"));
    }

    if (reduceMotion) tick(performance.now()); // render a single static frame
    else raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cols, boot, reduceMotion]);

  return (
    <div ref={wrapRef} className="galaxy-wrap">
      <pre className="banner banner-art galaxy" aria-hidden>
        {frame}
      </pre>
    </div>
  );
}
