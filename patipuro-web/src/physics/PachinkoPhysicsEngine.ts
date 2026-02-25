import Matter from 'matter-js';
import { PegStateManager } from './PegStateManager';
import { HesoManager } from './HesoManager';
import { PHYSICS_CONFIG, DebugInfo } from './types';

/**
 * パチンコ物理演算エンジン
 */
export class PachinkoPhysicsEngine {
    private engine: Matter.Engine;
    private pegManager: PegStateManager;
    private hesoManager: HesoManager;
    private balls: Set<Matter.Body> = new Set();
    private monitorSensorIds: Set<number> = new Set();
    private ballInMonitorZone: Set<number> = new Set();
    private monitorEnterListeners: Set<(ball: Matter.Body) => void> = new Set();
    private monitorLeaveListeners: Set<(ball: Matter.Body) => void> = new Set();
    private fps: number = 0;
    private lastTime: number = Date.now();
    private frameCount: number = 0;
    private collisionThisFrame: Set<string> = new Set(); // 同一フレーム内の重複衝突防止
    private lastCollisionTime: Map<string, number> = new Map(); // 各ペアの最後の衝突時刻
    private readonly COLLISION_COOLDOWN = 100; // 同じペアは100ms間隔でのみ疲労適用
    private stopperCooldown: Map<number, number> = new Map();
    private lowSpeedSince: Map<number, number> = new Map();
    private launchPhaseBalls: Set<number> = new Set(); // 発射レーン通過中の玉（速度上限免除）
    private rushMode: boolean = false;
    private rushModeBalls: Set<number> = new Set(); // 右打ち中の玉
    private readonly WIN_RAIL_PROBABILITY = 0.5;
    private readonly WIN_ENTRY_TARGET = { x: 92, y: 172 };
    private readonly LOSE_ENTRY_TARGET = { x: 212, y: 116 };

    constructor(onHesoEntered?: (ball: Matter.Body) => void) {
        this.engine = Matter.Engine.create();
        
        // すり抜け防止のための設定（より厳密に）
        this.engine.positionIterations = 12; // デフォルト6→12
        this.engine.velocityIterations = 10;  // デフォルト4→10

        this.pegManager = new PegStateManager(this.engine);
        this.hesoManager = new HesoManager(onHesoEntered ?? (() => {}));
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
     * モニター演出ゾーン（センサー）を登録
     */
    registerMonitorSensor(sensorBody: Matter.Body): void {
        this.monitorSensorIds.add(sensorBody.id);
    }

    /**
     * モニターゾーン侵入時のイベント購読
     */
    onMonitorZoneEnter(listener: (ball: Matter.Body) => void): () => void {
        this.monitorEnterListeners.add(listener);
        return () => {
            this.monitorEnterListeners.delete(listener);
        };
    }

    /**
     * モニターゾーン離脱時のイベント購読
     */
    onMonitorZoneLeave(listener: (ball: Matter.Body) => void): () => void {
        this.monitorLeaveListeners.add(listener);
        return () => {
            this.monitorLeaveListeners.delete(listener);
        };
    }
    /**
     * へそ管理マネージャーを取得
     */
    getHesoManager(): HesoManager {
        return this.hesoManager;
    }

    /**
     * ラッシュモード（右打ち）の切り替え
     */
    setRushMode(enabled: boolean): void {
        this.rushMode = enabled;
    }

    /**
     * へそコールバックを後付けで設定
     */
    setHesoCallback(cb: (ball: Matter.Body) => void): void {
        this.hesoManager = new HesoManager(cb);
    }

    /**
     * 玉を発射（実際のパチンコ風）
     */
    shootBall(): Matter.Body {
        const { Bodies, Body, Composite } = Matter;

        // 発射位置：左下の打ち出しレーン底部（x=5外壁とx=25内壁の間）
        const launchX = 15;
        const launchY = 565;

        const ball = Bodies.circle(launchX, launchY, 5.2, {
            restitution: 0.9,
            friction: 0.005,
            frictionAir: 0.001,  // 空気抵抗（すり抜け防止）
            slop: 0.005,  // より厳密に
            density: 0.004,  // 密度を上げて安定化
            // collisionFilter はデフォルト → 発射レーン壁・カーブレールと正しく衝突する
            render: {
                fillStyle: '#ff6b6b' // パチンコ玉っぽい色
            },
            // --- すり抜け対策の核 ---
            plugin: {
                continuous: {
                    enabled: true // 連続衝突判定を有効化
                }
            }
        });

        // 下から上へ打ち出し
        // ラッシュ中（右打ち）は強めに発射して右チャンネルへ
        const speed = this.rushMode
            ? 25 + Math.random() * 2   // 右打ち：強め（27〜29）
            : 16 + Math.random() * 2;  // 通常（18〜20）
        const dirX = 0.08;
        const dirY = -1.0;

        Body.setVelocity(ball, { x: speed * dirX, y: speed * dirY });
        Composite.add(this.engine.world, ball);
        this.balls.add(ball);
        this.launchPhaseBalls.add(ball.id); // 発射レーン通過中として登録
        if (this.rushMode) this.rushModeBalls.add(ball.id); // 右打ち玉として登録

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
            this.ballInMonitorZone.delete(ball.id);
            this.stopperCooldown.delete(ball.id);
            this.lowSpeedSince.delete(ball.id);
            this.launchPhaseBalls.delete(ball.id);
            this.rushModeBalls.delete(ball.id);
            
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

        // 各玉について、近くの釘をチェック + 速度制限 + へそ判定
        this.balls.forEach((ball) => {
            this.pegManager.updateProximity(ball.position);

            const isRushBall = this.rushModeBalls.has(ball.id);

            // 発射レーン通過中の速度制限免除を解除するタイミング
            // 通常：上端（y < 160）で解除
            // 右打ち：右チャンネルに到達（x > 260）するまで解除しない
            if (this.launchPhaseBalls.has(ball.id)) {
                const shouldExit = isRushBall
                    ? ball.position.x > 260  // 右打ち：右半分に入るまで高速維持
                    : ball.position.y < 160; // 通常：上端で解除
                if (shouldExit) this.launchPhaseBalls.delete(ball.id);
            }

            // 速度が速すぎる場合は制限する（発射レーン内は免除）
            // 右打ち玉は通常より高い上限（右チャンネルまでのエネルギーを確保）
            const maxSpeed = isRushBall ? 20 : 12;
            const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
            if (!this.launchPhaseBalls.has(ball.id) && speed > maxSpeed) {
                const scale = maxSpeed / speed;
                Matter.Body.setVelocity(ball, {
                    x: ball.velocity.x * scale,
                    y: ball.velocity.y * scale
                });
            }

            // 棒上で停滞した玉を軽く再加速
            const now = Date.now();
            if (speed < 0.32) {
                const stalledSince = this.lowSpeedSince.get(ball.id) ?? now;
                this.lowSpeedSince.set(ball.id, stalledSince);

                if (now - stalledSince > 260) {
                    Matter.Body.setVelocity(ball, {
                        x: ball.velocity.x + (Math.random() - 0.5) * 0.8,
                        y: ball.velocity.y + 1.6
                    });
                    this.lowSpeedSince.set(ball.id, now);
                }
            } else {
                this.lowSpeedSince.delete(ball.id);
            }
        });

        // 発射レーン底部に溜まった玉を削除（上向きに動いていない玉のみ）
        const laneStragglers: Matter.Body[] = [];
        this.balls.forEach((ball) => {
            if (ball.position.x < 30 && ball.position.y > 555 && ball.velocity.y > -1) {
                laneStragglers.push(ball);
            }
        });
        laneStragglers.forEach((ball) => this.removeBall(ball));

        // へそに入った玉を検知して削除
        const hesoEntered = this.hesoManager.checkBalls(this.balls);
        hesoEntered.forEach((ball) => this.removeBall(ball));
    }

    /**
     * 衝突イベントを処理
     */
    handleCollision(pair: Matter.Pair): void {
        const { bodyA, bodyB } = pair;

        const stopperBall = this.getStopperCollisionBall(bodyA, bodyB);
        if (stopperBall) {
            this.applyNezumiGaeshiRandomDrop(stopperBall);
        }

        const monitorZoneBody = this.getMonitorZoneBody(bodyA, bodyB);
        if (monitorZoneBody) {
            const ball = monitorZoneBody;
            if (!this.ballInMonitorZone.has(ball.id)) {
                this.ballInMonitorZone.add(ball.id);
                this.monitorEnterListeners.forEach((listener) => listener(ball));
            }
            return;
        }

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
     * 衝突終了イベントを処理
     */
    handleCollisionEnd(pair: Matter.Pair): void {
        const { bodyA, bodyB } = pair;
        const monitorZoneBody = this.getMonitorZoneBody(bodyA, bodyB);
        if (!monitorZoneBody) return;

        const ball = monitorZoneBody;
        if (this.ballInMonitorZone.has(ball.id)) {
            this.ballInMonitorZone.delete(ball.id);
            this.monitorLeaveListeners.forEach((listener) => listener(ball));
        }
    }

    private getMonitorZoneBody(bodyA: Matter.Body, bodyB: Matter.Body): Matter.Body | null {
        if (this.balls.has(bodyA) && this.monitorSensorIds.has(bodyB.id)) {
            return bodyA;
        }
        if (this.balls.has(bodyB) && this.monitorSensorIds.has(bodyA.id)) {
            return bodyB;
        }
        return null;
    }

    private getStopperCollisionBall(bodyA: Matter.Body, bodyB: Matter.Body): Matter.Body | null {
        const isBodyAStopper = bodyA.label === 'nezumi-gaeshi';
        const isBodyBStopper = bodyB.label === 'nezumi-gaeshi';

        if (isBodyAStopper && this.balls.has(bodyB)) return bodyB;
        if (isBodyBStopper && this.balls.has(bodyA)) return bodyA;
        return null;
    }

    private applyNezumiGaeshiRandomDrop(ball: Matter.Body): void {
        const now = Date.now();
        const last = this.stopperCooldown.get(ball.id) ?? 0;
        if (now - last < 120) return;

        const goWinRail = Math.random() < this.WIN_RAIL_PROBABILITY;
        const target = goWinRail ? this.WIN_ENTRY_TARGET : this.LOSE_ENTRY_TARGET;

        const dx = target.x - ball.position.x;
        const dy = target.y - ball.position.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / length;
        const ny = dy / length;

        const baseSpeed = goWinRail ? 8.8 : 9.5;
        const speedJitter = 0.85 + Math.random() * 0.35;
        const jitterX = (Math.random() - 0.5) * (goWinRail ? 1.3 : 1.8);
        const jitterY = (Math.random() - 0.5) * 0.9;

        Matter.Body.setVelocity(ball, {
            x: nx * baseSpeed * speedJitter + jitterX,
            y: ny * baseSpeed * speedJitter + jitterY
        });

        this.stopperCooldown.set(ball.id, now);
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
        this.monitorSensorIds.clear();
        this.ballInMonitorZone.clear();
        this.stopperCooldown.clear();
        this.lowSpeedSince.clear();
        this.launchPhaseBalls.clear();
        this.rushModeBalls.clear();
        this.monitorEnterListeners.clear();
        this.monitorLeaveListeners.clear();
        this.pegManager.clear();
        Matter.Engine.clear(this.engine);
    }
}
