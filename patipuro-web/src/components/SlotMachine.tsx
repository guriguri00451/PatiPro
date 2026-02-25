import React, { useRef, useState, useImperativeHandle } from 'react';

export interface SlotMachineHandle {
  spin: () => void;
}

type Props = {
  onResult?: (result: string[], isWin: boolean) => void;
  compact?: boolean;
};

const DEBUG_ALWAYS_WIN = true; // デバッグ用：true にすると必ず揃う

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SPIN_INTERVAL_MS = 60;
const STOP_TIMES = [1000, 2000, 3000];

export const SlotMachine = React.forwardRef<SlotMachineHandle, Props>(
  ({ onResult, compact = false }, ref) => {
    const [reels, setReels] = useState(['0', '0', '0']);
    const [spinning, setSpinning] = useState(false);
    const [win, setWin] = useState<boolean | null>(null);

    const intervalsRef = useRef<(ReturnType<typeof setInterval> | null)[]>([null, null, null]);
    const reelsRef = useRef(['0', '0', '0']);

    const updateReel = (index: number, value: string) => {
      reelsRef.current = reelsRef.current.map((v, i) => (i === index ? value : v));
      setReels([...reelsRef.current]);
    };

    const handleSpin = () => {
      if (spinning) return;

      setSpinning(true);
      setWin(null);
      reelsRef.current = ['0', '0', '0'];

      for (let i = 0; i < 3; i++) {
        intervalsRef.current[i] = setInterval(() => {
          const next = DIGITS[Math.floor(Math.random() * DIGITS.length)];
          updateReel(i, next);
        }, SPIN_INTERVAL_MS);
      }

      STOP_TIMES.forEach((delay, i) => {
        setTimeout(() => {
          clearInterval(intervalsRef.current[i]!);
          intervalsRef.current[i] = null;

          if (i === 2) {
            if (DEBUG_ALWAYS_WIN) {
              const winValue = reelsRef.current[0];
              updateReel(1, winValue);
              updateReel(2, winValue);
              reelsRef.current[1] = winValue;
              reelsRef.current[2] = winValue;
            }
            const finalReels = [...reelsRef.current];
            const isWin = finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2];
            setWin(isWin);
            setSpinning(false);
            onResult?.(finalReels, isWin);
          }
        }, delay);
      });
    };

    useImperativeHandle(ref, () => ({
      spin: handleSpin,
    }));

    const glowColor = win === true ? '#00ff88' : win === false ? '#ff3333' : '#ffcc00';
    const reelWidth = compact ? 55 : 80;
    const reelHeight = compact ? 75 : 100;
    const fontSize = compact ? 40 : 56;
    const padding = compact ? '16px 20px' : '32px 40px';
    const background = compact ? 'rgba(13, 13, 26, 0.85)' : '#0d0d1a';

    return (
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: compact ? 12 : 24,
          padding,
          background,
          border: `2px solid ${glowColor}44`,
          borderRadius: 16,
          boxShadow: `0 0 24px ${glowColor}22, inset 0 0 40px #00000088`,
        }}
      >
        {/* タイトル */}
        <div
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            letterSpacing: 6,
            color: '#ffcc00',
            textShadow: '0 0 8px rgba(255,200,0,0.8)',
            userSelect: 'none',
          }}
        >
          SLOT MACHINE
        </div>

        {/* リール */}
        <div style={{ display: 'flex', gap: compact ? 8 : 12 }}>
          {reels.map((digit, i) => (
            <div
              key={i}
              style={{
                width: reelWidth,
                height: reelHeight,
                background: '#1a1a2e',
                border: `2px solid ${spinning || win === null ? '#333' : glowColor}66`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `
                  inset 0 0 20px #00000066,
                  0 0 ${spinning ? '12px' : win !== null ? '20px' : '6px'} ${glowColor}${spinning ? '55' : win !== null ? '88' : '22'}
                `,
                transition: 'box-shadow 0.3s ease',
              }}
            >
              <span
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize,
                  fontWeight: 900,
                  color: spinning ? '#ffffff' : win !== null ? glowColor : '#cccccc',
                  textShadow: `
                    0 0 10px ${spinning ? '#ffffff88' : glowColor + (win !== null ? 'cc' : '44')},
                    0 0 30px ${spinning ? '#ffffff44' : glowColor + (win !== null ? '66' : '11')}
                  `,
                  lineHeight: 1,
                  userSelect: 'none',
                  transition: 'color 0.3s ease, text-shadow 0.3s ease',
                }}
              >
                {digit}
              </span>
            </div>
          ))}
        </div>

        {/* 結果表示 */}
        <div
          style={{
            height: 28,
            fontFamily: '"Courier New", monospace',
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 4,
            userSelect: 'none',
            transition: 'opacity 0.3s ease',
            opacity: win !== null ? 1 : 0,
            color: glowColor,
            textShadow: `0 0 12px ${glowColor}, 0 0 30px ${glowColor}88`,
          }}
        >
          {win === true ? '★ WIN! ★' : win === false ? 'MISS' : ''}
        </div>

        {/* スピンボタン（compactモードでは非表示） */}
        {!compact && (
          <button
            onClick={handleSpin}
            disabled={spinning}
            style={{
              padding: '12px 48px',
              fontFamily: '"Courier New", monospace',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 4,
              color: spinning ? '#555' : '#0d0d1a',
              background: spinning ? '#222' : '#ffcc00',
              border: 'none',
              borderRadius: 8,
              cursor: spinning ? 'not-allowed' : 'pointer',
              boxShadow: spinning ? 'none' : '0 0 16px rgba(255,200,0,0.5)',
              transition: 'all 0.2s ease',
              userSelect: 'none',
            }}
          >
            {spinning ? 'SPINNING...' : 'SPIN'}
          </button>
        )}
      </div>
    );
  }
);

SlotMachine.displayName = 'SlotMachine';
