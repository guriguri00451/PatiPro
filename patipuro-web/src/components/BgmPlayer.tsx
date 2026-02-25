import React, { useEffect, useRef, useState } from 'react';

type Props = {
    tracks: string[];
    muted: boolean;
};

export const BgmPlayer: React.FC<Props> = ({ tracks, muted }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // マウント時にAudio要素を作成
    useEffect(() => {
        const audio = new Audio();
        audio.loop = true;
        audio.volume = 1;
        audioRef.current = audio;

        if (tracks.length > 0) {
            audio.src = tracks[0];
            audio.play().then(() => {
                setIsPlaying(true);
            }).catch(() => {
                // autoplay ポリシーでブロックされた場合は停止状態のまま
                setIsPlaying(false);
            });
        }

        return () => {
            audio.pause();
            audio.src = '';
            audioRef.current = null;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // tracks が変わったとき（LOAD_DAI 受信後など）に音源を切り替え
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || tracks.length === 0) return;
        const wasPaused = audio.paused;
        audio.src = tracks[0];
        setCurrentTrackIndex(0);
        if (!wasPaused) {
            audio.play().catch(() => {});
        }
    }, [tracks]); // eslint-disable-line react-hooks/exhaustive-deps

    // muted prop が変わったとき音量を切り替え
    useEffect(() => {
        if (!audioRef.current) return;
        audioRef.current.volume = muted ? 0 : 1;
    }, [muted]);

    const selectTrack = (index: number) => {
        if (!audioRef.current || index >= tracks.length) return;
        audioRef.current.src = tracks[index];
        audioRef.current.currentTime = 0;
        audioRef.current.play().then(() => {
            setIsPlaying(true);
        }).catch(() => {
            setIsPlaying(false);
        });
        setCurrentTrackIndex(index);
    };

    const togglePlayPause = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().then(() => {
                setIsPlaying(true);
            }).catch(() => {});
        }
    };

    return (
        <div style={{
            background: 'rgba(0, 0, 0, 0.85)',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            fontFamily: 'monospace',
            fontSize: '13px',
            minWidth: '160px',
        }}>
            <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>🎵 BGM</div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                {tracks.map((_, i) => (
                    <button
                        key={i}
                        onClick={() => selectTrack(i)}
                        style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            background: currentTrackIndex === i ? '#4488ff' : '#333',
                            color: '#fff',
                            border: `1px solid ${currentTrackIndex === i ? '#66aaff' : '#555'}`,
                            borderRadius: '4px',
                        }}
                    >
                        {currentTrackIndex === i && isPlaying ? '▶ ' : ''}Track {i + 1}
                    </button>
                ))}
            </div>
            <button
                onClick={togglePlayPause}
                style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    background: '#333',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    width: '100%',
                }}
            >
                {isPlaying ? '■ 停止' : '▶ 再生'}
            </button>
            {muted && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#ffaa00', textAlign: 'center' }}>
                    🔇 ラッシュ中
                </div>
            )}
        </div>
    );
};
