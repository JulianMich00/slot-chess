import React from 'react';
import SlotReel from './SlotReel';

// A single slot machine: a window of three reels, optionally with a small red
// spin button below (only shown with the manual spin economy on). Each press
// spends one spin to (re-)roll this wheel. Wheel state is shown by the reels
// themselves (idle "?" vs landed pieces, the spin animation, and the highlight).
export default function SlotMachine({ title, wheel, index, disabled, onSpin, showSpinButton }) {
  const canSpin = !wheel.spinning && !disabled;

  return (
    <div className="slot-machine" aria-label={title}>
      <div className="reels-row">
        {wheel.reels.map((sym, i) => (
          <SlotReel
            key={i}
            symbol={sym}
            spinning={wheel.spinning}
            spinId={wheel.spinId}
            index={i}
            highlight={wheel.winning.includes(i)}
          />
        ))}
      </div>
      {showSpinButton && (
        <button
          type="button"
          className="spin-btn"
          onClick={() => onSpin(index)}
          disabled={!canSpin}
        >
          Spin
        </button>
      )}
    </div>
  );
}
