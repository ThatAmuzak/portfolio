// ── Three-Body Problem Toy ─────────────────────────────────────────────
// Canvas 2D gravitational N-body simulation starting from the famous
// figure-8 choreography (three equal masses chasing one looping curve).
// A header "+ planet" button keeps injecting small bodies near the system
// centre — watch the stable figure-8 dissolve into chaos as the symmetry
// breaks. RK4 integration; a semi-transparent background fill leaves
// fading orbit trails.
//
// Presets / interactions:
//   • Figure-8: Chenciner–Montgomery stable choreography (mass = 1).
//   • Header buttons (or keys): "+ planet" (<kbd>A</kbd>), pause
//     (<kbd>Space</kbd>), reset (<kbd>R</kbd>).
// Conforms to the CanvasToy interface (see src/lib/types.ts).

import type { CanvasToy } from '../../lib/types';

// ── configuration ───────────────────────────────────────────────────────────

const CFG = {
  /** Newton's gravitational constant (unitless figure-8 units, G = 1). */
  G: 1,
  /** Simulated world-time (in figure-8 units) advanced per real second.
   *  The figure-8 period is ≈6.33 units, so one orbit ≈ 10.5 s. */
  timeScale: 0.6,
  /** RK4 substeps per 60-fps frame. dt = (timeScale/60)/substeps. */
  substeps: 2,
  /** Alpha of the per-frame background fill — lower = longer trails. */
  trailAlpha: 0.025,
  /** World-size of the initial figure-8 bounded to the smaller canvas dim. */
  sizeFrac: 0.32,
  /** Mass of a planet injected by the "+ planet" button. */
  addPlanetMass: 0.02,
  /** Spawn ring radius range (world units). The figure-8 path crosses the
   *  centre, so bodies injected inside its extent get scattered within one
   *  orbit. Spawning on this outer ring gives a coherent circular orbit
   *  (median lifetime ≈ 30u ≈ 50s) that slowly destabilises into chaos. */
  addPlanetRadiusMin: 1.5,
  addPlanetRadiusMax: 2.5,
  /** Random eccentricity jitter applied to the orbital speed (0.95–1.05×). */
  orbitalJitter: 0.1,
  /** Softening distance² — avoids division blow-up on close approaches. */
  softMinD2: 1e-6,
  /** Total hue spread across the body palette (degrees). */
  hueSpread: 130,
  sat: 0.75,
  light: 0.55,
  alpha: 0.9,
};

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
}

/** RGBA colour tuple (0-255 per channel). */
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ── module-level shared state (bridges renderHeaderControls & start) ──────
// Only one toy runs at a time (CanvasToy cleans up before switching), so a
// single shared flag/ref set is safe — same approach as cloth.ts.

let threePaused = false;
let threeResetRequested = false;
let threeAddRequested = false;
let threeResetBtn: HTMLButtonElement | null = null;
let threePauseBtn: HTMLButtonElement | null = null;

// ── colour helpers ──────────────────────────────────────────────────────────

/** Convert HSL to RGB (all values 0–1 range). h in [0, 360). */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    r = x;
    g = 0;
    b = c;
  } else if (h < 300) {
    r = c;
    g = 0;
    b = x;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** Read the site accent colour as 0-255 RGB from CSS custom properties. */
function readAccentRgb(): { r: number; g: number; b: number } {
  const s = getComputedStyle(document.documentElement);
  return {
    r: +s.getPropertyValue('--color-accent-r').trim() || 8,
    g: +s.getPropertyValue('--color-accent-g').trim() || 145,
    b: +s.getPropertyValue('--color-accent-b').trim() || 178,
  };
}

/** Approximate hue (0-360) from an RGB triplet. */
function rgbToHue(r: number, g: number, b: number): number {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) return 0;
  let h = 0;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

/** Build the figure-8 initial conditions (Chenciner–Montgomery, G=1, m=1). */
function figureEightBodies(): Body[] {
  const rx = 0.97000436;
  const ry = -0.24308753;
  const vx3 = 0.93240737;
  const vy3 = 0.86473146;
  return [
    { x: -rx, y: -ry, vx: -vx3 / 2, vy: -vy3 / 2, mass: 1 },
    { x: rx, y: ry, vx: -vx3 / 2, vy: -vy3 / 2, mass: 1 },
    { x: 0, y: 0, vx: vx3, vy: vy3, mass: 1 },
  ];
}

// ── header controls ─────────────────────────────────────────────────────────

function setPaused(p: boolean) {
  threePaused = p;
  if (threePauseBtn) {
    threePauseBtn.setAttribute('aria-checked', threePaused ? 'false' : 'true');
    threePauseBtn.setAttribute('aria-label', threePaused ? 'Play simulation' : 'Pause simulation');
    threePauseBtn.style.backgroundColor = threePaused ? 'transparent' : 'var(--color-accent)';
    threePauseBtn.style.borderColor = threePaused
      ? 'var(--color-ink-tertiary)'
      : 'var(--color-accent)';
    const thumb = threePauseBtn.querySelector<HTMLSpanElement>('span');
    if (thumb) {
      thumb.style.left = threePaused ? '2px' : '18px';
      thumb.style.backgroundColor = threePaused ? 'var(--color-ink-tertiary)' : '#fff';
    }
  }
}

/** Flyweight button style reused by both header buttons. */
function styleButton(btn: HTMLButtonElement): void {
  btn.style.cssText =
    'font-family:monospace;font-size:12px;color:var(--color-ink-secondary);' +
    'background:transparent;border:1px solid var(--color-border);' +
    'border-radius:6px;padding:2px 10px;cursor:pointer;flex-shrink:0;' +
    'transition:border-color 0.2s,color 0.2s;';
  const hover = () => {
    btn.style.color = 'var(--color-accent)';
    btn.style.borderColor = 'var(--color-accent)';
  };
  const unhover = () => {
    btn.style.color = '';
    btn.style.borderColor = '';
  };
  btn.addEventListener('mouseenter', hover);
  btn.addEventListener('mouseleave', unhover);
}

function buildHeaderControls(container: HTMLElement): () => void {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center gap-2';

  // Pause / play switch (game-of-life track style).
  threePauseBtn = document.createElement('button');
  threePauseBtn.type = 'button';
  threePauseBtn.setAttribute('role', 'switch');
  threePauseBtn.style.cssText =
    'position:relative;display:inline-block;width:36px;height:20px;' +
    'border-radius:10px;border:1px solid;cursor:pointer;flex-shrink:0;' +
    'transition:background-color 0.25s,border-color 0.25s;';
  const thumb = document.createElement('span');
  thumb.style.cssText =
    'position:absolute;top:2px;width:14px;height:14px;border-radius:50%;' +
    'transition:left 0.25s,background-color 0.25s;';
  threePauseBtn.appendChild(thumb);
  threePauseBtn.addEventListener('click', () => setPaused(!threePaused));
  wrapper.appendChild(threePauseBtn);

  // "+ planet" button — inject a small body near the centre of mass.
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+ planet';
  addBtn.setAttribute('aria-label', 'Add a planet on an orbit around the system');
  styleButton(addBtn);
  addBtn.addEventListener('click', () => {
    threeAddRequested = true;
  });
  wrapper.appendChild(addBtn);

  // Reset button — return to a fresh figure-8.
  threeResetBtn = document.createElement('button');
  threeResetBtn.type = 'button';
  threeResetBtn.textContent = 'Reset';
  threeResetBtn.setAttribute('aria-label', 'Reset to figure-8');
  styleButton(threeResetBtn);
  threeResetBtn.addEventListener('click', () => {
    threeResetRequested = true;
  });
  wrapper.appendChild(threeResetBtn);

  container.appendChild(wrapper);

  // Draw the switch in its initial (playing) state.
  setPaused(false);

  return () => {
    wrapper.remove();
    threePauseBtn = null;
    threeResetBtn = null;
  };
}

// ── toy definition ──────────────────────────────────────────────────────────

export const threeBodyToy: CanvasToy = {
  id: 'three-body',
  headerHtml:
    '&#x1f319;&#xfe0f; drop in planets &nbsp;&middot;&nbsp; <kbd>A</kbd> add &nbsp;&middot;&nbsp; <kbd>Space</kbd> pause &nbsp;&middot;&nbsp; <kbd>R</kbd> reset',
  footerHtml:
    '<strong class="text-ink-secondary">Three-Body Problem</strong> &mdash; three equal masses obediently trace the famous figure-8. Drop a planet in &mdash; it arrives on a circular orbit around the system&rsquo;s combined mass, until mutual gravity scrambles it. There is no closed-form solution, only the dance of mutual gravity.',
  start,
  renderHeaderControls: buildHeaderControls,
};

// ── simulation ──────────────────────────────────────────────────────────────

function start(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // ── mutable state ─────────────────────────────────────────────────────────
  let bodies: Body[] = [];
  let W = 0;
  let H = 0;
  let dpr = 1;
  let scale = 1;
  let cx = 0;
  let cy = 0;

  let running = true;

  let surfBg: { r: number; g: number; b: number } = { r: 16, g: 18, b: 24 };
  let palette: Rgba[] = [];

  let animId: number | null = null;
  let lastTime = 0;
  let accumulator = 0;
  const FIXED_DT = 1 / 60;

  // ── theme-aware background ────────────────────────────────────────────────

  function readSurfBg() {
    const isDark = document.documentElement.classList.contains('dark');
    surfBg = isDark ? { r: 16, g: 18, b: 24 } : { r: 250, g: 251, b: 252 };
  }

  // ── palette ───────────────────────────────────────────────────────────────

  function rebuildPalette() {
    const accent = readAccentRgb();
    const baseHue = rgbToHue(accent.r, accent.g, accent.b);
    const start = baseHue - CFG.hueSpread / 2;
    const count = 12;
    palette = [];
    for (let i = 0; i < count; i++) {
      const h = (start + (CFG.hueSpread * i) / (count - 1) + 360) % 360;
      const rgb = hslToRgb(h, CFG.sat, CFG.light);
      palette.push({ ...rgb, a: CFG.alpha });
    }
  }

  function colFor(index: number): Rgba {
    return palette[index % palette.length];
  }

  // ── init / reset / queries ────────────────────────────────────────────────

  function resetBodies() {
    bodies = figureEightBodies();
  }

  /** Centre of mass of the current bodies (world units). */
  function computeCom(): { x: number; y: number } {
    let mx = 0,
      my = 0,
      m = 0;
    for (const b of bodies) {
      mx += b.x * b.mass;
      my += b.y * b.mass;
      m += b.mass;
    }
    if (m > 0) {
      mx /= m;
      my /= m;
    }
    return { x: mx, y: my };
  }

  /** Inject a small body on a coherent circular orbit around the COM. */
  function addPlanet() {
    const com = computeCom();
    let totalM = 0;
    for (const b of bodies) totalM += b.mass;

    // Spawn on an outer ring where the field ≈ point mass at the COM.
    // (The figure-8 path crosses the centre — anything injected there is
    // scattered within one orbit, so the orbit must start outside it.)
    const r =
      CFG.addPlanetRadiusMin + (CFG.addPlanetRadiusMax - CFG.addPlanetRadiusMin) * Math.random();
    const a = Math.random() * Math.PI * 2;

    // Circular orbital speed about the combined mass at this radius,
    // with a little eccentricity jitter (0.95–1.05×) so the orbit isn't
    // exactly circular and slowly precesses into chaos.
    const v =
      Math.sqrt((CFG.G * totalM) / r) *
      (1 - CFG.orbitalJitter / 2 + CFG.orbitalJitter * Math.random());

    // Tangential to the radius vector — random sense of rotation.
    const dir = Math.random() < 0.5 ? 1 : -1;
    bodies.push({
      x: com.x + r * Math.cos(a),
      y: com.y + r * Math.sin(a),
      vx: -Math.sin(a) * dir * v,
      vy: Math.cos(a) * dir * v,
      mass: CFG.addPlanetMass,
    });
  }

  // ── resize ────────────────────────────────────────────────────────────────

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = W / 2;
    cy = H / 2;
    scale = Math.min(W, H) * CFG.sizeFrac;

    readSurfBg();
    rebuildPalette();

    if (bodies.length === 0) resetBodies();
  }

  // ── physics (RK4) ─────────────────────────────────────────────────────────

  /**
   * One RK4 integration step across all bodies.
   *
   * We integrate the flat state
   *   s = [x0,y0,vx0,vy0, x1,y1,vx1,vy1, ...]
   * where, after order reduction, the derivative of
   *   (x, y)          → (vx, vy)
   *   (vx, vy)        → (ax, ay)  from Newton's law on the current positions.
   */
  function rk4Step(dt: number) {
    const n = bodies.length;
    if (n === 0) return;

    const s0 = new Float64Array(n * 4);
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      s0[i * 4] = b.x;
      s0[i * 4 + 1] = b.y;
      s0[i * 4 + 2] = b.vx;
      s0[i * 4 + 3] = b.vy;
    }

    const tmp = new Float64Array(n * 4);
    // masses held out (constant during a step)
    const masses = new Float64Array(n);
    for (let i = 0; i < n; i++) masses[i] = bodies[i].mass;

    /** Rate of change of the state at a given position/velocity snapshot. */
    function d(s: Float64Array): Float64Array {
      const du = new Float64Array(n * 4);
      for (let i = 0; i < n; i++) {
        du[i * 4] = s[i * 4 + 2]; // vx
        du[i * 4 + 1] = s[i * 4 + 3]; // vy
      }
      for (let i = 0; i < n; i++) {
        const xi = s[i * 4];
        const yi = s[i * 4 + 1];
        let ax = 0,
          ay = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const dx = s[j * 4] - xi;
          const dy = s[j * 4 + 1] - yi;
          let d2 = dx * dx + dy * dy;
          if (d2 < CFG.softMinD2) d2 = CFG.softMinD2;
          const inv = (CFG.G * masses[j]) / (d2 * Math.sqrt(d2));
          ax += inv * dx;
          ay += inv * dy;
        }
        du[i * 4 + 2] = ax;
        du[i * 4 + 3] = ay;
      }
      return du;
    }

    const k1 = d(s0);
    for (let i = 0; i < n * 4; i++) tmp[i] = s0[i] + 0.5 * dt * k1[i];
    const k2 = d(tmp);
    for (let i = 0; i < n * 4; i++) tmp[i] = s0[i] + 0.5 * dt * k2[i];
    const k3 = d(tmp);
    for (let i = 0; i < n * 4; i++) tmp[i] = s0[i] + dt * k3[i];
    const k4 = d(tmp);

    for (let i = 0; i < n * 4; i++) {
      s0[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }

    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      b.x = s0[i * 4];
      b.y = s0[i * 4 + 1];
      b.vx = s0[i * 4 + 2];
      b.vy = s0[i * 4 + 3];
    }
  }

  // ── update ────────────────────────────────────────────────────────────────

  function update(dt: number) {
    // Service header-button requests first (they just set flags).
    if (threeResetRequested) {
      threeResetRequested = false;
      resetBodies();
      ctx.clearRect(0, 0, W, H);
    }
    if (threeAddRequested) {
      threeAddRequested = false;
      addPlanet();
    }
    if (threePaused) return;

    const timeDt = dt * CFG.timeScale;
    const substepDt = timeDt / CFG.substeps;
    for (let s = 0; s < CFG.substeps; s++) {
      rk4Step(substepDt);
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  function rgbaStr(c: Rgba): string {
    return `rgba(${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)},${c.a.toFixed(3)})`;
  }

  function render() {
    // Fade old content → natural lingering orbit trails.
    ctx.fillStyle = `rgba(${surfBg.r},${surfBg.g},${surfBg.b},${CFG.trailAlpha})`;
    ctx.fillRect(0, 0, W, H);

    const com = computeCom();

    // Adaptive zoom: keep the whole system framed as bodies are ejected or
    // cluster up. Smoothly lerp toward the target scale each frame.
    let extent = 0;
    for (const b of bodies) {
      extent = Math.max(extent, Math.hypot(b.x - com.x, b.y - com.y));
    }
    const minExtent = 1.05; // figure-8 half-extent ≈ 1.0
    const baseScale = Math.min(W, H) * CFG.sizeFrac;
    const target = extent > 0 ? baseScale * (minExtent / Math.max(extent, minExtent)) : baseScale;
    scale += (target - scale) * Math.min(1, 0.04);

    const comPx = cx + com.x * scale;
    const comPy = cy - com.y * scale;

    // Centre-of-mass marker (a tiny educational dot).
    ctx.fillStyle = 'var(--color-ink-tertiary)';
    ctx.beginPath();
    ctx.arc(comPx, comPy, 2, 0, Math.PI * 2);
    ctx.fill();

    // Each body, radius ∝ mass^(1/3).
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const px = cx + (b.x - com.x) * scale;
      const py = cy - (b.y - com.y) * scale;
      const radius = Math.max(3, 3.2 * Math.cbrt(b.mass));

      ctx.fillStyle = rgbaStr(colFor(i));
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ── game loop (fixed timestep) ────────────────────────────────────────────

  function loop(timestamp: number) {
    if (!running) return;

    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : FIXED_DT;
    lastTime = timestamp;
    accumulator += dt;

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 3) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }

    render();
    animId = requestAnimationFrame(loop);
  }

  // ── event handlers ───────────────────────────────────────────────────────

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      threeResetRequested = true;
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      threeAddRequested = true;
    } else if (e.key === ' ') {
      e.preventDefault();
      setPaused(!threePaused);
    }
  }

  function onResize() {
    resize();
  }

  // ── attach ───────────────────────────────────────────────────────────────

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  resize();
  resetBodies();
  ctx.clearRect(0, 0, W, H);
  animId = requestAnimationFrame(loop);

  // ── cleanup ──────────────────────────────────────────────────────────────

  return function cleanup() {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    canvas.removeEventListener('contextmenu', (_e) => {});
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    // Reset module flags so a fresh session starts clean.
    threeResetRequested = false;
    threeAddRequested = false;
    setPaused(false);
  };
}
