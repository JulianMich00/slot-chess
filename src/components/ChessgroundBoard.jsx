import React, { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

export default function ChessgroundBoard({
  boardFen,
  currentTurn,
  allowedMoveTypes,
  actionsRemaining,
  pawnsCaptured = [],
  lastMove = null,
  onMove
}) {
  const containerRef = useRef(null);
  const cgRef = useRef(null);
  // Square of the piece just moved, to re-select after the board updates (so a
  // piece that can still move stays picked up). Consumed once, in the update effect.
  const reselectRef = useRef(null);

  // Keep a stable ref to the latest onMove so the chessground move event
  // (registered once on mount) always calls the current handler instead of
  // a stale closure over the initial render's gameState.
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

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

  // Helper to compute legal destinations map for Chessground
  const getDests = () => {
    const dests = new Map();
    const chess = getChessInstance(boardFen, currentTurn);
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    for (const file of files) {
      for (const rank of ranks) {
        const sq = file + rank;
        const piece = chess.get(sq);

        if (piece && piece.color === (currentTurn === 'white' ? 'w' : 'b')) {
          // A piece can move only while an action is available. The king and the
          // pawn are both wildcards (always movable); any other piece must be a
          // type the slots unlocked this turn.
          const isWildcard = piece.type === 'k' || piece.type === 'p';
          const canMove =
            actionsRemaining > 0 && (isWildcard || allowedMoveTypes.includes(piece.type));

          if (canMove) {
            let moves = chess.moves({ square: sq, verbose: true });
            // Each pawn gets one capture per turn — once this pawn has used it,
            // it can still move, but only to non-capturing squares.
            if (piece.type === 'p' && pawnsCaptured.includes(sq)) {
              moves = moves.filter(m => !m.captured);
            }
            if (moves.length > 0) {
              dests.set(sq, moves.map(m => m.to));
            }
          }
        }
      }
    }
    return dests;
  };

  // Blue square shades — a lighter blue on light tiles, a darker blue on dark
  // tiles — so the highlight mirrors the board's own checker pattern.
  const LIGHT_SQUARE_HL = '#9bbce6';
  const DARK_SQUARE_HL = '#4a72ad';

  const squareIsLight = (sq) => {
    const file = sq.charCodeAt(0) - 97; // 'a' -> 0
    const rank = parseInt(sq[1], 10) - 1; // '1' -> 0
    return (file + rank) % 2 === 1;
  };

  // Highlight every piece the player can move this turn with a filled blue square
  // sitting behind it, so the available moves are obvious before picking a piece
  // up. Drawn via chessground's customSvg layer: that layer's viewBox is shifted
  // half a square ("-3.5 -3.5 8 8"), so the shape's anchor lands on the square's
  // top-left corner and a plain 0–100 rect fills the tile exactly. index.css then
  // drops this layer below the pieces so the square reads as a tile tint.
  const buildMovableShapes = (dests) =>
    Array.from(dests.keys()).map(orig => {
      const fill = squareIsLight(orig) ? LIGHT_SQUARE_HL : DARK_SQUARE_HL;
      return {
        orig,
        customSvg: {
          html: `<rect x="0" y="0" width="100" height="100" fill="${fill}" />`
        }
      };
    });

  // Mount Chessground
  useEffect(() => {
    if (containerRef.current) {
      const dests = getDests();
      cgRef.current = Chessground(containerRef.current, {
        fen: boardFen,
        turnColor: currentTurn,
        // Flip the board to the player on move, for a pass-and-play feel.
        orientation: currentTurn,
        // Castling is a normal king move here (chess.js offers g1/c1 as king
        // destinations and moves the rook itself). autoCastle/rookCastle make
        // chessground slide the rook over too, so it animates as one move.
        autoCastle: true,
        movable: {
          color: currentTurn,
          free: false,
          dests: dests,
          showDests: true,
          rookCastle: true,
        },
        drawable: {
          enabled: false,
          autoShapes: buildMovableShapes(dests)
        },
        events: {
          move: (orig, dest) => {
            reselectRef.current = dest;
            onMoveRef.current(orig, dest);
          }
        }
      });
    }

    return () => {
      if (cgRef.current) {
        cgRef.current.destroy();
      }
    };
  }, []);

  // Update Chessground config when board or turn state updates
  useEffect(() => {
    if (cgRef.current) {
      const dests = getDests();
      cgRef.current.set({
        fen: boardFen,
        turnColor: currentTurn,
        // Controlled by App so it clears on reset (passing null wipes the
        // built-in last-move highlight; chessground otherwise keeps it).
        lastMove: lastMove || null,
        movable: {
          color: currentTurn,
          dests: dests
        }
      });
      cgRef.current.setAutoShapes(buildMovableShapes(dests));

      // Keep the just-moved piece selected if it can still move (another token of
      // its type, or a wildcard with budget left), so the player can chain moves
      // with the same piece without re-clicking. Consume the ref so this only
      // fires right after a move, not on spin/token updates.
      const toReselect = reselectRef.current;
      reselectRef.current = null;
      if (toReselect && dests.has(toReselect)) {
        cgRef.current.selectSquare(toReselect);
      }
    }
  }, [boardFen, currentTurn, allowedMoveTypes, actionsRemaining, pawnsCaptured, lastMove]);

  // Flip the board to the player on move, but a short beat after the turn
  // changes so the swap doesn't snap over the instant a move lands.
  useEffect(() => {
    const id = setTimeout(() => {
      if (cgRef.current) cgRef.current.set({ orientation: currentTurn });
    }, 300);
    return () => clearTimeout(id);
  }, [currentTurn]);

  return (
    <div 
      className="chessground-wrapper" 
      style={{ 
        width: '100%', 
        height: '100%' 
      }}
    >
      <div 
        ref={containerRef} 
        className="cg-board-container" 
        style={{ 
          width: '100%', 
          height: '100%' 
        }} 
      />
    </div>
  );
}
