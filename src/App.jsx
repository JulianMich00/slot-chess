import React, { useState, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import ChessgroundBoard from './components/ChessgroundBoard';
import SlotMachine from './components/SlotMachine';
import { SYMBOL_POOL, GLYPHS, IDLE_SYMBOL } from './symbols';

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const NUM_WHEELS = 3;
const SPINS_PER_TURN = 3; // added to the active player's bank each turn

// Feature flag for the manual "spin economy" (per-player spin bank, per-wheel
// spin buttons, spending/banking spins). When false, the game instead auto-spins
// all wheels at the start of each turn and grants one extra spin per capture.
// The economy code below is kept intact behind this flag so it can be re-enabled.
const SPIN_ECONOMY = false;

// Time for the reels to finish spinning. Must exceed the longest reel
// animation defined in SlotReel (0.9s + 2 * 0.3s stagger = 1.5s).
const SPIN_DURATION_MS = 1700;

// Pawn + king are always movable while an action remains; the wheels unlock the
// rest. UNLOCK_ORDER fixes the left-to-right order of the unlocked glyphs.
const WILDCARD_TYPES = ['p', 'k'];
const UNLOCK_ORDER = ['q', 'r', 'b', 'n'];

// Each turn has a total move budget plus a pool of *typed* tokens. A wheel win
// adds `actions` to the budget (a pair 1, a triple 2) and the same number of
// tokens of the piece type it landed on. Every move spends one from the budget;
// a non-wildcard move *also* spends one token of that piece's type, so once a
// type's tokens are gone it can no longer move. Pawn and king are wildcards —
// they spend only the budget, leaving every rolled type available.
const isWildcardType = (type) => type === 'p' || type === 'k';

// Remove one token of `type` (a no-op if none remain). Wildcard moves skip this,
// leaving the typed pool intact.
const spendTypeToken = (tokens, type) => {
  const idx = tokens.indexOf(type);
  return idx === -1 ? tokens : tokens.filter((_, i) => i !== idx);
};

const idleReels = () => [IDLE_SYMBOL, IDLE_SYMBOL, IDLE_SYMBOL];

const makeInitialWheels = () =>
  Array.from({ length: NUM_WHEELS }, () => ({
    reels: idleReels(),
    spinning: false,
    spinId: 0,
    winning: []
  }));

// White opens with 3 spins; black is granted its first 3 when its turn begins.
const initialSpins = () => ({ white: SPINS_PER_TURN, black: 0 });

// Reels land on pieces only, and never on a pawn — pawns are a wildcard that
// can always be moved when you have a spare action (see ChessgroundBoard).
const rollReel = () =>
  Array.from({ length: 3 }, () => SYMBOL_POOL[Math.floor(Math.random() * SYMBOL_POOL.length)]);

// Score a single 3-reel wheel: 3-of-a-kind = 2 actions, a pair = 1 action.
// `winning` is the indices of the reels that formed the match (for highlighting).
function evaluateWheel(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) return { actions: 2, pieceType: a, winning: [0, 1, 2] };
  if (a === b) return { actions: 1, pieceType: a, winning: [0, 1] };
  if (b === c) return { actions: 1, pieceType: b, winning: [1, 2] };
  if (a === c) return { actions: 1, pieceType: a, winning: [0, 2] };
  return { actions: 0, pieceType: null, winning: [] };
}

export default function App() {
  const [gameState, setGameState] = useState({
    board: INITIAL_FEN,
    currentTurn: 'white',
    movesRemaining: 0, // total moves left this turn (every move costs 1)
    moveTokens: [], // which piece types still have a token (typed moves spend these)
    pawnsCaptured: [], // squares of pawns that have used their one capture this turn
    lastMove: null, // [from, to] of the most recent move, for the board highlight
    spins: initialSpins(),
    turnSerial: 0 // bumped each turn start; drives the auto-spin effect
  });
  const [wheels, setWheels] = useState(makeInitialWheels);

  // Refs so the delayed spin-resolution and auto-advance logic always read the
  // latest state instead of a stale closure from when the spin was started.
  const gameStateRef = useRef(gameState);
  const wheelsRef = useRef(wheels);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { wheelsRef.current = wheels; }, [wheels]);

  // Helper to adjust FEN for chess.js validation
  const getChessInstance = (fen, turn) => {
    let adjustedFen = fen;
    if (turn) {
      const parts = fen.split(' ');
      parts[1] = turn === 'white' ? 'w' : 'b';
      adjustedFen = parts.join(' ');
    }
    return new Chess(adjustedFen, { skipValidation: true });
  };

  // A king can actually be captured in this variant — multi-move turns let you
  // grab an exposed king — which leaves chess.js with a kingless position. Treat
  // a missing king as game over (the other side wins) instead of crashing on it.
  const placement = gameState.board.split(' ')[0];
  const whiteKingAlive = placement.includes('K');
  const blackKingAlive = placement.includes('k');
  const kingCaptured = !whiteKingAlive || !blackKingAlive;

  const activeChess = getChessInstance(gameState.board, gameState.currentTurn);
  const isCheckmate = !kingCaptured && activeChess.isCheckmate();
  const isDraw = !kingCaptured && activeChess.isDraw();
  const gameOver = kingCaptured || isCheckmate || isDraw;

  const winner = kingCaptured
    ? (whiteKingAlive ? 'White' : 'Black')
    : isCheckmate
      ? (gameState.currentTurn === 'white' ? 'Black' : 'White')
      : null;
  const anySpinning = wheels.some(w => w.spinning);
  const currentSpins = gameState.spins[gameState.currentTurn];

  // The board's "actions" gate is the budget; the unlocked types are whatever
  // still has a token. A pawn move drops the budget without touching the types,
  // so every rolled type stays movable until a piece of that type is moved.
  const movesRemaining = gameState.movesRemaining;
  const allowedMoveTypes = Array.from(new Set(gameState.moveTokens));

  // Spin a single wheel. With the spin economy on this costs 1 spin; otherwise
  // it's free (used by the turn-start auto-spin and the per-capture spin).
  const spinWheel = (index) => {
    if (gameOver) return;
    const w = wheels[index];
    if (w.spinning) return; // can't spin a wheel that's mid-spin (but re-spins are fine)
    if (SPIN_ECONOMY && currentSpins <= 0) return;

    const reels = rollReel();

    // Spend one spin from the active player's bank.
    if (SPIN_ECONOMY) {
      setGameState(prev => {
        const cur = prev.spins[prev.currentTurn];
        return { ...prev, spins: { ...prev.spins, [prev.currentTurn]: Math.max(0, cur - 1) } };
      });
    }

    setWheels(prev =>
      prev.map((wheel, i) =>
        i === index
          ? { reels, spinning: true, spinId: wheel.spinId + 1, winning: [] }
          : wheel
      )
    );

    setTimeout(() => resolveWheel(index, reels), SPIN_DURATION_MS);
  };

  // Called once a wheel's animation finishes: add its move tokens to the pool.
  const resolveWheel = (index, reels) => {
    // Bail if this spin was cancelled in the meantime (e.g. Reset).
    if (!wheelsRef.current[index] || !wheelsRef.current[index].spinning) return;

    const { actions, pieceType, winning } = evaluateWheel(reels);

    setWheels(prev => prev.map((w, i) => (i === index ? { ...w, spinning: false, winning } : w)));

    setGameState(prev => ({
      ...prev,
      // Grow the budget by `actions`, and add the same number of typed tokens.
      movesRemaining: prev.movesRemaining + actions,
      moveTokens: pieceType
        ? [...prev.moveTokens, ...Array(actions).fill(pieceType)]
        : prev.moveTokens
    }));

    setTimeout(() => checkAutoAdvance(gameStateRef.current), 250);
  };

  const handleMove = (orig, dest) => {
    if (gameOver) return;
    const chess = getChessInstance(gameState.board, gameState.currentTurn);
    const piece = chess.get(orig);
    if (!piece) return;

    const move = chess.move({ from: orig, to: dest, promotion: 'q' });
    if (!move) return;

    const captured = Boolean(move.captured);
    const turn = gameState.currentTurn;

    // Each pawn may capture once per turn. Pawns have no stable id, so we track
    // the squares of pawns that have already captured: a tracked pawn that moves
    // again carries its marker to the new square, and a pawn capturing for the
    // first time becomes tracked at its destination. A promotion drops the marker
    // (it's no longer a pawn).
    const stillPawn = piece.type === 'p' && !move.promotion;
    let pawnsCaptured = gameState.pawnsCaptured.filter(sq => sq !== orig);
    if (stillPawn && (gameState.pawnsCaptured.includes(orig) || captured)) {
      pawnsCaptured = [...pawnsCaptured, dest];
    }

    const nextState = {
      ...gameState,
      board: chess.fen(),
      // Every move costs one from the budget; a non-wildcard move also spends a
      // token of its own type. Pawn/king leave the typed pool intact, so every
      // rolled type stays available after a wildcard move.
      movesRemaining: gameState.movesRemaining - 1,
      moveTokens: isWildcardType(piece.type)
        ? gameState.moveTokens
        : spendTypeToken(gameState.moveTokens, piece.type),
      pawnsCaptured,
      lastMove: [orig, dest],
      // With the economy on, a capture banks a bonus spin for the capturer.
      spins: SPIN_ECONOMY && captured
        ? { ...gameState.spins, [turn]: gameState.spins[turn] + 1 }
        : gameState.spins
    };
    setGameState(nextState);

    // Without the economy, a capture instead auto-spins one (free) wheel — but
    // not when the king itself was captured, since that ends the game.
    if (captured && move.captured !== 'k' && !SPIN_ECONOMY) {
      const free = wheels.map((w, i) => i).filter(i => !wheels[i].spinning);
      if (free.length > 0) spinWheel(free[Math.floor(Math.random() * free.length)]);
    }

    setTimeout(() => checkAutoAdvance(nextState), 100);
  };

  // Does the current player still have any piece that can legally move, given
  // their actions and the slot unlocks?
  const hasAvailableMove = (state) => {
    if (state.movesRemaining <= 0) return false;
    const chess = getChessInstance(state.board, state.currentTurn);
    const color = state.currentTurn === 'white' ? 'w' : 'b';
    for (const row of chess.board()) {
      for (const cell of row) {
        if (!cell || cell.color !== color) continue;
        // A wildcard can spend any token; any other piece needs a token of its
        // own type still in the pool.
        if (!isWildcardType(cell.type) && !state.moveTokens.includes(cell.type)) continue;
        let moves = chess.moves({ square: cell.square, verbose: true });
        if (cell.type === 'p' && state.pawnsCaptured.includes(cell.square)) moves = moves.filter(m => !m.captured);
        if (moves.length > 0) return true;
      }
    }
    return false;
  };

  // Auto-pass the turn the moment there's nothing left to do: no spin in flight,
  // and either no actions left or no piece that can still move this turn (each
  // piece moves at most once). With the economy on, banked spins keep it going.
  const checkAutoAdvance = (state) => {
    const place = state.board.split(' ')[0];
    if (!place.includes('K') || !place.includes('k')) return; // king captured — game's over
    if (wheelsRef.current.some(w => w.spinning)) return; // wait for any in-flight spin
    if (SPIN_ECONOMY && state.spins[state.currentTurn] > 0) return; // can still re-spin
    if (hasAvailableMove(state)) return; // tokens left and a legal move for one
    advanceTurn(state);
  };

  const advanceTurn = (state = gameStateRef.current) => {
    const nextPlayer = state.currentTurn === 'white' ? 'black' : 'white';
    const chess = getChessInstance(state.board, nextPlayer);

    setGameState({
      board: chess.fen(),
      currentTurn: nextPlayer,
      movesRemaining: 0,
      moveTokens: [],
      pawnsCaptured: [],
      lastMove: state.lastMove, // keep it shown so the incoming player sees the last move
      // Grant the incoming player their 3 spins, on top of whatever they banked.
      spins: { ...state.spins, [nextPlayer]: state.spins[nextPlayer] + SPINS_PER_TURN },
      turnSerial: state.turnSerial + 1
    });
    setWheels(prev =>
      prev.map(w => ({ reels: idleReels(), spinning: false, spinId: w.spinId, winning: [] }))
    );
  };

  const resetGame = () => {
    setGameState(prev => ({
      board: INITIAL_FEN,
      currentTurn: 'white',
      movesRemaining: 0,
      moveTokens: [],
      pawnsCaptured: [],
      lastMove: null, // clear the winning-move highlight from the finished game
      spins: initialSpins(),
      turnSerial: prev.turnSerial + 1
    }));
    setWheels(makeInitialWheels());
  };

  // Auto-spin every wheel at the start of each turn (when the manual economy is
  // off). Keyed on turnSerial so it fires exactly once per turn, including after
  // Reset; the ref guards against React StrictMode's double-invoked effects.
  const autoSpunSerialRef = useRef(null);
  useEffect(() => {
    if (SPIN_ECONOMY) return;
    if (autoSpunSerialRef.current === gameState.turnSerial) return;
    autoSpunSerialRef.current = gameState.turnSerial;
    if (gameOver) return;
    for (let i = 0; i < NUM_WHEELS; i++) spinWheel(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.turnSerial]);

  // What the player can move this turn: the wildcards (always) plus the types
  // that still have a token, in a fixed order — a type drops off as soon as its
  // tokens are spent. Total tokens left are shown as dots. The readout hides once
  // the pool is empty (the turn auto-advances at that point).
  const unlockedTypes = UNLOCK_ORDER.filter(t => allowedMoveTypes.includes(t));
  const showReadout = movesRemaining > 0;

  return (
    <div className="app-layout">
      <div className="game-container">
      {/* 3 Slot Machines. With the economy off they auto-spin each turn; with it
          on, each shows a Spin button. */}
      <div className="slots-container">
        {wheels.map((wheel, i) => (
          <SlotMachine
            key={i}
            title={`Wheel ${i + 1}`}
            wheel={wheel}
            index={i}
            disabled={gameOver || currentSpins <= 0}
            onSpin={spinWheel}
            showSpinButton={SPIN_ECONOMY}
          />
        ))}
      </div>

      {/* Action / Spin Counters + Buttons */}
      <div className="controls-container">
        <div className="status-text">
          <span className="status-turn">{gameState.currentTurn.toUpperCase()}</span>
          {showReadout && (
            <span className="movable-readout">
              <span className="glyph-group">
                {WILDCARD_TYPES.map(t => (
                  <span key={t} className="move-glyph">{GLYPHS[t]}</span>
                ))}
              </span>
              {unlockedTypes.length > 0 && (
                <>
                  <span className="group-divider">•</span>
                  <span className="glyph-group">
                    {unlockedTypes.map(t => (
                      <span key={t} className="move-glyph">{GLYPHS[t]}</span>
                    ))}
                  </span>
                </>
              )}
              <span className="move-dots" aria-label={`${movesRemaining} moves left`}>
                {Array.from({ length: movesRemaining }, (_, i) => (
                  <span key={i} className="move-dot" />
                ))}
              </span>
            </span>
          )}
          {!showReadout && anySpinning && <span className="status-stat">spinning…</span>}
          {SPIN_ECONOMY && <span className="status-stat">Spins: [{currentSpins}]</span>}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" onClick={resetGame}>Reset</button>
        </div>
      </div>

      {/* Game Over Notices */}
      {gameOver && !isDraw && (
        <div style={{ color: 'red', fontWeight: 'bold', textAlign: 'center' }}>
          {kingCaptured ? 'KING CAPTURED!' : 'CHECKMATE!'} {winner} wins the game.
        </div>
      )}
      {isDraw && (
        <div style={{ color: 'orange', fontWeight: 'bold', textAlign: 'center' }}>
          DRAW GAME!
        </div>
      )}

      {/* Standard 8x8 Chess Board */}
      <div className="board-wrapper">
        <ChessgroundBoard
          boardFen={gameState.board}
          currentTurn={gameState.currentTurn}
          allowedMoveTypes={allowedMoveTypes}
          actionsRemaining={gameOver ? 0 : movesRemaining}
          pawnsCaptured={gameState.pawnsCaptured}
          lastMove={gameState.lastMove}
          onMove={handleMove}
        />
      </div>
      </div>

      {/* Plain-language rules, to the right of the game. */}
      <aside className="rules-panel">
        <h2 className="rules-title">Rules</h2>
        <ul className="rules-list">
          <li>A matching pair on a wheel = 1 move of that piece; three of a kind = 2 moves.</li>
          <li>Pawns and your king are wildcards: always movable, and they don't use up a rolled piece.</li>
          <li>A pawn can capture only once per turn, but may keep moving.</li>
          <li>Castling is allowed and costs a single king move.</li>
          <li>Capturing a piece earns a bonus spin.</li>
          <li>Your turn ends automatically when you're out of moves.</li>
          <li>Capture the enemy king to win.</li>
        </ul>
      </aside>
    </div>
  );
}
