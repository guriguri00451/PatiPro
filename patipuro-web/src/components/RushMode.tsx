import React, { useCallback, useEffect, useRef, useState } from 'react';

// ---- 確率定数（後で微調整可能） ----
const PROB_SUCCESS = 0.50; // 50% ラッシュ中の当たり確率（調整可能）
const PROB_REACH   = 0.100; // 10%  ハズレのうちリーチ演出に発展する確率

// ---- 型定義 ----
type SpinResult = 'success' | 'reach' | 'failure';

export type MovieEntry = {
  video: string;
  audio: string | null;
};

export type MoviePaths = {
  reach:   MovieEntry[];
  success: MovieEntry[];
  failure: MovieEntry[];
};

type Props = {
  isOpen: boolean;
  maxSpins: number;
  moviePaths: MoviePaths;
  onRushEnd: () => void;
};

// ---- ユーティリティ ----
function lottery(): SpinResult {
  const r = Math.random();
  if (r < PROB_SUCCESS) return 'success';
  if (r < PROB_SUCCESS + PROB_REACH) return 'reach';
  return 'failure';
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---- コンポーネント ----
export const RushMode: React.FC<Props> = ({ isOpen, maxSpins, moviePaths, onRushEnd }) => {
  const [remainingSpins, setRemainingSpins] = useState(maxSpins);
  const [currentEntry, setCurrentEntry]     = useState<MovieEntry | null>(null);
  // 同じsrcが連続で選ばれた場合でも <video> を再マウントするためのカウンタ
  const [spinKey, setSpinKey]               = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Refで最新値を保持（コールバック内で古いクロージャを参照しないため）
  const spinResultRef       = useRef<SpinResult>('failure');
  const remainingSpinsRef   = useRef(maxSpins);
  const maxSpinsRef         = useRef(maxSpins);
  const onRushEndRef        = useRef(onRushEnd);
  const moviePathsRef       = useRef(moviePaths);

  // Props変化を即座にRefへ反映
  useEffect(() => { onRushEndRef.current  = onRushEnd;   }, [onRushEnd]);
  useEffect(() => { maxSpinsRef.current   = maxSpins;    }, [maxSpins]);
  useEffect(() => { moviePathsRef.current = moviePaths;  }, [moviePaths]);

  // 音声を停止してリセット
  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  // 1スピン開始
  const startSpin = useCallback(() => {
    stopAudio();

    const result = lottery();
    spinResultRef.current = result;

    const paths =
      result === 'success' ? moviePathsRef.current.success :
      result === 'reach'   ? moviePathsRef.current.reach   :
                             moviePathsRef.current.failure;

    // 動画なし（ファイルが空・未設定）→ 失敗扱いで次のスピンへ即進む
    const entry = pickRandom(paths);
    if (!entry) {
      const next = remainingSpinsRef.current - 1;
      remainingSpinsRef.current = next;
      setRemainingSpins(next);
      if (next > 0) {
        setTimeout(() => startSpin(), 0);
      } else {
        onRushEndRef.current();
      }
      return;
    }

    setCurrentEntry(entry);
    setSpinKey(k => k + 1);
  }, [stopAudio]);

  // isOpen が true になったらリセット＆最初のスピン開始
  useEffect(() => {
    if (!isOpen) {
      stopAudio();
      setCurrentEntry(null);
      return;
    }
    remainingSpinsRef.current = maxSpinsRef.current;
    setRemainingSpins(maxSpinsRef.current);
    startSpin();
  }, [isOpen, startSpin, stopAudio]);

  // 動画再生開始時に音声を同期再生
  const handleVideoPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentEntry?.audio) return;
    audio.src = currentEntry.audio;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // autoplay が拒否された場合は無視
    });
  }, [currentEntry]);

  // 動画終了時の評価ロジック
  const handleVideoEnded = useCallback(() => {
    stopAudio();

    const result = spinResultRef.current;

    if (result === 'success') {
      // 当たり → 残り回数をMAXに復活して続行
      remainingSpinsRef.current = maxSpinsRef.current;
      setRemainingSpins(maxSpinsRef.current);
      startSpin();
    } else {
      // ハズレ / リーチ → 残り回数を1減らす
      const next = remainingSpinsRef.current - 1;
      remainingSpinsRef.current = next;
      setRemainingSpins(next);

      if (next > 0) {
        startSpin();
      } else {
        onRushEndRef.current();
      }
    }
  }, [startSpin, stopAudio]);

  if (!isOpen) return null;

  // 残り回数に応じた警告色（残り10以下で赤く）
  const countColor =
    remainingSpins <= 10  ? '#ff3333' :
    remainingSpins <= 30  ? '#ffaa00' :
                            '#ffffff';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* 音声要素（非表示） */}
      <audio ref={audioRef} />

      {/* 動画エリア（盤面中央に小さく表示） */}
      <div
        style={{
          position: 'relative',
          width: '75%',
          maxWidth: 280,
          aspectRatio: '16 / 9',
          background: '#000',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 0 20px rgba(0,0,0,0.8)',
          pointerEvents: 'auto',
        }}
      >
        {currentEntry && (
          <video
            key={spinKey}
            src={currentEntry.video}
            autoPlay
            muted
            playsInline
            onPlay={handleVideoPlay}
            onEnded={handleVideoEnded}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}

        {/* 残り回数カウンター（動画右下） */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 10,
            textAlign: 'right',
            fontFamily: '"Courier New", "Orbitron", monospace',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
        {/* ラベル */}
        <div
          style={{
            fontSize: 10,
            letterSpacing: 4,
            color: '#ffcc00',
            marginBottom: 4,
            textShadow: '0 0 8px rgba(255, 200, 0, 0.8)',
          }}
        >
          REMAINING
        </div>

        {/* カウント数値 */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: 2,
            color: countColor,
            textShadow: `
              0 0 6px ${countColor},
              0 0 16px ${countColor}88
            `,
            transition: 'color 0.3s ease',
          }}
        >
          {String(remainingSpins).padStart(3, '0')}
        </div>

        {/* 最大回数 */}
        <div
          style={{
            fontSize: 9,
            letterSpacing: 2,
            color: '#666',
            marginTop: 2,
          }}
        >
          / {maxSpins}
        </div>

        {/* 残り少ない時の警告バー */}
        <div
          style={{
            marginTop: 4,
            height: 2,
            width: 60,
            background: '#222',
            borderRadius: 2,
            overflow: 'hidden',
            marginLeft: 'auto',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(remainingSpins / maxSpins) * 100}%`,
              background: countColor,
              boxShadow: `0 0 4px ${countColor}`,
              transition: 'width 0.4s ease, background 0.3s ease',
            }}
          />
        </div>
      </div>
      </div>
    </div>
  );
};
