// The symbols a reel can land on. Pawns are deliberately excluded — they're a
// wildcard that can always be moved when you have an action (see App / board).
export const SYMBOL_POOL = ['n', 'b', 'r', 'q'];

// Shown on the reels before the first spin (and after End Turn / Reset).
// Never part of SYMBOL_POOL, so a reel can never *land* on it.
export const IDLE_SYMBOL = 'idle';

// Unicode chess glyphs (filled), plus a "?" for the idle/not-yet-spun state.
export const GLYPHS = {
  p: '♟', // ♟ pawn
  n: '♞', // ♞ knight
  b: '♝', // ♝ bishop
  r: '♜', // ♜ rook
  q: '♛', // ♛ queen
  k: '♚', // ♚ king (not in the pool, here for completeness)
  idle: '?' // not yet spun
};

export const LABELS = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
  idle: 'Not spun yet'
};
