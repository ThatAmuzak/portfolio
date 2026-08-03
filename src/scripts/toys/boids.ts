// ── Boids Toy ─────────────────────────────────────────────────────────────
// Canvas 2D flocking simulation with mouse attraction/repulsion.
// Conforms to the CanvasToy interface (see src/lib/types.ts).
// Respects site accent colours and dark/light mode via CSS custom properties.
//
// Performance notes (diagnosed in bd portfolio-v2-3mr):
//  • Zero per-tick allocation in the hot loop: pooled spatial grid with
//    integer keys, steering applied in place, precomputed fill styles.
//  • Minimal draw calls: mature boids are batched into one path + one fill.
//  • The fixed-timestep loop drops backlog after long stalls instead of
//    fast-forwarding, so browser-level hiccups (GC, GPU warm-up) don't get
//    amplified into a catch-up burst.

import type { CanvasToy } from '../../lib/types';

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Frames since spawn — drives scale-in + fade-in animation. */
  spawnAge: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  /** 1 = expanding outward (repel), -1 = contracting inward (attract). */
  direction: 1 | -1;
}

const CFG = {
  count: 250,
  maxSpeed: 2.5,
  maxForce: 0.12,
  perceptionRadius: 60,
  separationRadius: 25,
  mouseRadius: 180,
  mouseForce: 0.28,
  boidSize: 12,
  borderMargin: 60,
  borderForce: 0.4,
  /** Boids spawned per update tick during the intro sequence. */
  spawnPerBatch: 8,
  /** Frames over which a new boid scales + fades in. */
  spawnAnimFrames: 20,
  /** Milliseconds between ripple spawns while mouse button is held. */
  rippleInterval: 140,
  /** Pixels per update-tick that a ripple expands/contracts. */
  rippleSpeed: 3.5,
  /** Starting radius for expanding ripples (repel) / ending radius for contracting (attract). */
  rippleStartRadius: 6,
  /** Opacity lost per frame. */
  rippleFadeRate: 0.018,
  /** Maximum ring thickness in pixels. */
  rippleLineWidth: 2.5,
};

export const boidsToy: CanvasToy = {
  id: 'boids',
  headerHtml:
    '&#x1f5b1;&#xfe0f; left-click to attract &nbsp;&middot;&nbsp; right-click to repel',
  footerHtml:
    '<strong class="text-ink-secondary">Boids</strong> &mdash; each triangle follows three simple rules: steer toward neighbours, match their direction, and keep their distance. Together they form lifelike flocks.',
  start,
};

/**
 * Attach the boids simulation to a <canvas> element.
 * Returns a cleanup function (call to stop & detach).
 */
function start(canvas: HTMLCanvasElement): () => void {
  // Non-null: we throw if getContext returns null, so ctx is always valid below
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // ── state ────────────────────────────────────────────────────────────────

  let boids: Boid[] = [];
  /** Target total boid count. Set by respawn(); boids appear in batches. */
  let totalSpawnTarget = 0;
  let W = 0; // logical width
  let H = 0; // logical height
  let dpr = 1;

  const mouse: { x: number | null; y: number | null; button: number } = { x: null, y: null, button: 0 };
  let ripples: Ripple[] = [];
  let lastRippleTime = 0;
  let animId: number | null = null;
  let running = true;
  let lastTime = 0;
  let accumulator = 0;
  const FIXED_DT = 1 / 60;
  /** Max update steps per frame — keeps backlog (and catch-up bursts) small. */
  const MAX_STEPS = 2;

  // ── colours ──────────────────────────────────────────────────────────────

  let _cachedColors: { r: number; g: number; b: number } | null = null;
  let _wasDark: boolean | null = null;

  function readColors() {
    const isDark = document.documentElement.classList.contains('dark');
    if (_cachedColors && _wasDark === isDark) return _cachedColors;
    _wasDark = isDark;
    const s = getComputedStyle(document.documentElement);
    _cachedColors = {
      r: +s.getPropertyValue('--color-accent-r').trim() || 8,
      g: +s.getPropertyValue('--color-accent-g').trim() || 145,
      b: +s.getPropertyValue('--color-accent-b').trim() || 178,
    };
    return _cachedColors;
  }

  let col = readColors();

  /**
   * Precomputed fill style per spawn age (0..spawnAnimFrames), so render()
   * never builds colour strings per boid per frame. Rebuilt on theme change.
   */
  let boidFills: string[] = [];

  function rebuildFills() {
    const { r, g, b } = col;
    boidFills = [];
    for (let age = 0; age <= CFG.spawnAnimFrames; age++) {
      const alpha = 0.3 + 0.7 * (age / CFG.spawnAnimFrames);
      boidFills.push(`rgba(${r},${g},${b},${alpha.toFixed(3)})`);
    }
  }
  rebuildFills();

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

    // Re-spawn boids if dimensions are sensible
    if (W > 0 && H > 0) respawn();
  }

  function respawn() {
    boids = [];
    totalSpawnTarget = CFG.count;
  }

  /** Create one batch of boids. Called from update() while still spawning. */
  function spawnBatch() {
    const remaining = totalSpawnTarget - boids.length;
    if (remaining <= 0) return;
    const batch = Math.min(CFG.spawnPerBatch, remaining);
    for (let i = 0; i < batch; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2;
      boids.push({
        x: CFG.borderMargin + Math.random() * (W - 2 * CFG.borderMargin),
        y: CFG.borderMargin + Math.random() * (H - 2 * CFG.borderMargin),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        spawnAge: 0,
      });
    }
  }

  // ── boid logic ───────────────────────────────────────────────────────────

  /**
   * Apply a steering force toward a desired velocity (not a position),
   * clamped to maxForce * weight. Mutates the boid in place — no allocation.
   */
  function applySteer(b: Boid, desiredVX: number, desiredVY: number, weight: number) {
    let dx = desiredVX - b.vx;
    let dy = desiredVY - b.vy;
    const mag = Math.sqrt(dx * dx + dy * dy);
    const cap = CFG.maxForce * weight;
    if (mag > cap) {
      dx = (dx / mag) * cap;
      dy = (dy / mag) * cap;
    }
    b.vx += dx;
    b.vy += dy;
  }

  // ── spatial grid (pooled — no per-tick allocation) ───────────────────────

  /** Cell coords can dip negative near edges; offset keeps keys positive. */
  const GRID_OFFSET = 512;
  const grid = new Map<number, number[]>();

  function cellKey(cx: number, cy: number) {
    return (cx + GRID_OFFSET) * 4096 + (cy + GRID_OFFSET);
  }

  /** Rebuild the grid in place: arrays are reused across ticks, just emptied. */
  function rebuildGrid() {
    for (const cell of grid.values()) cell.length = 0;
    const cs = CFG.perceptionRadius;
    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const key = cellKey(Math.floor(b.x / cs), Math.floor(b.y / cs));
      let cell = grid.get(key);
      if (!cell) { cell = []; grid.set(key, cell); }
      cell.push(i);
    }
  }

  function update() {
    const c = readColors();
    if (c !== col) {
      col = c;
      rebuildFills();
    }

    // Spawn boids in batches until we reach the target count.
    if (boids.length < totalSpawnTarget) {
      spawnBatch();
    }

    // Age spawn animation (increments whether or not we're still spawning).
    for (const b of boids) {
      if (b.spawnAge < CFG.spawnAnimFrames) b.spawnAge++;
    }

    // ── cursor ripples (spawn + animate, once per tick, not per boid) ──

    if (mouse.x !== null && mouse.y !== null && mouse.button) {
      const now = performance.now();
      if (now - lastRippleTime >= CFG.rippleInterval) {
        lastRippleTime = now;
        const dir: 1 | -1 = mouse.button === 1 ? -1 : 1;
        // Attract: rings contract inward → start at mouseRadius.
        // Repel: rings expand outward → start at small radius.
        const startR = dir === 1 ? CFG.rippleStartRadius : CFG.mouseRadius;
        ripples.push({ x: mouse.x, y: mouse.y, radius: startR, opacity: 0.55, direction: dir });
      }
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      const rip = ripples[i];
      rip.radius += rip.direction * CFG.rippleSpeed;
      rip.opacity -= CFG.rippleFadeRate;
      if (
        rip.opacity <= 0 ||
        (rip.direction === 1 && rip.radius > CFG.mouseRadius) ||
        (rip.direction === -1 && rip.radius < 2)
      ) {
        ripples.splice(i, 1);
      }
    }

    rebuildGrid();
    const cellSize = CFG.perceptionRadius;

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];

      // Accumulators
      let sepX = 0, sepY = 0, sepN = 0;
      let aliX = 0, aliY = 0, aliN = 0;
      let cohX = 0, cohY = 0, cohN = 0;

      const sepR2 = CFG.separationRadius * CFG.separationRadius;
      const perR2 = CFG.perceptionRadius * CFG.perceptionRadius;

      // Only check neighbors in this boid's cell + adjacent cells
      const cx = Math.floor(b.x / cellSize);
      const cy = Math.floor(b.y / cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get(cellKey(cx + dx, cy + dy));
          if (!cell) continue;
          for (let k = 0; k < cell.length; k++) {
            const j = cell[k];
            if (i === j) continue;
            const o = boids[j];
            const dx2 = b.x - o.x;
            const dy2 = b.y - o.y;
            const d2 = dx2 * dx2 + dy2 * dy2;

            if (d2 < sepR2 && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              sepX += dx2 / d;
              sepY += dy2 / d;
              sepN++;
            }
            if (d2 < perR2) {
              aliX += o.vx;
              aliY += o.vy;
              aliN++;
              cohX += o.x;
              cohY += o.y;
              cohN++;
            }
          }
        }
      }

      // Separation
      if (sepN > 0) {
        sepX /= sepN;
        sepY /= sepN;
        const mag = Math.sqrt(sepX * sepX + sepY * sepY) || 1;
        applySteer(b, (sepX / mag) * CFG.maxSpeed, (sepY / mag) * CFG.maxSpeed, 1.5);
      }

      // Alignment
      if (aliN > 0) {
        aliX /= aliN;
        aliY /= aliN;
        const mag = Math.sqrt(aliX * aliX + aliY * aliY) || 1;
        applySteer(b, (aliX / mag) * CFG.maxSpeed, (aliY / mag) * CFG.maxSpeed, 1);
      }

      // Cohesion
      if (cohN > 0) {
        cohX /= cohN;
        cohY /= cohN;
        const dx = cohX - b.x;
        const dy = cohY - b.y;
        const mag = Math.sqrt(dx * dx + dy * dy) || 1;
        applySteer(b, (dx / mag) * CFG.maxSpeed, (dy / mag) * CFG.maxSpeed, 1);
      }

      // Mouse interaction
      if (mouse.x !== null && mouse.y !== null && mouse.button) {
        const mdx = mouse.x - b.x;
        const mdy = mouse.y - b.y;
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < CFG.mouseRadius && md > 1) {
          if (mouse.button === 1) {
            // Attract: steer toward cursor
            applySteer(b, (mdx / md) * CFG.maxSpeed, (mdy / md) * CFG.maxSpeed, CFG.mouseForce / CFG.maxForce);
          } else if (mouse.button === 2) {
            // Repel: steer away from cursor
            applySteer(b, (-mdx / md) * CFG.maxSpeed, (-mdy / md) * CFG.maxSpeed, CFG.mouseForce / CFG.maxForce);
          }
        }
      }

      // Clamp speed
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > CFG.maxSpeed) {
        b.vx = (b.vx / sp) * CFG.maxSpeed;
        b.vy = (b.vy / sp) * CFG.maxSpeed;
      }

      // Move
      b.x += b.vx;
      b.y += b.vy;

      // Border repulsion — steer away from edges when close.
      // Penetration is capped at margin width to prevent velocity spikes.
      const bm = CFG.borderMargin;
      if (b.x < bm) b.vx += Math.min(bm - b.x, bm) / bm * CFG.borderForce;
      if (b.x > W - bm) b.vx -= Math.min(b.x - (W - bm), bm) / bm * CFG.borderForce;
      if (b.y < bm) b.vy += Math.min(bm - b.y, bm) / bm * CFG.borderForce;
      if (b.y > H - bm) b.vy -= Math.min(b.y - (H - bm), bm) / bm * CFG.borderForce;
    }
  }

  // ── rendering ────────────────────────────────────────────────────────────

  /**
   * Append the boid's triangle (pointing along its velocity) to the current
   * path. Vertices are computed directly — no save/translate/rotate/restore.
   */
  function traceTriangle(b: Boid, sz: number) {
    const angle = Math.atan2(b.vy, b.vx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Local-space vertices: nose (sz, 0), tail corners (-0.7sz, ∓0.5sz)
    const tx = -sz * 0.7;
    const ty = sz * 0.5;
    ctx.moveTo(b.x + sz * cos, b.y + sz * sin);
    ctx.lineTo(b.x + tx * cos + ty * sin, b.y + tx * sin - ty * cos);
    ctx.lineTo(b.x + tx * cos - ty * sin, b.y + tx * sin + ty * cos);
    ctx.closePath();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // Cursor ripples (rings behind boids)
    const { r, g, b: bl } = col;
    for (const rip of ripples) {
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${bl},${rip.opacity.toFixed(3)})`;
      ctx.lineWidth = CFG.rippleLineWidth;
      ctx.stroke();
    }

    const sz = CFG.boidSize;

    // Mature boids: batched into a single path + one fill.
    ctx.beginPath();
    let anyMature = false;
    for (const b of boids) {
      if (b.spawnAge < CFG.spawnAnimFrames) continue;
      traceTriangle(b, sz);
      anyMature = true;
    }
    if (anyMature) {
      ctx.fillStyle = boidFills[CFG.spawnAnimFrames];
      ctx.fill();
    }

    // Spawning boids: individual fills for the scale/fade-in (intro only).
    for (const b of boids) {
      if (b.spawnAge >= CFG.spawnAnimFrames) continue;
      const scale = 0.3 + 0.7 * (b.spawnAge / CFG.spawnAnimFrames);
      ctx.beginPath();
      traceTriangle(b, sz * scale);
      ctx.fillStyle = boidFills[b.spawnAge];
      ctx.fill();
    }
  }

  // ── loop (fixed timestep) ────────────────────────────────────────────────

  function loop(timestamp: number) {
    if (!running) return;

    const rawDt = lastTime ? (timestamp - lastTime) / 1000 : FIXED_DT;
    lastTime = timestamp;

    // Long stall (GC, GPU warm-up, hidden tab): drop the backlog entirely
    // instead of fast-forwarding through it. Otherwise cap accumulated time
    // so we never burst more than MAX_STEPS catch-up steps.
    if (rawDt > 0.25) {
      accumulator = 0;
    } else {
      accumulator = Math.min(accumulator + Math.min(rawDt, 0.1), FIXED_DT * MAX_STEPS);
    }

    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      update();
      accumulator -= FIXED_DT;
      steps++;
    }

    render();
    animId = requestAnimationFrame(loop);
  }

  // ── event handlers ───────────────────────────────────────────────────────

  function onMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onMouseLeave() {
    mouse.x = null;
    mouse.y = null;
  }

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    mouse.button = e.buttons; // bitmask: 1=left, 2=right, 3=both
  }

  function onMouseUp() {
    mouse.button = 0;
    ripples = [];
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
  }

  function onResize() {
    resize();
  }

  // ── attach ───────────────────────────────────────────────────────────────

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', onResize);

  resize();
  animId = requestAnimationFrame(loop);

  // ── cleanup ──────────────────────────────────────────────────────────────

  return function cleanup() {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseleave', onMouseLeave);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('resize', onResize);
  };
}
