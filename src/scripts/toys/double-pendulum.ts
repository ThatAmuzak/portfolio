// ── Double Pendulum Chaos Toy ──────────────────────────────────────────
// Canvas 2D simulation of 10 double pendulums launched with a tiny
// initial-angle offset, demonstrating deterministic chaos through
// trajectory divergence.
//
// Physics:  RK4 integration of the Lagrangian equations of motion.
// Visual:   arms + bobs drawn each frame; a semi-transparent background
//           fill creates natural fading trails for both masses.
// Conforms to the CanvasToy interface (see src/lib/types.ts).

import type { CanvasToy } from '../../lib/types';

// ── types ───────────────────────────────────────────────────────────────────

interface Pendulum {
  /** Angle of first rod from downward vertical (rad) */
  theta1: number;
  /** Angle of second rod from downward vertical (rad) */
  theta2: number;
  /** Angular velocity of first rod (rad/s) */
  omega1: number;
  /** Angular velocity of second rod (rad/s) */
  omega2: number;
  /** Hue shift in degrees from the site accent colour */
  hueShift: number;
}

/** RGBA colour tuple (0-255 per channel). */
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ── configuration ───────────────────────────────────────────────────────────

const CFG = {
  /** Number of pendulums to simulate. */
  count: 10,
  /** Offset in θ₁ between consecutive pendulums (radians). */
  angleOffset: 1e-4,
  /** Base initial θ₁ for the first pendulum (radians).
   *  Picked randomly between angleMin and angleMax on each reset. */
  angleMin: 0.8,
  angleMax: 2.6,
  /** Rod 1 length as fraction of the smaller canvas dimension. */
  len1Frac: 0.25,
  /** Rod 2 length as fraction of the smaller canvas dimension. */
  len2Frac: 0.25,
  /** Mass of the first bob (normalised). */
  mass1: 1,
  /** Mass of the second bob (normalised). */
  mass2: 1,
  /** Gravity scale factor — actual g = rodLength * gravityScale.
   *  For a simple pendulum T = 2π√(l/g) = 2π/√(gravityScale).
   *  20 gives T ≈ 1.4 s for small oscillations. */
  gravityScale: 20,
  /** RK4 substeps per 60-fps frame. dt = 1/(60 * substeps). */
  substeps: 4,
  /** Alpha of the per-frame background fill — lower = longer trails. */
  trailAlpha: 0.02,
  /** Auto-reset interval in seconds. */
  resetInterval: 28,
  /** Total hue spread across all pendulums (degrees). */
  hueSpread: 80,
  /** Arm stroke width in logical pixels. */
  armWidth: 1.5,
  /** Bob radius in logical pixels. */
  bobRadius: 3.5,
  /** Pivot dot radius in logical pixels. */
  pivotRadius: 2,
};

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert HSL to RGB (all values 0–1 range).
 * h in [0, 360), s/l in [0, 1].
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
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

/**
 * Approximate hue (0-360) from an RGB triplet.
 * Used to derive a base hue from the accent colour.
 */
function rgbToHue(r: number, g: number, b: number): number {
  const rn = r / 255, gn = g / 255, bn = b / 255;
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

// ── physics ─────────────────────────────────────────────────────────────────

/**
 * Compute angular accelerations for a double pendulum.
 *
 * Equations from:
 *   https://www.myphysicslab.com/pendulum/double-pendulum-en.html
 *
 * @returns [alpha1, alpha2] — angular accelerations (rad/s²)
 */
function accelerations(
  theta1: number,
  theta2: number,
  omega1: number,
  omega2: number,
  l1: number,
  l2: number,
  m1: number,
  m2: number,
  g: number,
): [number, number] {
  const dTheta = theta1 - theta2;
  const sinD = Math.sin(dTheta);
  const cosD = Math.cos(dTheta);
  const sin1 = Math.sin(theta1);

  const den = 2 * m1 + m2 - m2 * Math.cos(2 * dTheta);

  const num1 =
    -g * (2 * m1 + m2) * sin1 -
    m2 * g * Math.sin(theta1 - 2 * theta2) -
    2 * sinD * m2 * (omega2 * omega2 * l2 + omega1 * omega1 * l1 * cosD);

  const alpha1 = num1 / (l1 * den);

  const num2 =
    2 *
    sinD *
    (omega1 * omega1 * l1 * (m1 + m2) +
      g * (m1 + m2) * Math.cos(theta1) +
      omega2 * omega2 * l2 * m2 * cosD);

  const alpha2 = num2 / (l2 * den);

  return [alpha1, alpha2];
}

/**
 * Single RK4 integration step for a double pendulum.
 * Mutates the pendulum state in place.
 */
function rk4Step(p: Pendulum, l1: number, l2: number, m1: number, m2: number, g: number, dt: number) {
  // State vector: [theta1, theta2, omega1, omega2]
  const s0 = [p.theta1, p.theta2, p.omega1, p.omega2];

  function deriv(t1: number, t2: number, o1: number, o2: number): [number, number, number, number] {
    const [a1, a2] = accelerations(t1, t2, o1, o2, l1, l2, m1, m2, g);
    return [o1, o2, a1, a2];
  }

  // k1
  const [k1t1, k1t2, k1o1, k1o2] = deriv(s0[0], s0[1], s0[2], s0[3]);

  // k2
  const s1 = [s0[0] + 0.5 * dt * k1t1, s0[1] + 0.5 * dt * k1t2, s0[2] + 0.5 * dt * k1o1, s0[3] + 0.5 * dt * k1o2];
  const [k2t1, k2t2, k2o1, k2o2] = deriv(s1[0], s1[1], s1[2], s1[3]);

  // k3
  const s2 = [s0[0] + 0.5 * dt * k2t1, s0[1] + 0.5 * dt * k2t2, s0[2] + 0.5 * dt * k2o1, s0[3] + 0.5 * dt * k2o2];
  const [k3t1, k3t2, k3o1, k3o2] = deriv(s2[0], s2[1], s2[2], s2[3]);

  // k4
  const s3 = [s0[0] + dt * k3t1, s0[1] + dt * k3t2, s0[2] + dt * k3o1, s0[3] + dt * k3o2];
  const [k4t1, k4t2, k4o1, k4o2] = deriv(s3[0], s3[1], s3[2], s3[3]);

  p.theta1 += (dt / 6) * (k1t1 + 2 * k2t1 + 2 * k3t1 + k4t1);
  p.theta2 += (dt / 6) * (k1t2 + 2 * k2t2 + 2 * k3t2 + k4t2);
  p.omega1 += (dt / 6) * (k1o1 + 2 * k2o1 + 2 * k3o1 + k4o1);
  p.omega2 += (dt / 6) * (k1o2 + 2 * k2o2 + 2 * k3o2 + k4o2);
}

/**
 * Compute the Cartesian position of both bobs given angles and rod lengths.
 * Pivot is at (px, py). Angles are measured from downward vertical.
 *
 *        px,py  ── pivot
 *          |
 *          |  rod1, θ₁
 *          |
 *          ●  bob1 (elbow)
 *          |
 *          |  rod2, θ₂
 *          |
 *          ●  bob2 (end)
 */
function bobPositions(
  theta1: number,
  theta2: number,
  l1: number,
  l2: number,
  px: number,
  py: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = px + l1 * Math.sin(theta1);
  const y1 = py + l1 * Math.cos(theta1);
  const x2 = x1 + l2 * Math.sin(theta2);
  const y2 = y1 + l2 * Math.cos(theta2);
  return { x1, y1, x2, y2 };
}

// ── colour helpers ──────────────────────────────────────────────────────────

/** Build a palette of `count` RGBA colours spread across `hueSpread` degrees. */
function buildPalette(
  baseHue: number,
  hueSpread: number,
  count: number,
  saturation: number,
  lightness: number,
  alpha: number,
): Rgba[] {
  const start = baseHue - hueSpread / 2;
  const palette: Rgba[] = [];
  for (let i = 0; i < count; i++) {
    const h = (start + (hueSpread * i) / (count - 1) + 360) % 360;
    const rgb = hslToRgb(h, saturation, lightness);
    palette.push({ ...rgb, a: alpha });
  }
  return palette;
}

function rgbaStr(c: Rgba): string {
  return `rgba(${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)},${c.a.toFixed(3)})`;
}

// ── toy definition ──────────────────────────────────────────────────────────

export const doublePendulumToy: CanvasToy = {
  id: 'double-pendulum',
  buttonLabel: 'Bored?',
  headerHtml:
    '&#x1F500; click to reset &nbsp;&middot;&nbsp; watch chaos unfold',
  footerHtml:
    '<strong class="text-ink-secondary">Double Pendulum Chaos</strong> &mdash; 10 pendulums launched with a 10<sup>&minus;4</sup>&nbsp;rad offset. Deterministic physics, unpredictable divergence.',
  start,
};

// ── simulation ──────────────────────────────────────────────────────────────

function start(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // ── mutable state ─────────────────────────────────────────────────────────

  let pendulums: Pendulum[] = [];
  let W = 0;    // logical width
  let H = 0;    // logical height
  let dpr = 1;
  let l1 = 0;   // rod 1 length in logical pixels
  let l2 = 0;   // rod 2 length in logical pixels
  let gravity = 0; // g = l1 * gravityScale (px/s²)
  let px = 0;   // pivot x
  let py = 0;   // pivot y

  let running = true;

  // Surface background RGB (for trail-fade rect).
  let surfBg: { r: number; g: number; b: number } = { r: 16, g: 18, b: 24 };

  // Pre-computed colour palette (rebuilt on theme change / resize).
  let palette: Rgba[] = [];

  let animId: number | null = null;
  let lastTime = 0;
  let accumulator = 0;
  let elapsedSinceReset = 0;
  const FIXED_DT = 1 / 60;

  // ── theme-aware background colour ─────────────────────────────────────────

  function readSurfBg() {
    const isDark = document.documentElement.classList.contains('dark');
    surfBg = isDark ? { r: 16, g: 18, b: 24 } : { r: 250, g: 251, b: 252 };
  }

  // ── palette ───────────────────────────────────────────────────────────────

  function rebuildPalette() {
    const accent = readAccentRgb();
    const baseHue = rgbToHue(accent.r, accent.g, accent.b);
    palette = buildPalette(baseHue, CFG.hueSpread, CFG.count, 0.75, 0.55, 0.9);
  }

  // ── initialise / reset pendulums ──────────────────────────────────────────

  function resetPendulums() {
    const baseTheta1 = CFG.angleMin + Math.random() * (CFG.angleMax - CFG.angleMin);
    const baseTheta2 = CFG.angleMin + Math.random() * (CFG.angleMax - CFG.angleMin);
    pendulums = [];
    for (let i = 0; i < CFG.count; i++) {
      pendulums.push({
        theta1: baseTheta1 + i * CFG.angleOffset,
        theta2: baseTheta2 + i * CFG.angleOffset,
        omega1: 0,
        omega2: 0,
        hueShift: (CFG.hueSpread * i) / (CFG.count - 1) - CFG.hueSpread / 2,
      });
    }
    elapsedSinceReset = 0;
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

    // Rod lengths scale with the smaller dimension.
    const dim = Math.min(W, H);
    l1 = dim * CFG.len1Frac;
    l2 = dim * CFG.len2Frac;

    // Gravity scales with rod length: g/l gives natural frequency.
    gravity = l1 * CFG.gravityScale;

    // Pivot at top-centre, offset down so arms have room to swing.
    px = W / 2;
    py = H * 0.29;

    readSurfBg();
    rebuildPalette();

    if (pendulums.length === 0) resetPendulums();
  }

  // ── physics update ────────────────────────────────────────────────────────

  function update(dt: number) {
    elapsedSinceReset += dt;

    // Auto-reset after the configured interval.
    if (elapsedSinceReset >= CFG.resetInterval) {
      resetPendulums();
      // Clear the canvas so old trails don't linger after reset.
      ctx.clearRect(0, 0, W, H);
      return;
    }

    const substepDt = dt / CFG.substeps;
    for (let s = 0; s < CFG.substeps; s++) {
      for (const p of pendulums) {
        rk4Step(p, l1, l2, CFG.mass1, CFG.mass2, gravity, substepDt);
      }
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  function render() {
    // 1. Fade old content by painting a semi-transparent background rect.
    ctx.fillStyle = `rgba(${surfBg.r},${surfBg.g},${surfBg.b},${CFG.trailAlpha})`;
    ctx.fillRect(0, 0, W, H);

    // 2. Draw pivot.
    ctx.fillStyle = 'var(--color-ink-tertiary)';
    ctx.beginPath();
    ctx.arc(px, py, CFG.pivotRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Draw each pendulum.
    for (let i = 0; i < pendulums.length; i++) {
      const p = pendulums[i];
      const col = palette[i];
      const { x1, y1, x2, y2 } = bobPositions(p.theta1, p.theta2, l1, l2, px, py);

      // Arm 1: pivot → bob1
      ctx.strokeStyle = rgbaStr({ ...col, a: 0.6 });
      ctx.lineWidth = CFG.armWidth;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // Arm 2: bob1 → bob2
      ctx.strokeStyle = rgbaStr({ ...col, a: 0.8 });
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Bob 1 (elbow) — smaller, slightly transparent
      ctx.fillStyle = rgbaStr({ ...col, a: 0.65 });
      ctx.beginPath();
      ctx.arc(x1, y1, CFG.bobRadius * 0.75, 0, Math.PI * 2);
      ctx.fill();

      // Bob 2 (end) — larger, more opaque
      ctx.fillStyle = rgbaStr(col);
      ctx.beginPath();
      ctx.arc(x2, y2, CFG.bobRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── game loop (fixed timestep) ────────────────────────────────────────────

  function loop(timestamp: number) {
    if (!running) return;

    const dt = lastTime
      ? Math.min((timestamp - lastTime) / 1000, 0.1)
      : FIXED_DT;
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

  function onClick(e: MouseEvent) {
    e.preventDefault();
    resetPendulums();
    ctx.clearRect(0, 0, W, H);
  }

  function onResize() {
    resize();
  }

  // ── attach ───────────────────────────────────────────────────────────────

  canvas.addEventListener('click', onClick);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', onResize);

  resize();
  // Clear once so we don't show a blank frame.
  ctx.clearRect(0, 0, W, H);
  animId = requestAnimationFrame(loop);

  // ── cleanup ──────────────────────────────────────────────────────────────

  return function cleanup() {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('contextmenu', (_e) => {});
    window.removeEventListener('resize', onResize);
  };
}