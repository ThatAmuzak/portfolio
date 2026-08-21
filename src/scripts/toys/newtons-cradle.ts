// ── Newton's Cradle Toy ───────────────────────────────────────────────
// Canvas 2D cradle with 5 equal pendulums on the same pivot row. Drag an
// end ball back along its arc and release — it swings in and the impulse
// propagates (1-in → 1-out). A fast flick seeds an angular velocity
// ("throw"); a slow lift-and-release is a "drop".
//
// Optional "heavy middle ball" cheat mode breaks the equal-mass symmetry.
// Conforms to the CanvasToy interface (see src/lib/types.ts).
// Respects site accent colours and dark/light mode via CSS custom properties.

import type { CanvasToy } from '../../lib/types';

// ── configuration ───────────────────────────────────────────────────────────

const CFG = {
  /** Number of balls. Fixed at 5 (classic cradle). */
  count: 5,
  /** Ball radius as a fraction of the smaller canvas dimension. */
  ballRadiusFrac: 0.05,
  /** Rod length as a fraction of the smaller canvas dimension. */
  rodFrac: 0.5,
  /**
   * g/L for the simple pendulum (L cancels in the equation of motion).
   * T = 2π/√(gravityScale). 16 → T ≈ 1.57 s ("steel" feel ~1.5–2 s).
   */
  gravityScale: 16,
  /** Max lift angle when dragging (rad). ~75°. */
  maxLift: (75 * Math.PI) / 180,
  /** Middle-ball mass when the heavy toggle is on (× normal). */
  heavyMass: 6,
  /** Substeps per fixed frame — prevents fast balls tunnelling. */
  substeps: 6,
  /** String stroke width in logical pixels. */
  armWidth: 1.5,
  /** Grab radius as a multiple of ball radius. */
  grabRadiusMul: 1.9,
  /** Impact-flash ring lifetime in seconds. */
  flashDuration: 0.25,
} as const;

// ── module-level state (shared between renderHeaderControls & start) ──
// Mirrors the game-of-life.ts pattern: controls are rebuilt on each open;
// live refs live at module scope so the toggles can reach the simulation.
let ncPaused = false;
let ncHeavyOn = false;
let ncApplyHeavy: ((on: boolean) => void) | null = null;
let ncReset: (() => void) | null = null;

// ── types / helpers ─────────────────────────────────────────────────────────

interface Ball {
  theta: number; // from downward vertical (rad)
  omega: number; // angular velocity (rad/s)
  mass: number;
}

function readAccentRgb(): { r: number; g: number; b: number } {
  const s = getComputedStyle(document.documentElement);
  return {
    r: +s.getPropertyValue('--color-accent-r').trim() || 8,
    g: +s.getPropertyValue('--color-accent-g').trim() || 145,
    b: +s.getPropertyValue('--color-accent-b').trim() || 178,
  };
}

function clampOmega(o: number): number {
  const max = Math.sqrt(CFG.gravityScale * 2 * (1 - Math.cos(CFG.maxLift)));
  return Math.max(-max, Math.min(max, o));
}

/** Blend an accent channel toward white (mix=1) or black (mix=0). */
function blend(a: number, mix: number): number {
  return Math.round(mix >= 0 ? (mix === 0 ? a : a + (255 - a) * mix) : a * (1 + mix));
}

// ── header controls (renderHeaderControls pattern) ─────────────────────────

function Toggle(
  parent: HTMLElement,
  onLabel: string,
  offLabel: string,
  onChange: (on: boolean) => void,
): () => void {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-1.5';

  const label = document.createElement('span');
  label.className = 'text-[12px] text-ink-tertiary font-mono select-none';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('role', 'switch');
  btn.style.cssText =
    'position:relative;display:inline-block;width:36px;height:20px;' +
    'border-radius:10px;border:1px solid;cursor:pointer;flex-shrink:0;' +
    'transition:background-color 0.25s,border-color 0.25s;';

  const thumb = document.createElement('span');
  thumb.style.cssText =
    'position:absolute;top:2px;width:14px;height:14px;border-radius:50%;' +
    'transition:left 0.25s,background-color 0.25s;';
  btn.appendChild(thumb);

  let on = false;
  function paint() {
    const accent = readAccentRgb();
    if (on) {
      label.textContent = onLabel;
      btn.style.backgroundColor = `rgb(${accent.r},${accent.g},${accent.b})`;
      btn.style.borderColor = `rgb(${accent.r},${accent.g},${accent.b})`;
      thumb.style.left = '18px';
      thumb.style.backgroundColor = '#fff';
      btn.setAttribute('aria-checked', 'true');
    } else {
      label.textContent = offLabel;
      btn.style.backgroundColor = 'transparent';
      btn.style.borderColor = 'var(--color-ink-tertiary)';
      thumb.style.left = '2px';
      thumb.style.backgroundColor = 'var(--color-ink-tertiary)';
      btn.setAttribute('aria-checked', 'false');
    }
  }
  btn.addEventListener('click', () => {
    on = !on;
    btn.setAttribute('aria-label', on ? onLabel : offLabel);
    paint();
    onChange(on);
  });

  wrap.appendChild(label);
  wrap.appendChild(btn);
  parent.appendChild(wrap);
  paint();

  return () => {
    wrap.remove();
  };
}

function renderHeaderControls(container: HTMLElement): () => void {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center gap-2';

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.title = 'Reset cradle';
  resetBtn.textContent = '⟲';
  resetBtn.className =
    'text-[13px] text-ink-tertiary hover:text-accent transition-colors ' +
    'w-7 h-7 rounded-[6px] flex items-center justify-center cursor-pointer bg-transparent border-0';
  resetBtn.addEventListener('click', () => {
    ncReset?.();
  });
  wrapper.appendChild(resetBtn);

  // Pause / play switch (mirror GOL). "On" = label "Playing".
  const pauseCleanup = Toggle(wrapper, 'Playing', 'Paused', (on) => {
    ncPaused = !on;
  });

  // Heavy-ball switch: middle ball gets CFG.heavyMass when on.
  const heavyCleanup = Toggle(wrapper, 'Heavy', 'Equal', (on) => {
    ncHeavyOn = on;
    ncApplyHeavy?.(on);
  });

  container.appendChild(wrapper);

  return () => {
    resetBtn.remove();
    pauseCleanup?.();
    heavyCleanup?.();
  };
}


// ── toy definition ──────────────────────────────────────────────────────────

export const newtonsCradleToy: CanvasToy = {
  id: 'newtons-cradle',
  headerHtml:
    '&#x1F18A; drag the end ball &nbsp;&middot;&nbsp; release to swing &nbsp;&middot;&nbsp; <kbd>R</kbd> reset &nbsp;&middot;&nbsp; <kbd>Space</kbd> pause',
  footerHtml:
    '<strong class="text-ink-secondary">Newton&rsquo;s Cradle</strong> &mdash; equal masses pass on the impulse &mdash; 1-in, 1-out. Flick fast to throw, or hand it slowly and let it drop. Toggle the middle ball heavy to break the symmetry.',
  start,
  renderHeaderControls,
};

// ── simulation ──────────────────────────────────────────────────────────────

function start(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('Canvas 2D context unavailable');


  // ── mutable state ─────────────────────────────────────────────────────────

  let balls: Ball[] = [];
  let W = 0;
  let H = 0;
  let dpr = 1;
  let rod = 0; // rod length (px)
  let r = 0; // ball radius (px)
  let spacing = 0; // pivot spacing = 2r (rest-touching)
  let pivotY = 0;
  let cx = 0;

  // Drag state (end ball only).
  let dragIdx = -1;
  let mouseX = 0;
  let mouseY = 0;
  let dragPrevTheta = 0;
  let dragPrevTime = 0;

  // Impact-flash ring (optional polish).
  let flash = { x: 0, y: 0, r: 0, t: -1 };

  let running = true;
  let animId: number | null = null;
  let lastTime = 0;
  let accumulator = 0;
  const FIXED_DT = 1 / 60;

  // ── geometry ─────────────────────────────────────────────────────────────

  function pivotX(i: number): number {
    return cx + (i - (CFG.count - 1) / 2) * spacing;
  }
  function posX(i: number): number {
    return pivotX(i) + rod * Math.sin(balls[i].theta);
  }
  function posY(i: number): number {
    return pivotY + rod * Math.cos(balls[i].theta);
  }
  function velX(i: number): number {
    return rod * Math.cos(balls[i].theta) * balls[i].omega;
  }

  // ── reset ────────────────────────────────────────────────────────────────

  function reset() {
    balls = [];
    for (let i = 0; i < CFG.count; i++) {
      balls.push({
        theta: 0,
        omega: 0,
        mass: i === Math.floor(CFG.count / 2) && ncHeavyOn ? CFG.heavyMass : 1,
      });
    }
    dragIdx = -1;
    flash.t = -1;
  }

  // Expose so renderHeaderControls can reset and toggle heavy.
  ncReset = reset;
  ncApplyHeavy = (on: boolean) => {
    if (balls[Math.floor(CFG.count / 2)] && on) {
      balls[Math.floor(CFG.count / 2)].mass = CFG.heavyMass;
    } else if (balls[Math.floor(CFG.count / 2)]) {
      balls[Math.floor(CFG.count / 2)].mass = 1;
    }
  };

  // ── resize ───────────────────────────────────────────────────────────────

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

    const dim = Math.min(W, H);
    r = dim * CFG.ballRadiusFrac;
    rod = dim * CFG.rodFrac;
    spacing = 2 * r;
    cx = W / 2;
    pivotY = H * 0.2;

    if (balls.length === 0) reset();
  }

  // ── physics update (fixed timestep, multiple substeps) ────────────────

  function update(dt: number) {
    const subDt = dt / CFG.substeps;

    for (let s = 0; s < CFG.substeps; s++) {
      // 1. Integrate each non-held pendulum independently.
      for (let i = 0; i < CFG.count; i++) {
        if (i === dragIdx) continue;
        const b = balls[i];
        b.omega += -CFG.gravityScale * Math.sin(b.theta) * subDt;
        b.omega = clampOmega(b.omega);
        b.theta += b.omega * subDt;
      }

      // 2. Held ball follows the cursor along its clamped arc.
      if (dragIdx >= 0) {
        const i = dragIdx;
        const dx = mouseX - pivotX(i);
        const dy = mouseY - pivotY;
        let t = Math.atan2(dx, dy);
        t = Math.max(-CFG.maxLift, Math.min(CFG.maxLift, t));
        const now = performance.now();
        const dTheta = t - dragPrevTheta;
        const dT = Math.max((now - dragPrevTime) / 1000, 1e-4);
        dragPrevTheta = t;
        dragPrevTime = now;
        balls[i].theta = t;
        balls[i].omega = clampOmega(dTheta / dT);
      }

      // 3. Resolve contacts — discrete pairwise velocity exchange.
      const contFlip = new Array(CFG.count).fill(false) as boolean[];
      for (let i = 0; i < CFG.count - 1; i++) {
        if (contFlip[i] || contFlip[i + 1]) continue;
        if (i === dragIdx || i + 1 === dragIdx) continue;

        const gap = posX(i + 1) - posX(i);
        const approaching = velX(i + 1) - velX(i) < 0;
        if (gap <= spacing && approaching) {
          collide(i, i + 1);
          contFlip[i] = contFlip[i + 1] = true;
          flash = {
            x: (posX(i) + posX(i + 1)) / 2,
            y: (posY(i) + posY(i + 1)) / 2,
            r: r,
            t: 0,
          };
        }
      }
    }
  }

  /** Elastic velocity exchange between adjacent balls i (left) and j (right). */
  function collide(i: number, j: number) {
    const m1 = balls[i].mass;
    const m2 = balls[j].mass;
    const v1 = balls[i].omega;
    const v2 = balls[j].omega;

    if (m1 === m2) {
      balls[i].omega = clampOmega(v2);
      balls[j].omega = clampOmega(v1);
    } else {
      balls[i].omega = clampOmega(((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2));
      balls[j].omega = clampOmega(((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2));
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  function render() {
    ctx.clearRect(0, 0, W, H);

    const accent = readAccentRgb();
    const isDark = document.documentElement.classList.contains('dark');

    // Support bar above the pivots (faint).
    ctx.strokeStyle = isDark ? 'rgba(92,100,120,0.5)' : 'rgba(136,144,160,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pivotX(0) - r, pivotY);
    ctx.lineTo(pivotX(CFG.count - 1) + r, pivotY);
    ctx.stroke();

    // Strings.
    ctx.strokeStyle = 'var(--color-ink-tertiary)';
    ctx.lineWidth = CFG.armWidth;
    for (let i = 0; i < CFG.count; i++) {
      ctx.beginPath();
      ctx.moveTo(pivotX(i), pivotY);
      ctx.lineTo(posX(i), posY(i));
      ctx.stroke();
    }

    // Balls — steel gradient offset from the accent palette.
    for (let i = 0; i < CFG.count; i++) {
      const x = posX(i);
      const y = posY(i);
      const top = `rgb(${blend(accent.r, 0.55)},${blend(accent.g, 0.55)},${blend(accent.b, 0.55)})`;
      const bottom = `rgb(${blend(accent.r, -0.45)},${blend(accent.g, -0.45)},${blend(accent.b, -0.45)})`;
      const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      grad.addColorStop(0, top);
      grad.addColorStop(0.6, `rgb(${accent.r},${accent.g},${accent.b})`);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Impact flash ring (optional) — expand & fade.
    if (flash.t >= 0 && flash.t < CFG.flashDuration) {
      const p = flash.t / CFG.flashDuration;
      ctx.strokeStyle = `rgba(${accent.r},${accent.g},${accent.b},${(1 - p) * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, r + p * r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── loop (fixed timestep with backlog drop) ─────────────────────────────

  function loop(timestamp: number) {
    if (!running) return;

    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : FIXED_DT;
    lastTime = timestamp;
    accumulator += dt;

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 4) {
      if (!ncPaused) update(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }

    if (flash.t >= 0 && flash.t < CFG.flashDuration) flash.t += dt;

    render();
    animId = requestAnimationFrame(loop);
  }

  // ── event handlers ───────────────────────────────────────────────────────

  function grabIndex(x: number, y: number): number {
    const grabR = r * CFG.grabRadiusMul;
    const grabR2 = grabR * grabR;
    for (let i = 0; i < CFG.count; i++) {
      const dx = x - posX(i);
      const dy = y - posY(i);
      if (dx * dx + dy * dy <= grabR2) return i;
    }
    return -1;
  }

  /** Convert a MouseEvent to canvas-local coordinates (logical px). */
  function canvasMouse(e: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e: MouseEvent) {
    const m = canvasMouse(e);
    mouseX = m.x;
    mouseY = m.y;
    if (e.button !== 0) return;
    const idx = grabIndex(mouseX, mouseY);
    if (idx >= 0) {
      dragIdx = idx;
      dragPrevTheta = balls[idx].theta;
      dragPrevTime = performance.now();
    }
  }

  function onMouseMove(e: MouseEvent) {
    const m = canvasMouse(e);
    mouseX = m.x;
    mouseY = m.y;
  }

  function onMouseUp(_e: MouseEvent) {
    // Held ball keeps its estimated ω — flick → throw, slow → drop.
    const released = dragIdx;
    dragIdx = -1;
    if (released >= 0) {
      balls[released].omega = clampOmega(balls[released].omega);
    }
  }

  function onResize() {
    resize();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      reset();
    } else if (e.key === ' ') {
      e.preventDefault();
      ncPaused = !ncPaused;
    }
  }

  // ── attach ───────────────────────────────────────────────────────────────

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    reset();
  });
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);

  resize();
  ctx.clearRect(0, 0, W, H);
  animId = requestAnimationFrame(loop);

  // ── cleanup ──────────────────────────────────────────────────────────────

  return function cleanup() {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('contextmenu', (_e) => {});
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    ncReset = null;
    ncApplyHeavy = null;
  };
}