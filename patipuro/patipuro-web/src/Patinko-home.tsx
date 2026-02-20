import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';

// 物理演算の設定値
const BOARD_WIDTH = 400;
const BOARD_HEIGHT = 600;

const Pachinko: React.FC = () => {
    // TypeScriptの型指定: HTMLDivElement | null
    const sceneRef = useRef<HTMLDivElement>(null);
    // Matter.Engineの型
    const engineRef = useRef<Matter.Engine>(Matter.Engine.create());

    useEffect(() => {
        if (!sceneRef.current) return;

        const { Engine, Render, Runner, Bodies, Composite, World } = Matter;
        const engine = engineRef.current;

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

        const pegs: Matter.Body[] = [];
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 6; j++) {
                const x = 50 + j * 60 + (i % 2 === 0 ? 30 : 0);
                const y = 100 + i * 50;
                pegs.push(Bodies.circle(x, y, 4, {
                    isStatic: true,
                    render: { fillStyle: '#ffcc00' }
                }));
            }
        }

        World.add(engine.world, [ground, leftWall, rightWall, ...pegs]);

        // 3. 物理エンジンの実行
        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);

        // クリックイベントの登録
        const handleMouseDown = () => shootBall();
        window.addEventListener('mousedown', handleMouseDown);

        // クリーンアップ
        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
            Render.stop(render);
            Runner.stop(runner);
            Engine.clear(engine);
            if (render.canvas) {
                render.canvas.remove();
            }
        };
    }, []);

    // 玉を発射する関数
    const shootBall = (): void => {
        const { Bodies, Body, Composite } = Matter;
        const ball = Bodies.circle(380, 50, 8, {
            restitution: 0.5,
            friction: 0.005,
            render: { 
                // 今後Sprite画像を入れる場合はここを編集
                fillStyle: '#00ffcc' 
            }
        });
        
        Body.setVelocity(ball, { x: -5, y: 0 });
        Composite.add(engineRef.current.world, ball);
    };

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ 
                color: 'white', 
                position: 'absolute', 
                top: -30, 
                width: '100%', 
                textAlign: 'center',
                fontFamily: 'sans-serif'
            }}>
                TS Mode: Typing will trigger balls
            </div>
            <div ref={sceneRef} />
        </div>
    );
};

export default Pachinko;