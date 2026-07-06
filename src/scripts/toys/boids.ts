// ── Boids Toy ─────────────────────────────────────────────────────────────
// Canvas 2D flocking simulation with trails, mouse attraction/repulsion.
// Conforms to the CanvasToy interface (see src/lib/types.ts).
// Respects site accent colours and dark/light mode via CSS custom properties.

import type { CanvasToy } from '../../lib/types';

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  history: { x: number; y: number }[];
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
  trailLength: 7,
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
  buttonLabel: 'Bored?',
  buttonIcon: 'bazecvhf',
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

  // ── colours ──────────────────────────────────────────────────────────────

  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const r = s.getPropertyValue('--color-accent-r').trim() || '8';
    const g = s.getPropertyValue('--color-accent-g').trim() || '145';
    const b = s.getPropertyValue('--color-accent-b').trim() || '178';
    return { r: +r, g: +g, b: +b };
  }

  let col = readColors();

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
        history: [],
        spawnAge: 0,
      });
    }
  }

  // ── boid logic ───────────────────────────────────────────────────────────

  function steer(b: Boid, targetX: number, targetY: number, weight: number) {
    let dx = targetX - b.vx;
    let dy = targetY - b.vy;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > CFG.maxForce * weight) {
      dx = (dx / mag) * CFG.maxForce * weight;
      dy = (dy / mag) * CFG.maxForce * weight;
    }
    return { dx, dy };
  }

  // ── spatial grid ─────────────────────────────────────────────────

  function buildGrid() {
    const cellSize = CFG.perceptionRadius;
    const grid = new Map<string, number[]>();

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const cx = Math.floor(b.x / cellSize);
      const cy = Math.floor(b.y / cellSize);
      const key = cx + ',' + cy;
      let cell = grid.get(key);
      if (!cell) { cell = []; grid.set(key, cell); }
      cell.push(i);
    }
    return { grid, cellSize };
  }

  function update() {
    col = readColors();

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

    const { grid, cellSize } = buildGrid();

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];

      // Trail (only for fully spawned-in boids — looks weird during intro)
      if (b.spawnAge >= CFG.spawnAnimFrames) {
        b.history.push({ x: b.x, y: b.y });
        if (b.history.length > CFG.trailLength) b.history.shift();
      }

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
          const cell = grid.get((cx + dx) + ',' + (cy + dy));
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
        const s = steer(b, (sepX / mag) * CFG.maxSpeed, (sepY / mag) * CFG.maxSpeed, 1.5);
        b.vx += s.dx;
        b.vy += s.dy;
      }

      // Alignment
      if (aliN > 0) {
        aliX /= aliN;
        aliY /= aliN;
        const mag = Math.sqrt(aliX * aliX + aliY * aliY) || 1;
        const s = steer(b, (aliX / mag) * CFG.maxSpeed, (aliY / mag) * CFG.maxSpeed, 1);
        b.vx += s.dx;
        b.vy += s.dy;
      }

      // Cohesion
      if (cohN > 0) {
        cohX /= cohN;
        cohY /= cohN;
        const dx = cohX - b.x;
        const dy = cohY - b.y;
        const mag = Math.sqrt(dx * dx + dy * dy) || 1;
        const s = steer(b, (dx / mag) * CFG.maxSpeed, (dy / mag) * CFG.maxSpeed, 1);
        b.vx += s.dx;
        b.vy += s.dy;
      }

      // Mouse interaction
      if (mouse.x !== null && mouse.y !== null && mouse.button) {
        const mdx = mouse.x - b.x;
        const mdy = mouse.y - b.y;
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < CFG.mouseRadius && md > 1) {
          if (mouse.button === 1) {
            // Attract: steer toward cursor
            const s = steer(b, (mdx / md) * CFG.maxSpeed, (mdy / md) * CFG.maxSpeed, CFG.mouseForce / CFG.maxForce);
            b.vx += s.dx;
            b.vy += s.dy;
          } else if (mouse.button === 2) {
            // Repel: steer away from cursor
            const s = steer(b, (-mdx / md) * CFG.maxSpeed, (-mdy / md) * CFG.maxSpeed, CFG.mouseForce / CFG.maxForce);
            b.vx += s.dx;
            b.vy += s.dy;
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

      // Border repulsion — steer away from edges when close
      const bm = CFG.borderMargin;
      if (b.x < bm) b.vx += (bm - b.x) / bm * CFG.borderForce;
      if (b.x > W - bm) b.vx -= (b.x - (W - bm)) / bm * CFG.borderForce;
      if (b.y < bm) b.vy += (bm - b.y) / bm * CFG.borderForce;
      if (b.y > H - bm) b.vy -= (b.y - (H - bm)) / bm * CFG.borderForce;
    }
  }

  // ── rendering ────────────────────────────────────────────────────────────

  function drawBoid(b: Boid) {
    const angle = Math.atan2(b.vy, b.vx);
    const sz = CFG.boidSize;
    const { r, g: gn, b: bl } = col;

    // Scale-in + fade-in animation for newly spawned boids.
    const t = b.spawnAge < CFG.spawnAnimFrames
      ? b.spawnAge / CFG.spawnAnimFrames
      : 1.0;
    const scale = 0.3 + 0.7 * t;
    const alpha = 0.3 + 0.7 * t;

    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);

    // Isosceles triangle pointing right
    ctx.beginPath();
    ctx.moveTo(sz * scale, 0);
    ctx.lineTo(-sz * 0.7 * scale, -sz * 0.5 * scale);
    ctx.lineTo(-sz * 0.7 * scale, sz * 0.5 * scale);
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${gn},${bl},${alpha})`;
    ctx.fill();

    ctx.restore();
  }

  function render() {
    const { r, g: gn, b: bl } = col;

    ctx.clearRect(0, 0, W, H);

    // Trails
    for (const b of boids) {
      const h = b.history;
      for (let i = 0; i < h.length; i++) {
        const alpha = ((i + 1) / h.length) * 0.25;
        ctx.beginPath();
        ctx.arc(h[i].x, h[i].y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${gn},${bl},${alpha})`;
        ctx.fill();
      }
    }

    // Cursor ripples (rings behind boids)
    for (const rip of ripples) {
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${gn},${bl},${rip.opacity.toFixed(3)})`;
      ctx.lineWidth = CFG.rippleLineWidth;
      ctx.stroke();
    }

    // Boids on top
    for (const b of boids) {
      drawBoid(b);
    }
  }

  // ── loop (fixed timestep) ────────────────────────────────────────

  function loop(timestamp: number) {
    if (!running) return;

    // Delta time in seconds, capped to avoid spiral-of-death
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.1) : FIXED_DT;
    lastTime = timestamp;
    accumulator += dt;

    // Run fixed-step updates (max 3 per frame)
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 3) {
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
