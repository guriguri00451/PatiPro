import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { PachinkoPhysicsEngine, PegLayoutGenerator, PHYSICS_CONFIG } from './physics';
import { RushMode } from './components/RushMode';

const { BOARD_WIDTH, BOARD_HEIGHT, PEG_PROXIMITY_THRESHOLD, PEG_LEAVE_THRESHOLD, LAUNCH_POWER_MIN, LAUNCH_POWER_MAX } = PHYSICS_CONFIG;

const WS_URL = 'ws://localhost:8080';
const RUSH_MAX_SPINS = 10;

const Pachinko: React.FC = () => {
    // TypeScriptの型指定: HTMLDivElement | null
    const sceneRef = useRef<HTMLDivElement>(null);
    // shootBall を useRef で安定参照（WebSocketコールバックから呼ぶため）
    const shootBallRef = useRef<() => void>(() => {});
    // 物理エンジン（物理演算担当のクラス）
    const physicsEngineRef = useRef<PachinkoPhysicsEngine>(new PachinkoPhysicsEngine());
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
    
    const [isRushOpen, setIsRushOpen] = useState(false);
    useEffect(() => {
        if (!sceneRef.current) return;

        const { Render, Runner, Bodies, World } = Matter;
        const physicsEngine = physicsEngineRef.current;
        const engine = physicsEngine.getEngine();
        const pegManager = physicsEngine.getPegManager();

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
        const ground = Bodies.rectangle(BOARD_WIDTH / 2, 610, 410, 60, { isStatic: true });
        const leftWall = Bodies.rectangle(-10, 300, 20, 600, { isStatic: true });
        const rightWall = Bodies.rectangle(410, 300, 20, 600, { isStatic: true });
        
        // 釘の作成（リアルなパチンコ配置）
        const pegs = PegLayoutGenerator.generateRealisticPegs(Bodies);
        
        // 物理エンジンに釘を登録
        pegs.forEach(peg => {
            const x = peg.position.x;
            const y = peg.position.y;
            pegManager.addPeg(peg, x, y);
        });

        World.add(engine.world, [
            ground, leftWall, rightWall, 
            ...pegs
        ]);

        // 3. 物理エンジンの実行
        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);

        // 衝突イベントの検知
        Matter.Events.on(engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                physicsEngine.handleCollision(pair);
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
            setActivePegCount(debugInfo.activePegCount);
            setTotalPegCount(debugInfo.totalPegCount);
        });

        // クリックイベントの登録（長押しで連続発射）
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // UI操作中は発射しない
            if (target.closest('.debug-panel') || target.closest('.launch-power-control')) return;

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
            } else if (msg.type === 'burst' && typeof msg.count === 'number') {
                const count = Math.min(Math.max(1, msg.count), 50);
                for (let i = 0; i < count; i++) {
                    setTimeout(() => shootBallRef.current(), i * 80);
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
            Matter.Events.off(engine, 'beforeUpdate');
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
    physicsEngineRef.current.shootBall(launchPowerRef.current);
};

useEffect(() => {
    launchPowerRef.current = launchPower;
}, [launchPower]);

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
    const pegManager = physicsEngine.getPegManager();
    
    const drawDebug = () => {
        ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        
        // 半透明の背景で視認性向上
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        
        // 釘の状態を描画
        pegManager.getAllPegStates().forEach((pegState) => {
                const { body, health, isActive, totalImpacts } = pegState;
                const x = body.position.x;
                const y = body.position.y;
                
                // 近接/離脱範囲の円（アクティブ時のみ表示）
                if (isActive) {
                    ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, y, PEG_LEAVE_THRESHOLD, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, y, PEG_PROXIMITY_THRESHOLD, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    // アクティブマーカー（パルス効果）
                    const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.5;
                    ctx.fillStyle = `rgba(0, 255, 100, ${pulse})`;
                    ctx.beginPath();
                    ctx.arc(x, y, 7, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                // 健康度バー（見やすく改善）
                const barWidth = 30;
                const barHeight = 4;
                const barX = x - barWidth / 2;
                const barY = y + 12;
                
                // バー背景
                ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                
                // 健康度（グラデーション）
                const healthColor = health > 0.5 
                    ? `rgba(${255 * (1 - health) * 2}, 255, 0, 0.9)` 
                    : `rgba(255, ${255 * health * 2}, 0, 0.9)`;
                ctx.fillStyle = healthColor;
                ctx.fillRect(barX, barY, barWidth * health, barHeight);
                
                // 枠線
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barWidth, barHeight);
                
                // 健康度テキスト（影付き）
                const healthText = `${(health * 100).toFixed(0)}`;
                ctx.font = 'bold 10px monospace';
                // 影
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.fillText(healthText, x - 8, y - 8);
                // 本体
                ctx.fillStyle = isActive ? '#00ff00' : '#ffffff';
                ctx.fillText(healthText, x - 9, y - 9);
                
                // 衝突回数（劣化が進んでいる釘のみ表示）
                if (totalImpacts > 10) {
                    ctx.font = '8px monospace';
                    ctx.fillStyle = 'rgba(255, 100, 100, 0.7)';
                    ctx.fillText(`×${totalImpacts}`, x + 10, y + 20);
                }
            });
            
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
    // ---仮置きしてます。動画再生できるようになったら、消してください---
    const testMoviePaths = {
        reach: [
            "https://www.w3schools.com/html/mov_bbb.mp4",
        ],
        success: [
            "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" 
        ],
        failure: [
            "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4" 
        ]
    };
    // ---仮置きしてます。動画再生できるようになったら、消してください---
    return (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <button 
                onClick={() => setIsRushOpen(true)}
                style={{
                    position: 'absolute',
                    top: 20,
                    right: 20,
                    zIndex: 200, // ラッシュ画面より上に表示（テスト用）
                    padding: '10px 20px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    background: '#ff0055',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px'
                }}
            >
                🔥 ラッシュテスト起動 🔥
            </button>
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
                
                {/* 発射力調整 */}
                <div className="launch-power-control" style={{
                    position: 'absolute',
                    bottom: 10,
                    left: 10,
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '5px',
                    fontFamily: 'sans-serif',
                    fontSize: '12px'
                }}>
                    <div style={{ marginBottom: '5px' }}>発射力: {launchPower.toFixed(1)}</div>
                    <input 
                        type="range" 
                        min={LAUNCH_POWER_MIN} 
                        max={LAUNCH_POWER_MAX} 
                        step="0.5"
                        value={launchPower}
                        onChange={(e) => setLaunchPower(Number(e.target.value))}
                        aria-label="発射力調整"
                        style={{ width: '150px' }}
                    />
                </div>
                
                <div ref={sceneRef} />
            </div>
            
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
                            <div>⚡ アクティブ釘: <span style={{ color: '#00ff00', fontWeight: 'bold' }}>{activePegCount}</span> / {totalPegCount}</div>
                        </div>
                    </div>
                    
                    <div style={{ fontSize: '11px', lineHeight: '2', color: '#aaffaa' }}>
                        <div style={{ marginBottom: '8px', color: '#00ff00', fontWeight: 'bold' }}>📖 凡例</div>
                        <div>🟢 緑円: 近接範囲 ({PEG_PROXIMITY_THRESHOLD}px)</div>
                        <div>⚪ 灰円: 離脱範囲 ({PEG_LEAVE_THRESHOLD}px)</div>
                        <div>📊 バー: 釘の健康度</div>
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
                isOpen={isRushOpen}
                maxSpins={RUSH_MAX_SPINS} // テストなので少なめに設定（100だと終わらないため）
                moviePaths={testMoviePaths}
                onRushEnd={() => {
                    console.log("ラッシュ終了！");
                    setIsRushOpen(false); // 終了したら画面を閉じる
                }}
            />
        </div>
    );
};

export default Pachinko;