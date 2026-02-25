import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { PachinkoPhysicsEngine, PegLayoutGenerator, PHYSICS_CONFIG } from './physics';
import { RushMode } from './components/RushMode';

const { BOARD_WIDTH, BOARD_HEIGHT, LAUNCH_POWER_MAX } = PHYSICS_CONFIG;

const WS_URL = 'ws://localhost:8080';
const RUSH_MAX_SPINS = 10;

const Pachinko: React.FC = () => {
    // PatiData
    const [patiData, setPatiData] = useState<any>(null);

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
        const centerMonitorSensor = PegLayoutGenerator.createCenterMonitorSensor(Bodies);
        physicsEngine.registerMonitorSensor(centerMonitorSensor);

        World.add(engine.world, [
            ground, leftWall, rightWall, 
            ...pegs,
            centerMonitorSensor
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

            // デバッグ用：何が届いたかコンソールに出す
            console.log("Webview Received:", msg.command, msg);

            if (msg.type === 'keypress') {
                shootBallRef.current();
            } else if (msg.type === 'burst' && typeof msg.count === 'number') {
                const count = Math.min(Math.max(1, msg.count), 50);
                for (let i = 0; i < count; i++) {
                    setTimeout(() => shootBallRef.current(), i * 80);
                }
            } else if (msg.command === 'LOAD_DAI') {
                console.log("台データを読み込みました:", msg.payload);
                setPatiData(msg.payload); // ここで代入！
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
            {/* DEBUG用：データの存在を確認 */}
            {patiData ? (
                <div style={{ 
                    border: '5px solid red', // 赤い枠を付けて場所を特定
                    padding: '10px',
                    background: 'white',
                    color: 'black',
                    zIndex: 9999 // 絶対に手前に出す
                }}>
                    <p>台データ読み込み成功: {patiData.stageConfig.name}</p>
                    <img 
                        src={patiData.assets[patiData.stageConfig.stageImage]} 
                        alt="stage" 
                        style={{ maxWidth: '200px', display: 'block' }}
                        onError={(e) => {
                            console.error("画像読み込み失敗:", e);
                            console.log("Failed URL:", e.currentTarget.src);
                        }}
                    />
                </div>
            ) : (
                <div style={{ color: 'gray' }}>台データ待ち...</div>
            )}
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
            {/* DEBUG用 */}
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