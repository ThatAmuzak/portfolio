// ── Conway's Game of Life Toy ───────────────────────────────────────────
// Canvas 2D cellular automaton with click-to-paint and right-click reset.
// Conforms to the CanvasToy interface (see src/lib/types.ts).
// Respects site accent colours and dark/light mode via CSS custom properties.

import type { CanvasToy } from '../../lib/types';

const CFG = {
  cellSize: 20,
  tickInterval: 111, // ms (~9 generations/sec)
  initDensityMin: 0.2,
  initDensityMax: 0.4,
  deadDotRadius: 1.0,
};

// ── module-level state (shared between renderHeaderControls & start) ──

let golPaused = false;
let golPauseLabel: HTMLSpanElement | null = null;
let golPauseBtn: HTMLButtonElement | null = null;
let golPauseThumb: HTMLSpanElement | null = null;

// Accumulator + lastFrameTime live here so golTogglePause can reset them.
let golAccumulator = 0;
let golLastFrameTime = 0;

function readAccentColors() {
  const s = getComputedStyle(document.documentElement);
  const r = s.getPropertyValue('--color-accent-r').trim() || '8';
  const g = s.getPropertyValue('--color-accent-g').trim() || '145';
  const b = s.getPropertyValue('--color-accent-b').trim() || '178';
  return { r: +r, g: +g, b: +b };
}

function golUpdatePauseButton() {
  if (!golPauseBtn || !golPauseThumb || !golPauseLabel) return;
  const { r, g, b } = readAccentColors();
  if (golPaused) {
    golPauseLabel.textContent = 'Paused';
    golPauseBtn.style.backgroundColor = 'transparent';
    golPauseBtn.style.borderColor = 'var(--color-ink-tertiary)';
    golPauseThumb.style.left = '2px';
    golPauseThumb.style.backgroundColor = 'var(--color-ink-tertiary)';
    golPauseBtn.setAttribute('aria-checked', 'false');
    golPauseBtn.setAttribute('aria-label', 'Play simulation');
  } else {
    golPauseLabel.textContent = 'Playing';
    golPauseBtn.style.backgroundColor = `rgb(${r},${g},${b})`;
    golPauseBtn.style.borderColor = `rgb(${r},${g},${b})`;
    golPauseThumb.style.left = '18px';
    golPauseThumb.style.backgroundColor = '#fff';
    golPauseBtn.setAttribute('aria-checked', 'true');
    golPauseBtn.setAttribute('aria-label', 'Pause simulation');
  }
}

function golTogglePause() {
  golPaused = !golPaused;
  // Reset the timestep accumulator so we don't burst-catch-up on unpause.
  if (!golPaused) {
    golAccumulator = 0;
    golLastFrameTime = 0;
  }
  golUpdatePauseButton();
}

function renderHeaderControls(container: HTMLElement): () => void {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center gap-2';

  // Text label
  golPauseLabel = document.createElement('span');
  golPauseLabel.textContent = 'Playing';
  golPauseLabel.className = 'text-[12px] text-ink-tertiary font-mono select-none';
  wrapper.appendChild(golPauseLabel);

  // Track (pill-shaped button)
  golPauseBtn = document.createElement('button');
  golPauseBtn.type = 'button';
  golPauseBtn.setAttribute('role', 'switch');
  golPauseBtn.setAttribute('aria-checked', 'true');
  golPauseBtn.setAttribute('aria-label', 'Pause simulation');
  golPauseBtn.style.cssText =
    'position:relative;display:inline-block;width:36px;height:20px;' +
    'border-radius:10px;border:1px solid;cursor:pointer;flex-shrink:0;' +
    'transition:background-color 0.25s,border-color 0.25s;';
  golPauseBtn.addEventListener('click', golTogglePause);

  // Thumb (sliding circle)
  golPauseThumb = document.createElement('span');
  golPauseThumb.style.cssText =
    'position:absolute;top:2px;width:14px;height:14px;border-radius:50%;' +
    'transition:left 0.25s,background-color 0.25s;';
  golPauseBtn.appendChild(golPauseThumb);

  wrapper.appendChild(golPauseBtn);
  container.appendChild(wrapper);

  // Initial playing state
  golPaused = false;
  golUpdatePauseButton();

  return () => {
    wrapper.remove();
    golPauseLabel = null;
    golPauseBtn = null;
    golPauseThumb = null;
  };
}

export const gameOfLifeToy: CanvasToy = {
  id: 'game-of-life',
  buttonLabel: 'Bored?',
  headerHtml:
    '&#x1f5b1;&#xfe0f; left-click to paint &nbsp;&middot;&nbsp; right-click to reset &nbsp;&middot;&nbsp; <kbd>Z</kbd> pause &nbsp;&middot;&nbsp; <kbd>C</kbd> clear',
  footerHtml:
    '<strong class="text-ink-secondary">Conway\'s Game of Life</strong> &mdash; four simple rules governing birth and death. Check out "Game of Life Generators" for special starting shapes',
  start,
  renderHeaderControls,
};

/**
 * Attach Conway's Game of Life to a <canvas> element.
 * Returns a cleanup function (call to stop & detach).
 */
function start(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // ── state ────────────────────────────────────────────────────────────────

  let grid: number[][] = []; // current generation (0/1)
  let rows = 0;
  let cols = 0;
  let W = 0; // logical pixel width
  let H = 0; // logical pixel height
  let dpr = 1;

  let running = true;
  let animId: number | null = null;

  // Reset module-level timestep state on each start (in case last session left crumbs).
  golAccumulator = 0;
  golLastFrameTime = 0;

  const mouse = { down: false };

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

  // ── resize & initialise ──────────────────────────────────────────────────

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
      cols = Math.floor(W / CFG.cellSize);
      rows = Math.floor(H / CFG.cellSize);
      randomize();
    }
  }

  /** Fill the grid with a random soup (20-40% density). */
  function randomize() {
    const density = CFG.initDensityMin + Math.random() * (CFG.initDensityMax - CFG.initDensityMin);

    grid = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        grid[r][c] = Math.random() < density ? 1 : 0;
      }
    }
  }

  // ── Game of Life logic ───────────────────────────────────────────────────

  /** Count live neighbours in the current grid (edges are dead — no wrapping). */
  function countNeighbors(g: number[][], r: number, c: number) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          count += g[nr][nc];
        }
      }
    }
    return count;
  }

  /** Advance the simulation by one generation. */
  function step() {
    const prev = grid;
    const next: number[][] = [];
    for (let r = 0; r < rows; r++) {
      next[r] = [];
      for (let c = 0; c < cols; c++) {
        const n = countNeighbors(prev, r, c);
        if (prev[r][c] === 1) {
          next[r][c] = n === 2 || n === 3 ? 1 : 0;
        } else {
          next[r][c] = n === 3 ? 1 : 0;
        }
      }
    }
    grid = next;
  }

  /** Set all cells to dead. */
  function clearBoard() {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        grid[r][c] = 0;
      }
    }
  }

  /** Paint a single cell alive. */
  function paintCell(r: number, c: number) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      grid[r][c] = 1;
    }
  }

  // ── rendering ────────────────────────────────────────────────────────────

  function render() {
    const { r, g, b } = col;
    const cs = CFG.cellSize;
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = `rgba(${r},${g},${b},0.07)`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let row = 0; row <= rows; row++) {
      const y = row * cs;
      ctx.moveTo(0, y);
      ctx.lineTo(cols * cs, y);
    }
    for (let c = 0; c <= cols; c++) {
      const x = c * cs;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rows * cs);
    }
    ctx.stroke();

    // Cells
    const inset = 0.5;
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cs;
        const y = row * cs;

        if (grid[row][c]) {
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x + inset, y + inset, cs - inset * 2, cs - inset * 2);
        } else {
          ctx.fillStyle = `rgba(${r},${g},${b},0.05)`;
          ctx.beginPath();
          ctx.arc(x + cs / 2, y + cs / 2, CFG.deadDotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // ── loop (fixed timestep) ────────────────────────────────────────────────

  function loop(now: number) {
    if (!running) return;

    const dt = golLastFrameTime
      ? Math.min((now - golLastFrameTime) / 1000, 0.1)
      : CFG.tickInterval / 1000;
    golLastFrameTime = now;
    golAccumulator += dt * 1000;

    if (!golPaused) {
      let steps = 0;
      while (golAccumulator >= CFG.tickInterval && steps < 3) {
        step();
        golAccumulator -= CFG.tickInterval;
        steps++;
      }
    }

    col = readColors();
    render();
    animId = requestAnimationFrame(loop);
  }

  // ── event helpers ────────────────────────────────────────────────────────

  function getCell(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      row: Math.floor((e.clientY - rect.top) / CFG.cellSize),
      col: Math.floor((e.clientX - rect.left) / CFG.cellSize),
    };
  }

  // ── event handlers ───────────────────────────────────────────────────────

  function onMouseDown(e: MouseEvent) {
    if (e.button === 0) {
      e.preventDefault();
      mouse.down = true;
      const { row, col } = getCell(e);
      paintCell(row, col);
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!mouse.down) return;
    const { row, col } = getCell(e);
    paintCell(row, col);
  }

  function onMouseUp(e: MouseEvent) {
    if (e.button === 0) mouse.down = false;
  }

  function onMouseLeave() {
    mouse.down = false;
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    randomize();
  }

  function onResize() {
    resize();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      clearBoard();
    } else if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      golTogglePause();
    }
  }

  // ── attach ───────────────────────────────────────────────────────────────

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);

  resize();
  golLastFrameTime = performance.now();
  golAccumulator = 0;
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
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
  };
}
