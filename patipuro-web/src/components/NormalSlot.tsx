import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MovieEntry, MoviePaths } from './RushMode';
import { onUnlock, triggerUnlock } from '../utils/audioUnlock';
import oseImage from '../assets/ose.jpg';
import oseSound from '../assets/ose.mp3';

// ---- 確率定数 ----
// スロットマシン（9択×3リール）と同じ確率を再現:
//   当たり  : 1/81 ≈ 1.23%  (3リールすべて一致)
//   リーチ  : 8/81 ≈ 9.88%  (1・2リール一致 → 3リール外れ)
//   ハズレ  : 72/81 ≈ 88.9%
const PROB_WIN = 1 / 81;
const PROB_REACH = 8 / 81;

type SpinResult = 'success' | 'reach' | 'failure';

export interface NormalSlotHandle {
  spin: () => void;
}

type Props = {
  moviePaths: MoviePaths;
  onResult?: (result: string[], isWin: boolean) => void;
};

function lottery(): SpinResult {
  const r = Math.random();
  console.log("r=", r);
  if (r < PROB_WIN) return 'success';
  if (r < PROB_WIN + PROB_REACH) return 'reach';
  return 'failure';
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export const NormalSlot = React.forwardRef<NormalSlotHandle, Props>((
  { moviePaths, onResult },
  ref
) => {
  const [currentEntry, setCurrentEntry] = useState<MovieEntry | null>(null);
  const [spinKey, setSpinKey] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [waitingForClick, setWaitingForClick] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const oseAudioRef = useRef<HTMLAudioElement>(null);
  const spinResultRef = useRef<SpinResult>('failure');
  const moviePathsRef = useRef(moviePaths);
  const onResultRef = useRef(onResult);

  useEffect(() => { moviePathsRef.current = moviePaths; }, [moviePaths]);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

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

  const spin = useCallback(() => {
    stopAudio();
    const result = lottery();
    console.log("result:", result);
    spinResultRef.current = result;

    const paths =
      result === 'success' ? moviePathsRef.current.success :
        result === 'reach' ? moviePathsRef.current.reach :
          moviePathsRef.current.failure;

    const entry = pickRandom(paths);
    console.log("paths:",paths)
    if (!entry) {
      console.log("呼ばれたよ1");
      // 動画未設定 → 即座にコールバックして終了
      onResultRef.current?.([], result === 'success');
      return;
    }

    setCurrentEntry(entry);
    setSpinKey(k => k + 1);
    setIsVisible(true);
    setWaitingForClick(true);
  }, [stopAudio]);

  useImperativeHandle(ref, () => ({ spin }));

  // waitingForClick が true になった後（再レンダー後）に ose.mp3 を再生
  useEffect(() => {
    if (waitingForClick) {
      playOseSound();
    }
  }, [waitingForClick, playOseSound]);

  // 演出開始前のクリックオーバーレイ: ユーザージェスチャー内で直接 audio.play() を呼ぶ
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

  const handleVideoPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentEntry?.audio) return;
    if (!audio.paused) return; // オーバーレイクリックですでに再生中
    audio.src = currentEntry.audio;
    audio.currentTime = 0;
    audio.play().catch(() => { });
  }, [currentEntry]);

  const handleVideoEnded = useCallback(() => {
    stopAudio();
    setIsVisible(false);
    setCurrentEntry(null);
    onResultRef.current?.([], spinResultRef.current === 'success');
  }, [stopAudio]);

  if (!isVisible || !currentEntry) return null;

  return (
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
      <audio ref={audioRef} />
      <audio ref={oseAudioRef} src={oseSound} loop />
      {waitingForClick ? (
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
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
      )}
    </div>
  );
});

NormalSlot.displayName = 'NormalSlot';
