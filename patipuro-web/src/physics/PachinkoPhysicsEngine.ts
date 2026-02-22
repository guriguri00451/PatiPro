import Matter from 'matter-js';
import { PegStateManager } from './PegStateManager';
import { PHYSICS_CONFIG, DebugInfo } from './types';

/**
 * パチンコ物理演算エンジン
 */
export class PachinkoPhysicsEngine {
    private engine: Matter.Engine;
    private pegManager: PegStateManager;
    private balls: Set<Matter.Body> = new Set();
    private fps: number = 0;
    private lastTime: number = Date.now();
    private frameCount: number = 0;
    private collisionThisFrame: Set<string> = new Set(); // 同一フレーム内の重複衝突防止
    private lastCollisionTime: Map<string, number> = new Map(); // 各ペアの最後の衝突時刻
    private readonly COLLISION_COOLDOWN = 100; // 同じペアは100ms間隔でのみ疲労適用

    constructor() {
        this.engine = Matter.Engine.create();
        
        // すり抜け防止のための設定（より厳密に）
        this.engine.positionIterations = 12; // デフォルト6→12
        this.engine.velocityIterations = 10;  // デフォルト4→10

        this.pegManager = new PegStateManager(this.engine);
    }

    /**
     * エンジンを取得
     */
    getEngine(): Matter.Engine {
        return this.engine;
    }

    /**
     * 釘管理マネージャーを取得
     */
    getPegManager(): PegStateManager {
        return this.pegManager;
    }

    /**
     * 玉を発射（実際のパチンコ風）
     */
    shootBall(launchPower: number): Matter.Body {
        const { Bodies, Body, Composite } = Matter;

        // 発射位置：左上
        const launchX = 56;
        const launchY = 82;

        const ball = Bodies.circle(launchX, launchY, 5.2, {
            restitution: 0.5,
            friction: 0.005,
            frictionAir: 0.001,  // 空気抵抗（すり抜け防止）
            slop: 0.005,  // より厳密に
            inertia: Infinity,  // 回転慣性を大きくして安定化
            density: 0.004,  // 密度を上げて安定化
            // collisionFilter はデフォルト → 発射レーン壁・カーブレールと正しく衝突する
            render: {
                fillStyle: '#ff6b6b' // パチンコ玉っぽい色
            }
        });

        // 左上から盤面へ斜めに流し込む（発射力の差を出しやすい補間）
        const launchRange = PHYSICS_CONFIG.LAUNCH_POWER_MAX - PHYSICS_CONFIG.LAUNCH_POWER_MIN;
        const powerRatio = launchRange > 0
            ? (launchPower - PHYSICS_CONFIG.LAUNCH_POWER_MIN) / launchRange
            : 0;
        const clampedPowerRatio = Math.max(0, Math.min(1, powerRatio));
        const speed = 5.2 + clampedPowerRatio * 5.8; // 5.2〜11.0
        const dirX = 0.82;
        const dirY = 0.57;

        Body.setVelocity(ball, { x: speed * dirX, y: speed * dirY });
        Composite.add(this.engine.world, ball);
        this.balls.add(ball);

        // 玉が下に落ちたら削除（アウト口）
        const checkInterval = setInterval(() => {
            if (ball.position.y > PHYSICS_CONFIG.BOARD_HEIGHT + 50) {
                this.removeBall(ball);
                clearInterval(checkInterval);
            }
        }, 100);

        // 最大15秒で強制削除
        setTimeout(() => {
            clearInterval(checkInterval);
            this.removeBall(ball);
        }, 15000);

        return ball;
    }

    /**
     * 玉を削除
     */
    removeBall(ball: Matter.Body): void {
        if (this.balls.has(ball)) {
            Matter.Composite.remove(this.engine.world, ball);
            this.balls.delete(ball);
            
            // この球に関連する衝突時刻レコードをクリーンアップ
            const ballId = ball.id;
            const keysToDelete: string[] = [];
            this.lastCollisionTime.forEach((_, key) => {
                if (key.startsWith(`${ballId}-`) || key.endsWith(`-${ballId}`)) {
                    keysToDelete.push(key);
                }
            });
            keysToDelete.forEach(key => this.lastCollisionTime.delete(key));
        }
    }

    /**
     * フレーム更新処理
     */
    update(): void {
        // 衝突履歴をクリア（新しいフレーム）
        this.collisionThisFrame.clear();
        
        // FPS計測
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = now;
        }

        // 玉がない場合は処理をスキップ（パフォーマンス最適化）
        if (this.balls.size === 0) {
            this.pegManager.deactivateAllPegs();
            return;
        }

        // 各玉について、近くの釘をチェック + 速度制限
        const maxSpeed = 12; // すり抜け防止のための最大速度
        this.balls.forEach((ball) => {
            this.pegManager.updateProximity(ball.position);
            
            // 速度が速すぎる場合は制限する
            const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
            if (speed > maxSpeed) {
                const scale = maxSpeed / speed;
                Matter.Body.setVelocity(ball, {
                    x: ball.velocity.x * scale,
                    y: ball.velocity.y * scale
                });
            }
        });
    }

    /**
     * 衝突イベントを処理
     */
    handleCollision(pair: Matter.Pair): void {
        const { bodyA, bodyB } = pair;

        // どちらかが玉で、もう一方が釘かチェック
        let ball: Matter.Body | null = null;
        let pegBody: Matter.Body | null = null;

        if (this.balls.has(bodyA) && this.pegManager.getPegState(bodyB.id)) {
            ball = bodyA;
            pegBody = bodyB;
        } else if (this.balls.has(bodyB) && this.pegManager.getPegState(bodyA.id)) {
            ball = bodyB;
            pegBody = bodyA;
        }

        if (ball && pegBody) {
            // 同じ釘との重複衝突を防ぐ（フレーム内）
            const collisionKey = `${ball.id}-${pegBody.id}`;
            if (this.collisionThisFrame.has(collisionKey)) {
                return;
            }
            this.collisionThisFrame.add(collisionKey);
            
            // 時間ベースのクールダウンチェック（連続発火防止）
            const now = Date.now();
            const lastTime = this.lastCollisionTime.get(collisionKey);
            if (lastTime && (now - lastTime) < this.COLLISION_COOLDOWN) {
                return; // クールダウン中はスキップ
            }
            
            // 衝突の強さを計算（相対速度を使用）
            const relativeVelX = ball.velocity.x - pegBody.velocity.x;
            const relativeVelY = ball.velocity.y - pegBody.velocity.y;
            const impactStrength = Math.sqrt(
                relativeVelX ** 2 + relativeVelY ** 2
            );
            
            // 最小衝突強度の閾値（弱い接触は無視）
            const minImpactThreshold = 3.0;
            if (impactStrength >= minImpactThreshold) {
                this.pegManager.applyFatigue(pegBody.id, impactStrength);
                this.lastCollisionTime.set(collisionKey, now); // 衝突時刻を記録
            }
        }
    }

    /**
     * デバッグ情報を取得
     */
    getDebugInfo(): DebugInfo {
        return {
            fps: this.fps,
            ballCount: this.balls.size,
            activePegCount: this.pegManager.getActivePegIds().size,
            totalPegCount: this.pegManager.getAllPegStates().size
        };
    }

    /**
     * 現在の玉のセットを取得
     */
    getBalls(): Set<Matter.Body> {
        return this.balls;
    }

    /**
     * クリーンアップ
     */
    clear(): void {
        this.balls.clear();
        this.pegManager.clear();
        Matter.Engine.clear(this.engine);
    }
}
