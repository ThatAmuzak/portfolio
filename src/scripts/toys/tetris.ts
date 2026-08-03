// ── Tetris Auto-Solver Toy ───────────────────────────────────────────────
// Canvas 2D Tetris with AI auto-play using heuristic evaluation.
// Conforms to the CanvasToy interface (see src/lib/types.ts).
// Respects site accent colours and dark/light mode via CSS custom properties.
//
// The AI evaluates all possible placements (including hold + 1-piece
// lookahead) using a weighted linear combination of four heuristics:
// aggregate height, holes, bumpiness, and lines cleared — with a bonus
// for Tetris (4-line) clears to bias toward the flashiest play.

import type { CanvasToy } from '../../lib/types';
import { findBestMove, type BestMove } from './tetris-ai';

// ── Constants ────────────────────────────────────────────────────────────

export const COLS = 10;
const ROWS = 20;
const HIDDEN = 2;
export const TOTAL_ROWS = ROWS + HIDDEN;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
const ALL_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Each piece stored as rotation 0; other rotations computed via rotateCW().
const BASE_SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

// Pre-compute all 4 rotations for each piece type.
function rotateCW(m: number[][]): number[][] {
  const rows = m.length;
  const cols = m[0].length;
  const out: number[][] = [];
  for (let c = 0; c < cols; c++) {
    out[c] = [];
    for (let r = rows - 1; r >= 0; r--) {
      out[c][rows - 1 - r] = m[r][c];
    }
  }
  return out;
}

function buildRotations(shape: number[][]): number[][][] {
  const rots: number[][][] = [shape];
  let cur = shape;
  for (let i = 1; i < 4; i++) {
    cur = rotateCW(cur);
    // O-piece has only 1 unique rotation
    if (cur.length === shape.length && cur[0].length === shape[0].length &&
        cur.every((row, r) => row.every((v, c) => v === shape[r][c]))) {
      break;
    }
    rots.push(cur);
  }
  return rots;
}

export const ROTATIONS: Record<PieceType, number[][][]> = {} as any;
for (const t of ALL_TYPES) {
  ROTATIONS[t] = buildRotations(BASE_SHAPES[t]);
}

// ── 7-bag randomizer ─────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshBag(): PieceType[] {
  return shuffle(ALL_TYPES);
}

// ── Grid helpers ──────────────────────────────────────────────────────────

function emptyGrid(): number[][] {
  return Array.from({ length: TOTAL_ROWS }, () => new Array(COLS).fill(0));
}

export function collides(grid: number[][], shape: number[][], row: number, col: number): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const gr = row + r;
      const gc = col + c;
      if (gc < 0 || gc >= COLS || gr >= TOTAL_ROWS) return true;
      if (gr < 0) continue;
      if (grid[gr][gc]) return true;
    }
  }
  return false;
}

/** Returns the row the piece would land at if hard-dropped from (row, col). */
export function dropRow(grid: number[][], shape: number[][], row: number, col: number): number {
  let r = row;
  while (!collides(grid, shape, r + 1, col)) r++;
  return r;
}

export function lock(grid: number[][], shape: number[][], row: number, col: number): void {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const gr = row + r;
      const gc = col + c;
      if (gr >= 0 && gr < TOTAL_ROWS && gc >= 0 && gc < COLS) {
        grid[gr][gc] = 1;
      }
    }
  }
}

/** Clear full rows. Returns number of rows cleared. */
export function clearFullRows(grid: number[][]): number {
  let cleared = 0;
  for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
    if (grid[r].every((c) => c === 1)) {
      grid.splice(r, 1);
      grid.unshift(new Array(COLS).fill(0));
      cleared++;
      r++; // re-check this row index since rows shifted down
    }
  }
  return cleared;
}

// ── Animation state machine ──────────────────────────────────────────────

type AnimPhase =
  | 'deciding'    // AI computing best move
  | 'moving'      // sliding piece toward target column
  | 'dropping'    // piece dropping down
  | 'clearing'    // flashing cleared rows
  | 'pausing';    // brief pause between pieces

interface GameState {
  grid: number[][];
  bag: PieceType[];
  currentType: PieceType;
  nextType: PieceType;
  nextNextType: PieceType;
  heldType: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;

  // Piece position on the board
  pieceRow: number;
  pieceCol: number;
  pieceRotation: number;

  // AI target
  targetCol: number;
  targetRotation: number;
  shouldHold: boolean;
  holdDone: boolean;

  // Animation
  phase: AnimPhase;
  phaseTimer: number;
  clearingRows: number[];
}

function drawFromBag(state: GameState): PieceType {
  if (state.bag.length <= 2) {
    state.bag.push(...freshBag());
  }
  return state.bag.shift()!;
}

function initState(): GameState {
  const bag = freshBag();
  // Ensure we have at least 3 pieces queued
  while (bag.length < 3) bag.push(...freshBag());

  return {
    grid: emptyGrid(),
    bag,
    currentType: bag.shift()!,
    nextType: bag.shift()!,
    nextNextType: bag.shift()!,
    heldType: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    gameOver: false,
    pieceRow: 0,
    pieceCol: 0,
    pieceRotation: 0,
    targetCol: 0,
    targetRotation: 0,
    shouldHold: false,
    holdDone: false,
    phase: 'deciding',
    phaseTimer: 0,
    clearingRows: [],
  };
}

// ── Rendering ────────────────────────────────────────────────────────────

interface Colors {
  r: number;
  g: number;
  b: number;
}

function readColors(): Colors {
  const s = getComputedStyle(document.documentElement);
  return {
    r: +s.getPropertyValue('--color-accent-r').trim() || 8,
    g: +s.getPropertyValue('--color-accent-g').trim() || 145,
    b: +s.getPropertyValue('--color-accent-b').trim() || 178,
  };
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  col: Colors, alpha: number, inset: number,
) {
  const { r, g, b } = col;
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);

  // Subtle highlight on top-left edge
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.18})`;
  ctx.fillRect(x + inset, y + inset, size - inset * 2, 2);
  ctx.fillRect(x + inset, y + inset, 2, size - inset * 2);
}

function drawGhostBlock(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  col: Colors, inset: number,
) {
  const { r, g, b } = col;
  ctx.strokeStyle = `rgba(${r},${g},${b},0.25)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + inset + 0.5, y + inset + 0.5, size - inset * 2 - 1, size - inset * 2 - 1);
}

function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  col: Colors,
  cellSize: number,
  ox: number, // board origin x
  oy: number, // board origin y
) {
  const cs = cellSize;
  const inset = Math.max(1, cs * 0.07);
  const { r, g, b } = col;

  // ── Clear ──
  ctx.clearRect(0, 0, ctx.canvas.width / (window.devicePixelRatio || 1), ctx.canvas.height / (window.devicePixelRatio || 1));

  // ── Board background ──
  ctx.fillStyle = `rgba(${r},${g},${b},0.03)`;
  ctx.fillRect(ox, oy, COLS * cs, ROWS * cs);

  // ── Grid lines ──
  ctx.strokeStyle = `rgba(${r},${g},${b},0.06)`;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let r = 0; r <= ROWS; r++) {
    ctx.moveTo(ox, oy + r * cs);
    ctx.lineTo(ox + COLS * cs, oy + r * cs);
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.moveTo(ox + c * cs, oy);
    ctx.lineTo(ox + c * cs, oy + ROWS * cs);
  }
  ctx.stroke();

  // ── Locked blocks (visible rows only) ──
  for (let r = HIDDEN; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!state.grid[r][c]) continue;
      const isClearing = state.phase === 'clearing' && state.clearingRows.includes(r);
      const alpha = isClearing ? 0.25 + 0.75 * Math.abs(Math.sin(state.phaseTimer * 0.03)) : 1;
      drawBlock(ctx, ox + c * cs, oy + (r - HIDDEN) * cs, cs, col, alpha, inset);
    }
  }

  // ── Ghost piece ──
  if (!state.gameOver && state.phase !== 'clearing') {
    const shape = ROTATIONS[state.currentType][state.pieceRotation];
    const ghostRow = dropRow(state.grid, shape, state.pieceRow, state.pieceCol);
    if (ghostRow !== state.pieceRow) {
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const gr = ghostRow + r;
          const gc = state.pieceCol + c;
          if (gr < HIDDEN || gr >= TOTAL_ROWS || gc < 0 || gc >= COLS) continue;
          drawGhostBlock(ctx, ox + gc * cs, oy + (gr - HIDDEN) * cs, cs, col, inset);
        }
      }
    }
  }

  // ── Active piece ──
  if (!state.gameOver && state.currentType && state.phase !== 'clearing') {
    const shape = ROTATIONS[state.currentType][state.pieceRotation];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const gr = state.pieceRow + r;
        const gc = state.pieceCol + c;
        if (gr < HIDDEN || gr >= TOTAL_ROWS || gc < 0 || gc >= COLS) continue;
        drawBlock(ctx, ox + gc * cs, oy + (gr - HIDDEN) * cs, cs, col, 1, inset);
      }
    }
  }

  // ── Game over overlay ──
  if (state.gameOver) {
    ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
    ctx.fillRect(ox, oy, COLS * cs, ROWS * cs);
    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
    ctx.font = `${cs * 0.8}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', ox + (COLS * cs) / 2, oy + (ROWS * cs) / 2);
    // Score
    ctx.font = `${cs * 0.45}px "JetBrains Mono", monospace`;
    ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
    ctx.fillText(`${state.lines} lines · ${state.score} pts`, ox + (COLS * cs) / 2, oy + (ROWS * cs) / 2 + cs * 1.2);
    ctx.fillText('restarting…', ox + (COLS * cs) / 2, oy + (ROWS * cs) / 2 + cs * 1.9);
  }

  // ── Preview panels ──
  const previewX = ox + COLS * cs + cs * 0.8;
  const previewSize = cs * 1.2;

  // Next piece label
  ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
  ctx.font = `${cs * 0.32}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('NEXT', previewX, oy + cs * 0.6);

  // Next piece
  if (!state.gameOver) {
    drawPreviewPiece(ctx, state.nextType, previewX, oy + cs, previewSize, col);
  }

  // Hold piece label
  ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
  ctx.fillText('HOLD', previewX, oy + cs * 7);

  // Hold piece
  if (state.heldType) {
    drawPreviewPiece(ctx, state.heldType, previewX, oy + cs * 7.5, previewSize, col);
  }

  // ── Stats ──
  const statsX = previewX;
  let statsY = oy + cs * 12;
  ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
  ctx.font = `${cs * 0.32}px "JetBrains Mono", monospace`;
  const stats: [string, string | number][] = [
    ['SCORE', state.score],
    ['LINES', state.lines],
    ['LEVEL', state.level],
  ];
  for (const [label, value] of stats) {
    ctx.fillText(label, statsX, statsY);
    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
    ctx.fillText(String(value), statsX, statsY + cs * 0.55);
    ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
    statsY += cs * 1.6;
  }
}

function drawPreviewPiece(
  ctx: CanvasRenderingContext2D,
  type: PieceType,
  px: number, py: number,
  cellSize: number,
  col: Colors,
) {
  const shape = ROTATIONS[type][0];
  const previewCell = Math.max(4, cellSize * 0.55);
  const inset = Math.max(0.5, previewCell * 0.07);
  const { r, g, b } = col;

  for (let row = 0; row < shape.length; row++) {
    for (let c = 0; c < shape[row].length; c++) {
      if (!shape[row][c]) continue;
      const x = px + c * previewCell;
      const y = py + row * previewCell;
      ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
      ctx.fillRect(x + inset, y + inset, previewCell - inset * 2, previewCell - inset * 2);
      ctx.fillStyle = `rgba(255,255,255,0.12)`;
      ctx.fillRect(x + inset, y + inset, previewCell - inset * 2, 1.5);
      ctx.fillRect(x + inset, y + inset, 1.5, previewCell - inset * 2);
    }
  }
}

// ── Scoring ──────────────────────────────────────────────────────────────

function scoringForLines(lines: number, level: number): number {
  const base = [0, 100, 300, 500, 800];
  return (base[lines] || 0) * level;
}

// ── Toy definition ───────────────────────────────────────────────────────

// Module-level mutable state (survives across toy starts/stops).
let solverSpeed = 150; // ms between actions
let solverPaused = false;

// Need to access these from renderHeaderControls
let pauseLabel: HTMLSpanElement | null = null;
let pauseBtn: HTMLButtonElement | null = null;
let pauseThumb: HTMLSpanElement | null = null;
let speedSlider: HTMLInputElement | null = null;
let speedValueEl: HTMLSpanElement | null = null;

function updatePauseButton() {
  if (!pauseBtn || !pauseThumb || !pauseLabel) return;
  const col = readColors();
  if (solverPaused) {
    pauseLabel.textContent = 'Paused';
    pauseBtn.style.backgroundColor = 'transparent';
    pauseBtn.style.borderColor = 'var(--color-ink-tertiary)';
    pauseThumb.style.left = '2px';
    pauseThumb.style.backgroundColor = 'var(--color-ink-tertiary)';
    pauseBtn.setAttribute('aria-checked', 'false');
  } else {
    pauseLabel.textContent = 'Playing';
    pauseBtn.style.backgroundColor = `rgb(${col.r},${col.g},${col.b})`;
    pauseBtn.style.borderColor = `rgb(${col.r},${col.g},${col.b})`;
    pauseThumb.style.left = '18px';
    pauseThumb.style.backgroundColor = '#fff';
    pauseBtn.setAttribute('aria-checked', 'true');
  }
}

function togglePause() {
  solverPaused = !solverPaused;
  updatePauseButton();
}

function renderHeaderControls(container: HTMLElement): () => void {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-center gap-3';

  // Pause toggle
  const pauseWrapper = document.createElement('div');
  pauseWrapper.className = 'flex items-center gap-2';

  pauseLabel = document.createElement('span');
  pauseLabel.textContent = 'Playing';
  pauseLabel.className = 'text-[12px] text-ink-tertiary font-mono select-none';
  pauseWrapper.appendChild(pauseLabel);

  pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.setAttribute('role', 'switch');
  pauseBtn.setAttribute('aria-checked', 'true');
  pauseBtn.style.cssText =
    'position:relative;display:inline-block;width:36px;height:20px;' +
    'border-radius:10px;border:1px solid;cursor:pointer;flex-shrink:0;' +
    'transition:background-color 0.25s,border-color 0.25s;';
  pauseBtn.addEventListener('click', togglePause);

  pauseThumb = document.createElement('span');
  pauseThumb.style.cssText =
    'position:absolute;top:2px;width:14px;height:14px;border-radius:50%;' +
    'transition:left 0.25s,background-color 0.25s;';
  pauseBtn.appendChild(pauseThumb);
  pauseWrapper.appendChild(pauseBtn);
  wrapper.appendChild(pauseWrapper);

  // Speed slider
  const speedWrapper = document.createElement('div');
  speedWrapper.className = 'flex items-center gap-1.5';

  speedSlider = document.createElement('input');
  speedSlider.type = 'range';
  speedSlider.min = '20';
  speedSlider.max = '500';
  speedSlider.value = String(solverSpeed);
  speedSlider.className = 'w-20 h-1 accent-accent cursor-pointer';
  speedSlider.title = 'AI speed';

  speedValueEl = document.createElement('span');
  speedValueEl.textContent = solverSpeed + 'ms';
  speedValueEl.className = 'text-[11px] text-ink-tertiary font-mono select-none w-10 text-right';

  speedSlider.addEventListener('input', () => {
    solverSpeed = parseInt(speedSlider!.value);
    if (speedValueEl) speedValueEl.textContent = solverSpeed + 'ms';
  });

  speedWrapper.appendChild(speedSlider);
  speedWrapper.appendChild(speedValueEl);
  wrapper.appendChild(speedWrapper);

  container.appendChild(wrapper);

  solverPaused = false;
  updatePauseButton();

  return () => {
    wrapper.remove();
    pauseLabel = null;
    pauseBtn = null;
    pauseThumb = null;
    speedSlider = null;
    speedValueEl = null;
  };
}

export const tetrisSolverToy: CanvasToy = {
  id: 'tetris-solver',
  headerHtml:
    '&#x1f3ae; AI plays Tetris, maximizing Tetris clears &nbsp;&middot;&nbsp; speed &rarr;',
  footerHtml:
    '<strong class="text-ink-secondary">Tetris Auto-Solver</strong> &mdash; the AI evaluates every possible placement using four heuristics (height, holes, bumpiness, lines) with a bonus for 4-line Tetris clears. Watch it stack and clear.',
  start,
  renderHeaderControls,
};

// ── Main start function ──────────────────────────────────────────────────

function start(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')!;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  let state = initState();
  let running = true;
  let animId: number | null = null;
  let lastTime = 0;
  let accumulator = 0;

  let W = 0, H = 0, dpr = 1;
  let cellSize = 20;
  let ox = 0, oy = 0;

  let col = readColors();

  // Auto-restart timer for game over
  let gameOverTimer = 0;
  const GAME_OVER_RESTART_MS = 3000;

  // ── Resize ────────────────────────────────────────────────────────────

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

    // Compute cell size: board should fit with room for preview on the right
    // and clearance for the footer/prev-next nav bar at the bottom
    const BOTTOM_PAD = 48;
    const previewWidth = W * 0.2;
    const boardAreaW = W - previewWidth;
    cellSize = Math.min(
      boardAreaW / (COLS + 1),
      (H - BOTTOM_PAD) / ROWS,
    );
    cellSize = Math.max(12, Math.floor(cellSize));

    // Center the board, with extra space at bottom for the nav bar
    const boardW = COLS * cellSize;
    const boardH = ROWS * cellSize;
    ox = Math.max(4, (boardAreaW - boardW) / 2);
    oy = Math.max(4, (H - BOTTOM_PAD - boardH) / 2);
  }

  // ── AI decision ────────────────────────────────────────────────────────

  function aiDecide() {
    // Guard against re-entrant hold loops
    if (state.phase !== 'deciding') return;

    const move = findBestMove(
      state.grid,
      state.currentType,
      state.nextType,
      state.nextNextType,
      state.heldType,
      state.canHold,
    );

    state.targetCol = move.col;
    state.targetRotation = move.rotation;
    state.shouldHold = move.shouldHold;
    state.holdDone = false;

    // If we should hold and haven't done it yet
    if (move.shouldHold && !state.holdDone && state.canHold) {
      state.holdDone = true;
      state.canHold = false;

      if (state.heldType === null) {
        // Hold current; next piece becomes current
        state.heldType = state.currentType;
        state.currentType = state.nextType;
        state.nextType = state.nextNextType;
        state.nextNextType = drawFromBag(state);
      } else {
        // Swap current with held
        const tmp = state.heldType;
        state.heldType = state.currentType;
        state.currentType = tmp;
      }

      // Re-evaluate after hold
      aiDecide();
      return;
    }

    // Set the piece to the target rotation
    state.pieceRotation = move.rotation;

    // Start moving toward target
    state.phase = 'moving';
    state.phaseTimer = 0;
  }

  // ── Execute one animation step ─────────────────────────────────────────

  /** Fixed tick interval for animation (smooth movement, independent of speed slider). */
  const ANIM_TICK = 30; // ms

  function stepAnimation() {
    if (state.gameOver) return;

    switch (state.phase) {
      case 'deciding': {
        aiDecide();
        break;
      }

      case 'moving': {
        // Move piece horizontally toward target column, 1 cell per anim tick (~30ms)
        const shape = ROTATIONS[state.currentType][state.pieceRotation];
        if (state.pieceCol < state.targetCol) {
          if (!collides(state.grid, shape, state.pieceRow, state.pieceCol + 1)) {
            state.pieceCol++;
          } else {
            state.phase = 'dropping';
          }
        } else if (state.pieceCol > state.targetCol) {
          if (!collides(state.grid, shape, state.pieceRow, state.pieceCol - 1)) {
            state.pieceCol--;
          } else {
            state.phase = 'dropping';
          }
        } else {
          state.phase = 'dropping';
        }
        break;
      }

      case 'dropping': {
        // Hard drop: snap to landing row and lock
        const shape = ROTATIONS[state.currentType][state.pieceRotation];
        const dr = dropRow(state.grid, shape, state.pieceRow, state.pieceCol);
        state.pieceRow = dr;
        lock(state.grid, shape, state.pieceRow, state.pieceCol);

        // Check which rows became full
        const toCheck: number[] = [];
        for (let r = 0; r < shape.length; r++) {
          const gr = state.pieceRow + r;
          if (gr >= 0 && gr < TOTAL_ROWS) toCheck.push(gr);
        }
        state.clearingRows = [];
        for (const r of toCheck) {
          if (r >= 0 && r < TOTAL_ROWS && state.grid[r].every(c => c === 1)) {
            state.clearingRows.push(r);
          }
        }

        if (state.clearingRows.length > 0) {
          state.phase = 'clearing';
          state.phaseTimer = 0;
        } else {
          // No clears — brief pause then spawn next piece
          state.phase = 'pausing';
          state.phaseTimer = 0;
        }
        break;
      }

      case 'clearing': {
        state.phaseTimer += ANIM_TICK;
        // Flash for ~300ms, then clear + spawn
        if (state.phaseTimer >= 300) {
          const cleared = clearFullRows(state.grid);
          state.lines += cleared;
          state.score += scoringForLines(cleared, state.level);
          state.level = Math.floor(state.lines / 10) + 1;
          state.clearingRows = [];
          state.phase = 'pausing';
          state.phaseTimer = 0;
        }
        break;
      }

      case 'pausing': {
        // Wait for solverSpeed ms of pause, then spawn next piece
        state.phaseTimer += ANIM_TICK;
        if (state.phaseTimer >= solverSpeed) {
          spawnNextPiece();
        }
        break;
      }
    }
  }

  function spawnNextPiece() {
    state.currentType = state.nextType;
    state.nextType = state.nextNextType;
    state.nextNextType = drawFromBag(state);
    state.canHold = true;
    state.holdDone = false;

    const shape = ROTATIONS[state.currentType][0];
    const spawnCol = Math.floor((COLS - shape[0].length) / 2);
    const spawnRow = -shape.findIndex(r => r.some(v => v === 1));

    if (collides(state.grid, shape, spawnRow, spawnCol)) {
      state.gameOver = true;
      gameOverTimer = 0;
      return;
    }

    state.pieceRow = spawnRow;
    state.pieceCol = spawnCol;
    state.pieceRotation = 0;

    // Spawn and immediately go to AI decision
    state.phase = 'deciding';
    state.phaseTimer = 0;
  }

  // ── Game loop ──────────────────────────────────────────────────────────

  function loop(timestamp: number) {
    if (!running) return;

    const dt = lastTime ? Math.min(timestamp - lastTime, 100) : ANIM_TICK;
    lastTime = timestamp;

    if (!solverPaused && !state.gameOver) {
      accumulator += dt;

      // Run animation steps at fixed ANIM_TICK rate for smooth movement
      while (accumulator >= ANIM_TICK) {
        accumulator -= ANIM_TICK;
        stepAnimation();
        if (state.gameOver) break;
      }
    }

    // Handle game over auto-restart
    if (state.gameOver) {
      gameOverTimer += dt;
      if (gameOverTimer >= GAME_OVER_RESTART_MS) {
        state = initState();
        // Re-init spawn
        const shape = ROTATIONS[state.currentType][0];
        state.pieceRow = -shape.findIndex(r => r.some(v => v === 1));
        state.pieceCol = Math.floor((COLS - shape[0].length) / 2);
        state.phase = 'pausing';
        state.phaseTimer = 0;
        accumulator = 0;
        lastTime = timestamp;
        gameOverTimer = 0;
      }
    }

    col = readColors();
    resize();
    render(ctx, state, col, cellSize, ox, oy);

    animId = requestAnimationFrame(loop);
  }

  // ── Event handlers ─────────────────────────────────────────────────────

  function onResize() {
    resize();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePause();
    }
  }

  // ── Attach ─────────────────────────────────────────────────────────────

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);

  resize();

  // Initial spawn
  const initShape = ROTATIONS[state.currentType][0];
  state.pieceRow = -initShape.findIndex(r => r.some(v => v === 1));
  state.pieceCol = Math.floor((COLS - initShape[0].length) / 2);
  state.phase = 'deciding';

  lastTime = performance.now();
  accumulator = 0;
  animId = requestAnimationFrame(loop);

  // ── Cleanup ────────────────────────────────────────────────────────────

  return function cleanup() {
    running = false;
    if (animId) cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
  };
}