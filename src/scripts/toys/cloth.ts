// ── Cloth Physics Toy (Verlet integration) ─────────────────────────────
// Canvas 2D sheet of points sewn together with stiff threads. Gravity
// drapes the cloth; the two top corners are pinned with slack so it sags.
//
// Physics: classic Verlet integration (position-only, no velocities):
//   newPos = pos + (pos - prevPos) + accel·dt²
//   then constraints are relaxed iteratively (stiffness = #iterations).
// Interactions:
//   • Left-click + drag  → grab an individual point, follow the cursor.
//   • Right-click + drag → cut any thread segment the cursor sweeps near.
//   • Header button or <kbd>R</kbd> → reset to a fresh, fully-sewn cloth.
// Conforms to the CanvasToy interface (see src/lib/types.ts).

import type { CanvasToy } from '../../lib/types';

const CFG = {
  cols: 10,
  rows: 10,
  /** Natural spacing between adjacent grid points, in abstract units. */
  restLength: 1,
  /** Distance between the two pinned top corners, in units. 8 < natural
   *  (cols-1)·restLength = 9, so the top edge is compressed → visible slack. */
  pinnedSpan: 8,
  /** Constraint-relaxation passes per timestep. Higher = stiffer cloth.
   *  Kept low (3) so the fabric is flexible/drapey rather than rigid —
   *  with too many passes every neighbour snaps back to rest length each
   *  frame and the cloth holds like a rigid sheet. */
  constraintIterations: 3,
  /** Gravity acceleration in px/s². */
  gravity: 2200,
  /** Velocity damping applied each timestep (1 = none). */
  damping: 0.985,
  /** Nearest-point grab radius, in units. */
  grabRadiusUnits: 1.6,
  /** Thread-cutting sweep radius, in units. Kept small so cutting is
   *  precise at the thread level (≈⅓ of the grid spacing) — a large radius
   *  severs every thread near an intersection and chews through the weave. */
  cutRadiusUnits: 0.35,
  /** Top margin for the pinned row, as a fraction of canvas height. */
  topMarginFrac: 0.1,
  /** Natural cloth width as a fraction of the canvas width. */
  widthFrac: 0.5,
  /** Thread stroke width in logical pixels. */
  lineWidth: 1.5,
  /** Radius of the small point dots, in logical pixels. */
  pointRadius: 1.8,
};

interface Point {
  x: number;
  y: number;
  px: number; // previous position (Verlet)
  py: number;
  pinned: boolean;
}

interface Constraint {
  a: number; // index into points[]
  b: number;
  rest: number;
  active: boolean;
}

// ── module-level shared state (bridges renderHeaderControls & start) ──────
// Only one cloth toy runs at a time (CanvasToy cleans up before switching),
// so a single shared flag is safe — same approach as game-of-life.ts.

let clothResetRequested = false;

/** Background/ink fallback accent (used if CSS vars are unavailable). */
function readAccentRgb(): { r: number; g: number; b: number } {
  const s = getComputedStyle(document.documentElement);
  return {
    r: +s.getPropertyValue('--color-accent-r').trim() || 8,
    g: +s.getPropertyValue('--color-accent-g').trim() || 145,
    b: +s.getPropertyValue('--color-accent-b').trim() || 178,
  };
}

/** Distance from point p to segment ab. */
function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function buildHeaderControls(container: HTMLElement): () => void {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center gap-2';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Reset';
  btn.setAttribute('aria-label', 'Reset cloth');
  btn.style.cssText =
    'font-family:monospace;font-size:12px;color:var(--color-ink-secondary);' +
    'background:transparent;border:1px solid var(--color-border);' +
    'border-radius:6px;padding:2px 10px;cursor:pointer;flex-shrink:0;' +
    'transition:border-color 0.2s,color 0.2s;';
  btn.addEventListener('mouseenter', () => {
    btn.style.color = 'var(--color-accent)';
    btn.style.borderColor = 'var(--color-accent)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = '';
    btn.style.borderColor = '';
  });
  btn.addEventListener('click', () => {
    clothResetRequested = true;
  });

  wrapper.appendChild(btn);
  container.appendChild(wrapper);

  return () => {
    wrapper.remove();
  };
}

export const clothToy: CanvasToy = {
  id: 'cloth',
  headerHtml:
    '&#x2702;&#xfe0f; left-drag a point &nbsp;&middot;&nbsp; right-drag to cut threads &nbsp;&middot;&nbsp; <kbd>R</kbd> reset',
  footerHtml:
    '<strong class="text-ink-secondary">Verlet Cloth</strong> &mdash; a 10&times;10 sheet of points sewn together with stiff threads. Slack between the two pinned corners tucks into a gentle drape. Cut the threads and watch it unravel.',
  start,
  renderHeaderControls: buildHeaderControls,
};

/**
 * Attach the cloth simulation to a <canvas> element.
 * Returns a cleanup function (call to stop & detach).
 */
function start(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // ── state ────────────────────────────────────────────────────────────────

  let points: Point[] = [];
  let constraints: Constraint[] = [];

  let W = 0; // logical width
  let H = 0; // logical height
  let dpr = 1;
  let scale = 1; // px per 1 abstract unit
  let accent = readAccentRgb();

  let running = true;
  let animId: number | null = null;

  // Mouse interaction state.
  let leftDown = false;
  let rightDown = false;
  let grabIndex = -1;
  let grabX = 0;
  let grabY = 0;

  // ── cloth construction ───────────────────────────────────────────────────

  /**
   * (Re)build the cloth from scratch: fresh points + full-horizontal/vertical
   * connectivity matching the current pixel scale.
   */
  function buildCloth() {
    const cols = CFG.cols;
    const rows = CFG.rows;

    points = [];
    constraints = [];

    // Where the two pins sit (pulled in by `pinnedSpan` so there's slack).
    const pinLeftX = W / 2 - (CFG.pinnedSpan / 2) * scale;
    const pinRightX = W / 2 + (CFG.pinnedSpan / 2) * scale;
    const topY = H * CFG.topMarginFrac;
    // Where the natural (uncompressed) cloth would start, so the sag reads as
    // evenly distributed.
    const startX = pinLeftX;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * CFG.restLength * scale;
        const y = topY + r * CFG.restLength * scale;
        const pinned = (r === 0 && c === 0) || (r === 0 && c === cols - 1);
        // Pinned corners sit exactly at the two pins.
        const px = pinned && c === cols - 1 ? pinRightX : x;
        const py = pinned && r === 0 ? topY : y;
        points.push({
          x: px, y: py,
          px: px, py: py,
          pinned,
        });
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (c < cols - 1) {
          constraints.push({
            a: idx, b: idx + 1,
            rest: CFG.restLength * scale,
            active: true,
          });
        }
        if (r < rows - 1) {
          constraints.push({
            a: idx, b: idx + cols,
            rest: CFG.restLength * scale,
            active: true,
          });
        }
      }
    }

    // Nothing is being interacted with after a reset.
    grabIndex = -1;
    leftDown = false;
    rightDown = false;
  }

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

    if (W > 0 && H > 0) {
      scale = (W * CFG.widthFrac) / ((CFG.cols - 1) * CFG.restLength);
      buildCloth();
    }
  }

  // ── physics ──────────────────────────────────────────────────────────────

  function physicsStep(dt: number) {
    const dt2 = dt * dt;

    // If we grabbed a point, pin it to the cursor (zero velocity each step so
    // it won't snap violently; gravity takes over cleanly once released).
    if (grabIndex >= 0) {
      const gp = points[grabIndex];
      if (gp) {
        gp.px = grabX; gp.py = grabY;
        gp.x = grabX;  gp.y = grabY;
      }
    }

    // Verlet integration (gravity only affects y).
    for (const p of points) {
      if (p.pinned) continue;
      const vx = (p.x - p.px) * CFG.damping;
      const vy = (p.y - p.py) * CFG.damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + CFG.gravity * dt2;
    }

    // Iteratively relax constraints (stiffness). Pinned points stay fixed.
    for (let i = 0; i < CFG.constraintIterations; i++) {
      for (const c of constraints) {
        if (!c.active) continue;
        const pa = points[c.a];
        const pb = points[c.b];
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) continue; // avoid division by zero
        const diff = (dist - c.rest) / dist;
        const ox = dx * diff * 0.5;
        const oy = dy * diff * 0.5;
        if (!pa.pinned) { pa.x += ox; pa.y += oy; }
        if (!pb.pinned) { pb.x -= ox; pb.y -= oy; }
      }
    }
  }

  // ── interaction helpers ──────────────────────────────────────────────────

  function logicalPos(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Find the nearest non-pinned point within the grab radius, or -1. */
  function findGrabTarget(mx: number, my: number): number {
    const r = CFG.grabRadiusUnits * scale;
    let best = -1;
    let bestD = r * r;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.pinned) continue;
      const ddx = p.x - mx;
      const ddy = p.y - my;
      const d = ddx * ddx + ddy * ddy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Cut every active thread segment passing near the cursor. */
  function cutAt(mx: number, my: number) {
    const r = CFG.cutRadiusUnits * scale;
    for (const c of constraints) {
      if (!c.active) continue;
      const pa = points[c.a];
      const pb = points[c.b];
      if (distToSegment(mx, my, pa.x, pa.y, pb.x, pb.y) < r) {
        c.active = false;
      }
    }
  }

  // ── rendering ────────────────────────────────────────────────────────────

  function render() {
    ctx.clearRect(0, 0, W, H);

    const line = `rgba(${accent.r},${accent.g},${accent.b},0.75)`;
    ctx.strokeStyle = line;
    ctx.lineWidth = CFG.lineWidth;

    // Threads.
    ctx.beginPath();
    for (const c of constraints) {
      if (!c.active) continue;
      const pa = points[c.a];
      const pb = points[c.b];
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();

    // Points (subtle dots); pinned corners as solid accent circles.
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.pinned) {
        ctx.fillStyle = `rgb(${accent.r},${accent.g},${accent.b})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, CFG.pointRadius + 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (i === grabIndex) {
        ctx.fillStyle = 'var(--color-ink-secondary)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, CFG.pointRadius + 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${accent.r},${accent.g},${accent.b},0.35)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, CFG.pointRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ── loop (fixed timestep) ────────────────────────────────────────────────

  let lastTime = 0;
  let accumulator = 0;
  const FIXED_DT = 1 / 60;

  function loop(timestamp: number) {
    if (!running) return;

    const dt = lastTime
      ? Math.min((timestamp - lastTime) / 1000, 0.1)
      : FIXED_DT;
    lastTime = timestamp;
    accumulator += dt;

    // Handle a pending reset (R key / header button) once, before stepping.
    if (clothResetRequested) {
      clothResetRequested = false;
      buildCloth();
      accumulator = 0;
    }

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 3) {
      physicsStep(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }

    render();
    animId = requestAnimationFrame(loop);
  }

  // ── event handlers ───────────────────────────────────────────────────────

  function onMouseDown(e: MouseEvent) {
    const { x, y } = logicalPos(e);
    if (e.button === 0) {
      e.preventDefault();
      leftDown = true;
      const target = findGrabTarget(x, y);
      if (target >= 0) {
        grabIndex = target;
        grabX = x;
        grabY = y;
      }
    } else if (e.button === 2) {
      e.preventDefault();
      rightDown = true;
      cutAt(x, y);
    }
  }

  function onMouseMove(e: MouseEvent) {
    const { x, y } = logicalPos(e);
    if (leftDown && grabIndex >= 0) {
      grabX = x;
      grabY = y;
    }
    if (rightDown) {
      cutAt(x, y);
    }
  }

  function onMouseUp(e: MouseEvent) {
    if (e.button === 0) {
      leftDown = false;
      grabIndex = -1;
    }
    if (e.button === 2) rightDown = false;
  }

  function onMouseLeave() {
    leftDown = false;
    rightDown = false;
    grabIndex = -1;
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      clothResetRequested = true;
    }
  }

  function onResize() {
    resize();
  }

  // ── attach ───────────────────────────────────────────────────────────────

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  resize();
  lastTime = 0;
  accumulator = 0;
  animId = requestAnimationFrame(loop);

  // ── cleanup ──────────────────────────────────────────────────────────────

  return function cleanup() {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('mouseleave', onMouseLeave);
    canvas.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    // Reset shared state so the next start starts clean.
    clothResetRequested = false;
  };
}
