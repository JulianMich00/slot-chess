import React, { useEffect, useRef, useState } from 'react';
import { GLYPHS, LABELS, SYMBOL_POOL, IDLE_SYMBOL } from '../symbols';

// Must match the .reel viewport height and .reel-cell height in index.css.
const CELL_HEIGHT = 80;
// How many random symbols scroll past before the reel lands on its result.
const FILLER_COUNT = 14;

// A single vertically-spinning reel. The parent decides the final `symbol`
// up front; this component builds a strip of random fillers ending on that
// symbol and animates (eases) to it. `index` staggers the stop left-to-right.
export default function SlotReel({ symbol, spinning, spinId, index, highlight }) {
  const [strip, setStrip] = useState([symbol]);
  const [offset, setOffset] = useState(0);
  const [transition, setTransition] = useState('none');
  const [landed, setLanded] = useState(true);
  const rafRef = useRef([]);

  useEffect(() => {
    if (!spinning) return;

    // Random fillers, then the target, then one tail cell so the slight
    // overshoot at the end of the easing curve never reveals empty space.
    const filler = Array.from(
      { length: FILLER_COUNT },
      () => SYMBOL_POOL[Math.floor(Math.random() * SYMBOL_POOL.length)]
    );
    const tail = SYMBOL_POOL[Math.floor(Math.random() * SYMBOL_POOL.length)];
    const newStrip = [...filler, symbol, tail];

    setStrip(newStrip);
    setLanded(false);
    setTransition('none');
    setOffset(0); // jump to the top of the strip instantly

    // Two rAFs so the browser paints the reset before the animation starts.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        const duration = 0.9 + index * 0.3; // staggered stop
        setTransition(`transform ${duration}s cubic-bezier(0.16, 0.9, 0.27, 1.08)`);
        setOffset(FILLER_COUNT * CELL_HEIGHT); // land on the target cell
      });
      rafRef.current.push(raf2);
    });
    rafRef.current.push(raf1);

    return () => {
      rafRef.current.forEach(cancelAnimationFrame);
      rafRef.current = [];
    };
  }, [spinId, spinning, index, symbol]);

  // When not spinning, show the resolved symbol statically.
  if (!spinning) {
    return (
      <div className={`reel ${highlight ? 'reel-win' : ''}`}>
        <div className={`reel-cell ${symbol === IDLE_SYMBOL ? 'idle' : ''}`} title={LABELS[symbol]}>
          {GLYPHS[symbol]}
        </div>
      </div>
    );
  }

  return (
    <div className="reel">
      <div
        className={`reel-strip ${landed ? 'landed' : 'spinning'}`}
        style={{ transform: `translateY(-${offset}px)`, transition }}
        onTransitionEnd={() => setLanded(true)}
      >
        {strip.map((s, i) => (
          <div className="reel-cell" key={i}>
            {GLYPHS[s]}
          </div>
        ))}
      </div>
    </div>
  );
}
