# Slot Chess

A chess + slot-machine hybrid. Each turn, three slot wheels spin to decide which
pieces you're allowed to move — then you play those moves on a normal board.

## How to play

- A matching pair on a wheel = 1 move of that piece; three of a kind = 2 moves.
- Wheels roll knights, bishops, rooks and queens.
- Pawns and your king are wildcards: always movable, and they don't use up a
  rolled piece.
- A pawn can capture only once per turn, but may keep moving.
- Castling is allowed and costs a single king move.
- Capturing a piece earns a bonus spin.
- Your turn ends automatically when you're out of moves.
- Capture the enemy king to win.

The board flips between turns for pass-and-play on one screen.

## Play

Once deployed, it's playable in the browser at your GitHub Pages URL:
`https://<your-username>.github.io/<repo-name>/`

## Run locally

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build into dist/
npm run preview  # preview the production build
npm run lint     # oxlint
```

## Built with

[React](https://react.dev) + [Vite](https://vite.dev),
[chess.js](https://github.com/jhlywa/chess.js) for rules, and
[chessground](https://github.com/lichess-org/chessground) for the board.
