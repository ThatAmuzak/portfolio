// ── Tetris AI Solver ─────────────────────────────────────────────────────
// Heuristic evaluation + best-move search for the Tetris auto-player.
// Imported by tetris-solver.ts; depends on shared constants and grid
// helpers exported from that file.

import {
  COLS,
  TOTAL_ROWS,
  ROTATIONS,
  collides,
  dropRow,
  lock,
  clearFullRows,
  type PieceType,
} from './tetris';

// ── Heuristic weights ────────────────────────────────────────────────────
// Weights from GA-optimized literature (Code My Road / Cornell).
// tetrisBonus is added when linesCleared === 4 to favor Tetris setups.

const W = {
  height: -0.510066,
  lines: 0.760666,
  holes: -0.35663,
  bumpiness: -0.184483,
  tetrisBonus: 3.0, // extra score when 4 lines are cleared at once
};

// ── Heuristic helpers ────────────────────────────────────────────────────

/** Column heights (index of highest filled cell from bottom, 0 if empty). */
function colHeights(grid: number[][]): number[] {
  const h = new Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (grid[r][c]) {
        h[c] = TOTAL_ROWS - r;
        break;
      }
    }
  }
  return h;
}

/** Aggregate height = sum of all column heights. */
function aggregateHeight(heights: number[]): number {
  return heights.reduce((s, h) => s + h, 0);
}

/** Count holes: empty cells that have a filled cell somewhere above them. */
function countHoles(grid: number[][]): number {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let seenBlock = false;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (grid[r][c]) {
        seenBlock = true;
      } else if (seenBlock) {
        holes++;
      }
    }
  }
  return holes;
}

/** Bumpiness: sum of absolute differences between adjacent column heights. */
function bumpiness(heights: number[]): number {
  let b = 0;
  for (let i = 0; i < COLS - 1; i++) {
    b += Math.abs(heights[i] - heights[i + 1]);
  }
  return b;
}

/** Score a board state after placing a piece. Lower is better for negative-weighted features. */
function evaluateBoard(grid: number[][], linesCleared: number): number {
  const heights = colHeights(grid);
  const ah = aggregateHeight(heights);
  const holes = countHoles(grid);
  const bump = bumpiness(heights);

  let score = W.height * ah + W.holes * holes + W.bumpiness * bump;
  score += W.lines * linesCleared;
  if (linesCleared === 4) score += W.tetrisBonus;
  return score;
}

// ── Placement generation ─────────────────────────────────────────────────

export interface Placement {
  type: PieceType;
  rotation: number;
  col: number;
  dropRow: number;
  linesCleared: number;
  score: number;
}

/** All legal (rotation, col, dropRow) placements for a piece type on a grid. */
function allPlacements(grid: number[][], type: PieceType): Placement[] {
  const rots = ROTATIONS[type];
  const results: Placement[] = [];

  // Track unique (dropRow, col, shape) to deduplicate (e.g. O-piece)
  const seen = new Set<string>();

  for (let ri = 0; ri < rots.length; ri++) {
    const shape = rots[ri];
    const shapeW = shape[0].length;
    for (let col = -2; col <= COLS - shapeW + 2; col++) {
      // Start piece in hidden rows, drop it
      const spawnRow = -shape.findIndex(r => r.some(v => v === 1));
      if (collides(grid, shape, spawnRow, col)) continue;

      const dr = dropRow(grid, shape, spawnRow, col);

      // Simulate lock + clear on a copy
      const copy = grid.map(r => [...r]);
      lock(copy, shape, dr, col);
      const lines = clearFullRows(copy);

      // Deduplicate
      const key = `${ri}|${col}|${dr}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ type, rotation: ri, col, dropRow: dr, linesCleared: lines, score: 0 });
    }
  }
  return results;
}

/** Score every placement and return them sorted best-first. */
function scoredPlacements(grid: number[][], type: PieceType): Placement[] {
  const placements = allPlacements(grid, type);
  for (const p of placements) {
    const copy = grid.map(r => [...r]);
    lock(copy, ROTATIONS[p.type][p.rotation], p.dropRow, p.col);
    clearFullRows(copy); // already counted in linesCleared; ensure clean state
    p.score = evaluateBoard(copy, p.linesCleared);
  }
  placements.sort((a, b) => b.score - a.score);
  return placements;
}

// ── Best-move search with hold + 1-piece lookahead ───────────────────────

export interface BestMove {
  type: PieceType;       // which piece to place
  rotation: number;
  col: number;
  shouldHold: boolean;   // true = hold current first, then place
  score: number;
}

/**
 * Find the best move given the current state.
 * Considers: place current piece, or hold-and-place.
 * Uses 1-piece lookahead: after placing, evaluates what the next piece
 * could do on the resulting board, discounting that future value.
 */
export function findBestMove(
  grid: number[][],
  currentType: PieceType,
  nextType: PieceType,
  nextNextType: PieceType,
  heldType: PieceType | null,
  canHold: boolean,
): BestMove {
  const LOOKAHEAD_DISCOUNT = 0.35;

  function evalPiece(type: PieceType, followingType: PieceType): { best: Placement | null; score: number } {
    const placements = scoredPlacements(grid, type);
    if (placements.length === 0) return { best: null, score: -Infinity };

    let bestScore = -Infinity;
    let bestPlacement: Placement | null = null;

    for (const p of placements) {
      // Simulate placing this piece
      const boardAfter = grid.map(r => [...r]);
      lock(boardAfter, ROTATIONS[p.type][p.rotation], p.dropRow, p.col);
      clearFullRows(boardAfter);

      // 1-ply lookahead: what's the best the NEXT piece can do?
      let lookaheadScore = 0;
      const nextPlacements = scoredPlacements(boardAfter, followingType);
      if (nextPlacements.length > 0) {
        lookaheadScore = nextPlacements[0].score; // best score for next piece
      }

      const total = p.score + LOOKAHEAD_DISCOUNT * lookaheadScore;
      if (total > bestScore) {
        bestScore = total;
        bestPlacement = p;
      }
    }

    return { best: bestPlacement!, score: bestScore };
  }

  interface Candidate {
    type: PieceType;
    rotation: number;
    col: number;
    score: number;
    shouldHold: boolean;
  }

  const candidates: Candidate[] = [];

  // Option A: place current piece, lookahead to nextType
  const a = evalPiece(currentType, nextType);
  if (a.best) {
    candidates.push({
      type: a.best.type,
      rotation: a.best.rotation,
      col: a.best.col,
      score: a.score,
      shouldHold: false,
    });
  }

  // Option B: hold, then place
  if (canHold) {
    if (heldType !== null) {
      // Place held piece; current becomes held; lookahead to nextType
      const b = evalPiece(heldType, nextType);
      if (b.best) {
        candidates.push({
          type: b.best.type,
          rotation: b.best.rotation,
          col: b.best.col,
          score: b.score,
          shouldHold: true,
        });
      }
    } else {
      // No held piece: hold current, nextType becomes active, lookahead to nextNextType
      const b = evalPiece(nextType, nextNextType);
      if (b.best) {
        candidates.push({
          type: b.best.type,
          rotation: b.best.rotation,
          col: b.best.col,
          score: b.score,
          shouldHold: true,
        });
      }
    }
  }

  // Pick the best candidate
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return {
    type: best.type,
    rotation: best.rotation,
    col: best.col,
    shouldHold: best.shouldHold,
    score: best.score,
  };
}