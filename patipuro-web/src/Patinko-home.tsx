import React, { useCallback, useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { PachinkoPhysicsEngine, PegLayoutGenerator, PHYSICS_CONFIG } from './physics';
import { RushMode, RushModeHandle, MoviePaths } from './components/RushMode';
import { NormalSlot, NormalSlotHandle } from './components/NormalSlot';
import { BgmPlayer } from './components/BgmPlayer';

const { BOARD_WIDTH, BOARD_HEIGHT, LAUNCH_POWER_MAX } = PHYSICS_CONFIG;

const WS_URL = 'ws://localhost:8080';
const RUSH_MAX_SPINS = 5;

const Pachinko: React.FC = () => {
    // TypeScriptの型指定: HTMLDivElement | null
    const sceneRef = useRef<HTMLDivElement>(null);
    // shootBall を useRef で安定参照（WebSocketコールバックから呼ぶため）
    const shootBallRef = useRef<() => void>(() => {});
    // ノーマルスロット（演出動画）への参照
    const slotRef = useRef<NormalSlotHandle>(null);
    // RushMode への参照
    const rushModeRef = useRef<RushModeHandle>(null);
    // へそコールバックを安定参照で保持（初期化後に更新するため）
    const hesoCallbackRef = useRef<(ball: Matter.Body) => void>(() => {});
    // 物理エンジン（ラッパー経由でhesoCallbackRefを呼ぶ）
    const physicsEngineRef = useRef<PachinkoPhysicsEngine>(
        new PachinkoPhysicsEngine((ball) => hesoCallbackRef.current(ball))
    );
    // デバッグモード
    const [debugMode, setDebugMode] = useState(false);
    // デバッグ描画用のCanvas
    const debugCanvasRef = useRef<HTMLCanvasElement | null>(null);
    // 連続発射用
    const isShootingRef = useRef(false);
    const shootIntervalRef = useRef<number | null>(null);
    const [launchPower, setLaunchPower] = useState<number>(LAUNCH_POWER_MAX);
    const launchPowerRef = useRef<number>(LAUNCH_POWER_MAX);
    // デバッグ情報表示用
    const [fps, setFps] = useState(0);
    const [ballCount, setBallCount] = useState(0);
    const [activePegCount, setActivePegCount] = useState(0);
    const [totalPegCount, setTotalPegCount] = useState(0);
    
    const [winCount, setWinCount] = useState<number>(0);
    const [isRushOpen, setIsRushOpen] = useState(false);
    const [bgmTracks, setBgmTracks] = useState<string[]>(['/bgm/bgm_normal_01.mp3']);
    const [boardBackground, setBoardBackground] = useState<string>('');
    const [rushMovies, setRushMovies] = useState<MoviePaths>({
        reach:   [{ video: 'https://www.w3schools.com/html/mov_bbb.mp4',                                                    audio: null }],
        success: [{ video: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', audio: null }],
        failure: [{ video: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4', audio: null }],
    });

    // VSCode拡張のwebviewページに「Reactが準備完了」を通知する
    // → webviewページはキューに溜めていた LOAD_DAI メッセージをここで流す
    useEffect(() => {
        window.parent.postMessage({ type: 'PATIPURO_READY' }, '*');
    }, []);

    // 保留カウント（UIにはState、コールバック内はRefで最新値参照）
    const [pendingCount, setPendingCount] = useState<number>(0);
    const pendingCountRef = useRef<number>(0);
    // スロット回転中フラグ（コールバック内のみ参照）
    const isSpinningRef = useRef<boolean>(false);
    // 「ビルド完了までに保留があった」ことを記憶するフラグ
    const hadPendingRef = useRef<boolean>(false);
    // RefとStateを同時更新するヘルパー
    const setPending = (count: number) => {
        pendingCountRef.current = count;
        setPendingCount(count);
        if (count > 0) {
            hadPendingRef.current = true;
            console.log('[PatiPro] setPending: count=', count, 'hadPendingRef=true');
        }
    };

    // 右打ちへそコールバックを設定
    useEffect(() => {
        physicsEngineRef.current.setRushHesoCallback(() => {
            setWinCount(prev => prev + 1);
        });
    }, []);

    // へそコールバックをslotRefと接続
    useEffect(() => {
        hesoCallbackRef.current = () => {
            if (!isSpinningRef.current) {
                // 未回転 → 即座にspin（保留には積まない）
                isSpinningRef.current = true;
                console.log('[PatiPro] ヘそ入賞 → 即スピン (spinning=false)');
                slotRef.current?.spin();
            } else if (pendingCountRef.current < 5) {
                // 回転中 & 保留に空きあり → 保留+1
                console.log('[PatiPro] ヘそ入賞 → 保留+1 (spinning=true, pending=', pendingCountRef.current, ')');
                setPending(pendingCountRef.current + 1);
            } else {
                console.log('[PatiPro] ヘそ入賞 → 無視 (pending満タン)');
            }
        };
    }, []); // Refとstableセッターのみ使用するので依存配列は []

    // スロット回転完了時：保留を消化する
    const handleSlotResult = useCallback((_reels: string[], isWin: boolean) => {
        if (isWin) {
            setWinCount(prev => prev + 1);
            // 数字が揃った → ラッシュ突入＆右打ちモード
            setIsRushOpen(true);
            physicsEngineRef.current.setRushMode(true);
        }
        if (pendingCountRef.current > 0) {
            setPending(pendingCountRef.current - 1);
            setTimeout(() => {
                slotRef.current?.spin();
                // isSpinningRef は true のまま（次のspinが始まる）
            }, 500);
        } else {
            isSpinningRef.current = false;
        }
    }, []); // Refとstableセッターのみ使用するので依存配列は []

    useEffect(() => {
        if (!sceneRef.current) return;

        const { Render, Runner, Bodies, World } = Matter;
        const physicsEngine = physicsEngineRef.current;
        const engine = physicsEngine.getEngine();

        // 1. レンダラーの設定
        const render = Render.create({
            element: sceneRef.current,
            engine: engine,
            options: {
                width: BOARD_WIDTH,
                height: BOARD_HEIGHT,
                wireframes: false,
                background: 'transparent'
            }
        });

        // 2. 静的オブジェクト（壁・釘）の作成
        const leftWall = Bodies.rectangle(-10, 300, 20, 600, { isStatic: true });
        const rightWall = Bodies.rectangle(410, 300, 20, 600, { isStatic: true });
        
        // 釘の作成（リアルなパチンコ配置）
        const pegs = PegLayoutGenerator.generateRealisticPegs(Bodies);
        const centerMonitorSensor = PegLayoutGenerator.createCenterMonitorSensor(Bodies);
        physicsEngine.registerMonitorSensor(centerMonitorSensor);

        World.add(engine.world, [
            leftWall, rightWall,
            ...pegs,
            centerMonitorSensor
        ]);

        // 3. 物理エンジンの実行
        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);

        // 玉を銀色・光沢感で描画（afterRender でラジアルグラデーションを重ね描き）
        Matter.Events.on(render, 'afterRender', () => {
            const ctx = render.context;
            const r = 5.2;
            physicsEngine.getBalls().forEach((ball) => {
                const { x, y } = ball.position;

                // ベースの金属グラデーション（光源：左上）
                const metal = ctx.createRadialGradient(
                    x - r * 0.35, y - r * 0.4, r * 0.05,
                    x + r * 0.1,  y + r * 0.2,  r
                );
                metal.addColorStop(0,    '#ffffff');
                metal.addColorStop(0.2,  '#e8e8e8');
                metal.addColorStop(0.55, '#a8a8a8');
                metal.addColorStop(0.85, '#686868');
                metal.addColorStop(1,    '#3a3a3a');

                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = metal;
                ctx.fill();

                // 光沢ハイライト（左上の小さな白い楕円）
                const glare = ctx.createRadialGradient(
                    x - r * 0.32, y - r * 0.38, 0,
                    x - r * 0.18, y - r * 0.22, r * 0.48
                );
                glare.addColorStop(0,   'rgba(255,255,255,0.88)');
                glare.addColorStop(0.5, 'rgba(255,255,255,0.3)');
                glare.addColorStop(1,   'rgba(255,255,255,0)');

                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = glare;
                ctx.fill();
            });
        });

        // 衝突イベントの検知
        Matter.Events.on(engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                physicsEngine.handleCollision(pair);
            });
        });

        Matter.Events.on(engine, 'collisionEnd', (event) => {
            event.pairs.forEach((pair) => {
                physicsEngine.handleCollisionEnd(pair);
            });
        });

        // 毎フレーム実行される更新ロジック
        Matter.Events.on(engine, 'beforeUpdate', () => {
            // 物理エンジンの更新
            physicsEngine.update();
            
            // デバッグ情報の更新
            const debugInfo = physicsEngine.getDebugInfo();
            setFps(debugInfo.fps);
            setBallCount(debugInfo.ballCount);
        });

        // クリックイベントの登録（長押しで連続発射）
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // UI操作中は発射しない
            if (target.closest('.debug-panel')) return;

            // 盤面上のクリックのみ発射
            if (!sceneRef.current?.contains(target)) return;

            startShooting();
        };
        const handleMouseUp = () => stopShooting();
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        
        // デバッグモードのキーボードイベント
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'd' || e.key === 'D') {
                setDebugMode(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        
        // デバッグ描画用のCanvas作成
        if (sceneRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = BOARD_WIDTH;
            canvas.height = BOARD_HEIGHT;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = '1000';
            sceneRef.current.appendChild(canvas);
            debugCanvasRef.current = canvas;
        }

        // 4. VS Code 拡張機能からの postMessage（Webview iframe 経由）
        const handlePostMessage = (event: MessageEvent) => {
            const msg = event.data;
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'keypress') {
                shootBallRef.current();
            } else if (msg.type === 'reach') {
                rushModeRef.current?.playReach();
            } else if (msg.type === 'play_success') {
                rushModeRef.current?.playSuccess();
                for (let i = 0; i < 15; i++) {
                    setTimeout(() => shootBallRef.current(), i * 80);
                }
            } else if (msg.type === 'rush') {
                setIsRushOpen(true);
                physicsEngineRef.current.setRushMode(true);
            } else if (msg.type === 'burst' && typeof msg.count === 'number') {
                const count = Math.min(Math.max(1, msg.count), 50);
                for (let i = 0; i < count; i++) {
                    setTimeout(() => shootBallRef.current(), i * 80);
                }
                console.log('[PatiPro] burst受信:', {
                    triggerRushIfPending: msg.triggerRushIfPending,
                    pendingCountRef: pendingCountRef.current,
                    hadPendingRef: hadPendingRef.current,
                    isSpinning: isSpinningRef.current,
                });
                // ビルド/テスト成功時、保留があった（or今もある）場合にラッシュ突入
                if (msg.triggerRushIfPending && (pendingCountRef.current > 0 || hadPendingRef.current)) {
                    hadPendingRef.current = false;
                    console.log('[PatiPro] → ラッシュ突入！');
                    setIsRushOpen(true);
                    physicsEngineRef.current.setRushMode(true);
                } else {
                    console.log('[PatiPro] → ラッシュ条件不成立');
                }
            } else if (msg.command === 'LOAD_DAI') {
                const serverUrl: string = msg.payload?.assetServerUrl ?? '';

                // BGM
                const bgmPaths: string[] = msg.payload?.bgmPaths ?? [];
                if (bgmPaths.length > 0) {
                    setBgmTracks(bgmPaths.map((p: string) => `${serverUrl}${p}`));
                }

                // 背景画像
                const bgPath: string = msg.payload?.boardBackgroundPath ?? '';
                if (bgPath) setBoardBackground(`${serverUrl}${bgPath}`);

                // ラッシュ演出動画
                const movies = msg.payload?.rushMoviePaths;
                if (movies) {
                    const toEntry = (e: { video: string; audio: string | null }) => ({
                        video: `${serverUrl}${e.video}`,
                        audio: e.audio ? `${serverUrl}${e.audio}` : null,
                    });
                    setRushMovies(prev => ({
                        reach:   movies.reach.length   > 0 ? movies.reach.map(toEntry)   : prev.reach,
                        success: movies.success.length > 0 ? movies.success.map(toEntry) : prev.success,
                        failure: movies.failure.length > 0 ? movies.failure.map(toEntry) : prev.failure,
                    }));
                }
            }
        };
        window.addEventListener('message', handlePostMessage);

        // 5. WebSocketクライアント（別クライアント間の keypress 共有用）
        let ws: WebSocket | null = null;
        const connectWS = () => {
            ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                console.log('[patipuro-web] WebSocket connected');
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'keypress') {
                        shootBallRef.current();
                    } else if (msg.type === 'burst' && typeof msg.count === 'number') {
                        const count = Math.min(Math.max(1, msg.count), 50);
                        for (let i = 0; i < count; i++) {
                            setTimeout(() => shootBallRef.current(), i * 80);
                        }
                    }
                } catch {
                    // ignore
                }
            };

            ws.onerror = () => {
                // サーバー未起動時は静かに無視
            };

            ws.onclose = () => {
                console.log('[patipuro-web] WebSocket disconnected');
                // 3秒後に再接続を試みる
                setTimeout(connectWS, 3000);
            };
        };
        connectWS();

        // クリーンアップ
        return () => {
            window.removeEventListener('message', handlePostMessage);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
            stopShooting();
            Matter.Events.off(engine, 'collisionStart');
            Matter.Events.off(engine, 'collisionEnd');
            Matter.Events.off(engine, 'beforeUpdate');
            Matter.Events.off(render, 'afterRender');
            ws?.close();
            Render.stop(render);
            Runner.stop(runner);
            physicsEngine.clear();
            if (render.canvas) {
                render.canvas.remove();
            }
            if (debugCanvasRef.current) {
                debugCanvasRef.current.remove();
            }
        };
    }, []);

// 玉を発射する関数（物理エンジンを使用）
const shootBall = (): void => {
    physicsEngineRef.current.shootBall();
    new Audio('/bgm/pati.mp3').play().catch(() => {});
};

// 連続発射開始
const startShooting = (): void => {
    if (isShootingRef.current) return;
    isShootingRef.current = true;
    
    shootBall(); // 即座に1発
    shootIntervalRef.current = window.setInterval(() => {
        shootBall();
    }, 150); // 150msごとに発射
};

// 連続発射停止
const stopShooting = (): void => {
    isShootingRef.current = false;
    if (shootIntervalRef.current) {
        clearInterval(shootIntervalRef.current);
        shootIntervalRef.current = null;
    }
};

// デバッグモード時の描画
useEffect(() => {
    if (!debugCanvasRef.current) return;

    if (!debugMode) {
        const clearCtx = debugCanvasRef.current.getContext('2d');
        if (clearCtx) {
            clearCtx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        }
        return;
    }
    
    const canvas = debugCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const physicsEngine = physicsEngineRef.current;
    
    const drawDebug = () => {
        ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        
        // 半透明の背景で視認性向上
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        
            // 玉の周りのマーカー（より目立つように）
            physicsEngine.getBalls().forEach((ball) => {
                // 外側の円（パルス）
                const pulse = Math.sin(Date.now() / 150) * 3 + 15;
                ctx.strokeStyle = `rgba(0, 255, 255, ${0.4 - pulse / 60})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(ball.position.x, ball.position.y, pulse, 0, Math.PI * 2);
                ctx.stroke();
                
                // 内側の円
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(ball.position.x, ball.position.y, 10, 0, Math.PI * 2);
                ctx.stroke();
                
                // 速度ベクトル
                const velocityScale = 3;
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(ball.position.x, ball.position.y);
                ctx.lineTo(
                    ball.position.x + ball.velocity.x * velocityScale,
                    ball.position.y + ball.velocity.y * velocityScale
                );
                ctx.stroke();
            });
        };
        
        const interval = setInterval(drawDebug, 1000 / 30); // 30FPSで描画
        
        return () => clearInterval(interval);
    }, [debugMode]);

    // shootBall の参照を常に最新に保つ
    shootBallRef.current = shootBall;
    return (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ position: 'relative' }}>
                <div style={{
                    color: 'white',
                    position: 'absolute',
                    top: -30,
                    width: '100%',
                    textAlign: 'center',
                    fontFamily: 'sans-serif'
                }}>
                    クリック長押しで連続発射 {debugMode && <span style={{ color: '#00ff00' }}>| DEBUG: ON</span>}
                </div>

                <div style={{ position: 'relative' }}>
                    {/* 盤面背景画像 */}
                    {boardBackground && (
                        <img
                            src={boardBackground}
                            alt=""
                            style={{
                                position: 'absolute',
                                top: 0, left: 0,
                                width: BOARD_WIDTH,
                                height: BOARD_HEIGHT,
                                objectFit: 'cover',
                                zIndex: 0,
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    <div ref={sceneRef} style={{ position: 'relative', zIndex: 2 }} />

                    {/* 当たり累積カウンター */}
                    <div style={{
                        position: 'absolute',
                        top: 100,
                        left: 85,
                        pointerEvents: 'none',
                        zIndex: 1,
                        textAlign: 'center',
                        fontFamily: '"Courier New", monospace',
                    }}>
                        <div style={{ fontSize: 9, letterSpacing: 3, color: '#ffcc00', textShadow: '0 0 4px #ffcc00' }}>
                            HIT
                        </div>
                        <div style={{
                            fontSize: 28,
                            fontWeight: 900,
                            color: winCount > 0 ? '#00ff88' : '#555',
                            textShadow: winCount > 0 ? '0 0 10px #00ff88, 0 0 24px #00ff8844' : 'none',
                            transition: 'color 0.3s ease, text-shadow 0.3s ease',
                        }}>
                            {String(winCount).padStart(3, '0')}
                        </div>
                    </div>

                    {/* 演出動画オーバーレイ（物理演算レイヤーの下） */}
                    <div style={{
                        position: 'absolute',
                        top: 150,
                        left: 45,
                        pointerEvents: 'none',
                        zIndex: 1,
                    }}>
                        <NormalSlot ref={slotRef} moviePaths={rushMovies} onResult={handleSlotResult} />
                    </div>

                    {/* 保留ランプ */}
                    <div style={{
                        position: 'absolute',
                        top: 340,
                        left: 130,
                        display: 'flex',
                        gap: 8,
                        pointerEvents: 'none',
                        zIndex: 1,
                    }}>
                        {Array.from({ length: 5 }, (_, i) => {
                            const isLit = i < pendingCount;
                            return (
                                <div key={i} style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: '50%',
                                    background: isLit ? '#ff6600' : '#333',
                                    boxShadow: isLit
                                        ? '0 0 8px #ff6600, 0 0 16px #ff660066'
                                        : 'inset 0 0 4px #000',
                                    border: `1.5px solid ${isLit ? '#ff9933' : '#555'}`,
                                    transition: 'background 0.2s ease, box-shadow 0.2s ease',
                                }} />
                            );
                        })}
                    </div>

                    {/* 右打ちへそUI（縦棒2本・ラッシュ中のみ表示） */}
                    {isRushOpen && (
                        <div style={{
                            position: 'absolute',
                            top: 505, left: 316,
                            width: 36, height: 30,
                            pointerEvents: 'none',
                            zIndex: 10,
                        }}>
                            {/* 左縦棒 */}
                            <div style={{
                                position: 'absolute', left: 0, top: 0,
                                width: 4, height: 30,
                                background: '#ff6600',
                                boxShadow: '0 0 6px #ff6600',
                                borderRadius: 2,
                            }} />
                            {/* 右縦棒 */}
                            <div style={{
                                position: 'absolute', right: 0, top: 0,
                                width: 4, height: 30,
                                background: '#ff6600',
                                boxShadow: '0 0 6px #ff6600',
                                borderRadius: 2,
                            }} />
                        </div>
                    )}

                    {/* へそUI（縦棒2本） */}
                    <div style={{
                        position: 'absolute',
                        top: 465,
                        left: 186,
                        width: 28,
                        height: 32,
                        pointerEvents: 'none',
                        zIndex: 10,
                    }}>
                        {/* 左縦棒 */}
                        <div style={{
                            position: 'absolute', left: 0, top: 0,
                            width: 4, height: 32,
                            background: '#00ffcc',
                            boxShadow: '0 0 6px #00ffcc',
                            borderRadius: 2,
                        }} />
                        {/* 右縦棒 */}
                        <div style={{
                            position: 'absolute', right: 0, top: 0,
                            width: 4, height: 32,
                            background: '#00ffcc',
                            boxShadow: '0 0 6px #00ffcc',
                            borderRadius: 2,
                        }} />
                    </div>
                </div>
            </div>
            
            {/* BGMプレイヤー */}
            <BgmPlayer tracks={bgmTracks} muted={isRushOpen} />

            {/* デバッグ情報パネル（右側に配置） */}
            {debugMode && (
                <div className="debug-panel" style={{
                    background: 'rgba(0, 0, 0, 0.92)',
                    color: '#00ff00',
                    padding: '16px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '2px solid rgba(0, 255, 0, 0.3)',
                    boxShadow: '0 0 20px rgba(0, 255, 0, 0.2)',
                    minWidth: '240px',
                    maxWidth: '280px',
                    marginTop: '0'
                }}>
                    <div style={{ borderBottom: '2px solid #00ff00', marginBottom: '12px', paddingBottom: '8px', textAlign: 'center' }}>
                        <strong style={{ fontSize: '15px' }}>🔧 DEBUG MODE</strong>
                    </div>
                    
                    <div style={{ 
                        background: 'rgba(0, 50, 0, 0.3)', 
                        padding: '10px', 
                        borderRadius: '5px',
                        marginBottom: '12px'
                    }}>
                        <div style={{ lineHeight: '2', fontSize: '14px' }}>
                            <div>📊 FPS: <span style={{ color: fps > 50 ? '#00ff00' : '#ffaa00', fontWeight: 'bold' }}>{fps}</span></div>
                            <div>🎯 玉の数: <span style={{ color: '#00ffff', fontWeight: 'bold' }}>{ballCount}</span></div>
                        </div>
                    </div>
                    
                    <div style={{ fontSize: '11px', lineHeight: '2', color: '#aaffaa' }}>
                        <div style={{ marginBottom: '8px', color: '#00ff00', fontWeight: 'bold' }}>📖 凡例</div>
                        <div>🔵 青円: 玉の追跡</div>
                        <div>🟡 矢印: 速度ベクトル</div>
                    </div>
                    
                    <div style={{ 
                        marginTop: '12px', 
                        paddingTop: '12px',
                        borderTop: '1px solid rgba(0, 255, 0, 0.3)',
                        fontSize: '10px', 
                        color: '#888', 
                        textAlign: 'center' 
                    }}>
                        Press 'D' to toggle
                    </div>
                </div>
            )}
            <RushMode
                ref={rushModeRef}
                isOpen={isRushOpen}
                maxSpins={RUSH_MAX_SPINS}
                moviePaths={rushMovies}
                onSuccess={() => {
                    for (let i = 0; i < 15; i++) {
                        setTimeout(() => shootBallRef.current(), i * 80);
                    }
                }}
                onRushEnd={() => {
                    console.log("ラッシュ終了！");
                    setIsRushOpen(false);
                    hadPendingRef.current = false;
                    physicsEngineRef.current.setRushMode(false); // 右打ち解除
                }}
            />
        </div>
    );
};

export default Pachinko;