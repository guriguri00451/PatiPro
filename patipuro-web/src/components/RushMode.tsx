import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { onUnlock, triggerUnlock } from '../utils/audioUnlock';
import oseImage from '../assets/ose.jpg';
import oseSound from '../assets/ose.mp3';

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
  onSuccess?: () => void;
  onRushEnd: () => void;
};

export type RushModeHandle = {
  addSpins: (n: number) => void;
  playReach: () => void;
  playSuccess: () => void;
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
export const RushMode = React.forwardRef<RushModeHandle, Props>((
  { isOpen, maxSpins, moviePaths, onSuccess, onRushEnd },
  ref
) => {
  const [remainingSpins, setRemainingSpins] = useState(maxSpins);
  const [currentEntry, setCurrentEntry]     = useState<MovieEntry | null>(null);
  // 同じsrcが連続で選ばれた場合でも <video> を再マウントするためのカウンタ
  const [spinKey, setSpinKey]               = useState(0);
  // 演出のみ単独再生（ラッシュモード外でも動く）
  const [videoOverride, setVideoOverride]   = useState<{ entry: MovieEntry; key: number; kind: 'reach' | 'success'; waiting: boolean } | null>(null);
  // 演出開始前クリック待ちフラグ
  const [waitingForClick, setWaitingForClick] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const oseAudioRef = useRef<HTMLAudioElement>(null);

  // autoplayポリシー対策: 親コンポーネントのクリックでアンロックされたら audio を warm-up
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    onUnlock(() => {
      audio.muted = true;
      audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audio.play().then(() => { audio.pause(); audio.muted = false; }).catch(() => { audio.muted = false; });
    });
  }, []);

  // Refで最新値を保持（コールバック内で古いクロージャを参照しないため）
  const spinResultRef       = useRef<SpinResult>('failure');
  const remainingSpinsRef   = useRef(maxSpins);
  const maxSpinsRef         = useRef(maxSpins);
  const onRushEndRef        = useRef(onRushEnd);
  const onSuccessRef        = useRef(onSuccess);
  const moviePathsRef       = useRef(moviePaths);

  // Props変化を即座にRefへ反映
  useEffect(() => { onRushEndRef.current  = onRushEnd;   }, [onRushEnd]);
  useEffect(() => { onSuccessRef.current  = onSuccess;   }, [onSuccess]);
  useEffect(() => { maxSpinsRef.current   = maxSpins;    }, [maxSpins]);
  useEffect(() => { moviePathsRef.current = moviePaths;  }, [moviePaths]);

  // 音声を停止してリセット
  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const playOseSound = useCallback(() => {
    const audio = oseAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const stopOseSound = useCallback(() => {
    const audio = oseAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  useImperativeHandle(ref, () => ({
    addSpins: (n: number) => {
      const next = remainingSpinsRef.current + n;
      remainingSpinsRef.current = next;
      setRemainingSpins(next);
    },
    playReach: () => {
      const entry = pickRandom(moviePathsRef.current.reach);
      if (!entry) return;
      setVideoOverride({ entry, key: Date.now(), kind: 'reach', waiting: true });
    },
    playSuccess: () => {
      const entry = pickRandom(moviePathsRef.current.success);
      if (!entry) return;
      setVideoOverride({ entry, key: Date.now(), kind: 'success', waiting: true });
    },
  }));

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
    setWaitingForClick(true);
  }, [stopAudio]);

  // isOpen が true になったらリセット＆最初のスピン開始
  useEffect(() => {
    if (!isOpen) {
      stopAudio();
      stopOseSound();
      setCurrentEntry(null);
      return;
    }
    remainingSpinsRef.current = maxSpinsRef.current;
    setRemainingSpins(maxSpinsRef.current);
    startSpin();
  }, [isOpen, startSpin, stopAudio, stopOseSound]);

  // waitingForClick が true になった後（再レンダー後）に ose.mp3 を再生
  useEffect(() => {
    if (waitingForClick) {
      playOseSound();
    }
  }, [waitingForClick, playOseSound]);

  // videoOverride の waiting が true になった後（再レンダー後）に ose.mp3 を再生
  useEffect(() => {
    if (videoOverride?.waiting) {
      playOseSound();
    }
  }, [videoOverride?.waiting, playOseSound]);

  // 演出開始前クリックオーバーレイ（メインスピン用）
  const handleOverlayClick = useCallback(() => {
    stopOseSound();
    const audio = audioRef.current;
    if (audio && currentEntry?.audio) {
      audio.src = currentEntry.audio;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    triggerUnlock();
    setWaitingForClick(false);
  }, [currentEntry, stopOseSound]);

  // 動画再生開始時に音声を同期再生（オーバーレイで未再生だった場合のフォールバック）
  const handleVideoPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentEntry?.audio) return;
    if (!audio.paused) return; // オーバーレイクリックですでに再生中
    audio.src = currentEntry.audio;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, [currentEntry]);

  // 動画終了時の評価ロジック
  const handleVideoEnded = useCallback(() => {
    stopAudio();

    const result = spinResultRef.current;

    // 当たり / ハズレ / リーチ → いずれも残り回数を1減らす
    const next = remainingSpinsRef.current - 1;
    remainingSpinsRef.current = next;
    setRemainingSpins(next);

    if (result === 'success') {
      // 当たり → 弾を発射
      onSuccessRef.current?.();
    }

    if (next > 0) {
      startSpin();
    } else {
      onRushEndRef.current();
    }
  }, [startSpin, stopAudio]);

  // ラッシュモード外での演出単独表示（reach / success）
  if (!isOpen && videoOverride) {
    const glowColor = videoOverride.kind === 'success'
      ? 'rgba(255,220,0,0.7)'
      : 'rgba(255,100,0,0.6)';
    return (
      <>
        <audio ref={audioRef} />
        <audio ref={oseAudioRef} src={oseSound} loop />
        <div
          style={{
            position: 'relative',
            width: 330,
            aspectRatio: '16 / 9',
            background: '#000',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: `0 0 20px ${glowColor}`,
            pointerEvents: 'none',
          }}
        >
          {videoOverride.waiting ? (
            <div
              onClick={() => {
                stopOseSound();
                const audio = audioRef.current;
                if (audio && videoOverride.entry.audio) {
                  audio.src = videoOverride.entry.audio;
                  audio.currentTime = 0;
                  audio.play().catch(() => {});
                }
                triggerUnlock();
                setVideoOverride(prev => prev ? { ...prev, waiting: false } : null);
              }}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: 'rgba(0, 0, 0, 0.82)',
                color: '#fff',
                gap: 10,
                pointerEvents: 'auto',
                userSelect: 'none',
              }}
            >
              <img 
                src={oseImage} 
                alt="タップして演出開始" 
                style={{ 
                  width: '230px', // 画像のサイズはお好みで調整してください
                  height: 'auto',
                  pointerEvents: 'none' // 画像自体がクリックイベントを邪魔しないようにする
                }} 
              />
            </div>
          ) : (
            <video
              key={videoOverride.key}
              src={videoOverride.entry.video}
              autoPlay
              muted
              playsInline
              onPlay={() => {
                const audio = audioRef.current;
                if (!audio || !videoOverride.entry.audio) return;
                if (!audio.paused) return;
                audio.src = videoOverride.entry.audio;
                audio.currentTime = 0;
                audio.play().catch(() => {});
              }}
              onEnded={() => {
                stopAudio();
                setVideoOverride(null);
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            />
          )}
        </div>
      </>
    );
  }

  if (!isOpen) return null;

  // 残り回数に応じた警告色（残り10以下で赤く）
  const countColor =
    remainingSpins <= 10  ? '#ff3333' :
    remainingSpins <= 30  ? '#ffaa00' :
                            '#ffffff';

  return (
    <>
      {/* 音声要素（非表示） */}
      <audio ref={audioRef} />
      <audio ref={oseAudioRef} src={oseSound} loop />

      {/* 動画エリア */}
      <div
        style={{
          position: 'relative',
          width: 330,
          aspectRatio: '16 / 9',
          background: '#000',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 0 20px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
        }}
      >
        {currentEntry && (
          waitingForClick ? (
            <div
              onClick={handleOverlayClick}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: 'rgba(0, 0, 0, 0.82)',
                color: '#fff',
                gap: 10,
                pointerEvents: 'auto',
                userSelect: 'none',
              }}
            >
              <img 
                src={oseImage} 
                alt="タップして演出開始" 
                style={{ 
                  width: '230px', // 画像のサイズはお好みで調整してください
                  height: 'auto',
                  pointerEvents: 'none' // 画像自体がクリックイベントを邪魔しないようにする
                }} 
              />
            </div>
          ) : (
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
                pointerEvents: 'none',
              }}
            />
          )
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
    </>
  );
});
