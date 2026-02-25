import Matter from 'matter-js';
import { PHYSICS_CONFIG } from './types';

/**
 * へそ（玉が入る穴）の検知・管理
 */
export class HesoManager {
    private readonly x: number;
    private readonly y: number;
    private readonly radius: number;
    private onBallEntered: (ball: Matter.Body) => void;

    constructor(onBallEntered: (ball: Matter.Body) => void) {
        this.x = PHYSICS_CONFIG.HESO_X;
        this.y = PHYSICS_CONFIG.HESO_Y;
        this.radius = PHYSICS_CONFIG.HESO_RADIUS;
        this.onBallEntered = onBallEntered;
    }

    /**
     * 玉がへそ内に入っているか判定
     */
    isBallInside(ball: Matter.Body): boolean {
        const dx = ball.position.x - this.x;
        const dy = ball.position.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= this.radius;
    }

    /**
     * へそに入った玉を検知し、コールバックを呼ぶ
     * @returns へそに入った玉の配列（削除対象）
     */
    checkBalls(balls: Set<Matter.Body>): Matter.Body[] {
        const entered: Matter.Body[] = [];
        balls.forEach((ball) => {
            if (this.isBallInside(ball)) {
                entered.push(ball);
                this.onBallEntered(ball);
            }
        });
        return entered;
    }

    /**
     * へその座標・半径を取得（描画用）
     */
    getConfig(): { x: number; y: number; radius: number } {
        return { x: this.x, y: this.y, radius: this.radius };
    }
}
