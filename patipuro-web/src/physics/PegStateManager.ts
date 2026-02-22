import Matter from 'matter-js';
import { PegState, PHYSICS_CONFIG } from './types';

/**
 * 釘の状態管理クラス（物理演算担当）
 */
export class PegStateManager {
    private pegStates: Map<number, PegState> = new Map();
    private activePegIds: Set<number> = new Set();
    private engine: Matter.Engine;

    constructor(engine: Matter.Engine) {
        this.engine = engine;
    }

    /**
     * 釘を初期化して追加
     */
    addPeg(body: Matter.Body, x: number, y: number): void {
        this.pegStates.set(body.id, {
            body,
            health: 1.0,
            originalX: x,
            originalY: y,
            currentX: x,
            currentY: y,
            constraint: null,
            isActive: false,
            totalImpacts: 0,
            restitution: 0.8
        });

        Matter.Body.setStatic(body, true);
    }

    /**
     * 釘をアクティブ化（近接フラグON）
     */
    activatePeg(pegId: number): void {
        const pegState = this.pegStates.get(pegId);
        if (!pegState || pegState.isActive) return;

        Matter.Body.setStatic(pegState.body, true);
        pegState.isActive = true;
        this.activePegIds.add(pegId);
    }

    /**
     * 釘を非アクティブ化（近接フラグOFF）
     */
    deactivatePeg(pegId: number): void {
        const pegState = this.pegStates.get(pegId);
        if (!pegState || !pegState.isActive) return;

        Matter.Body.setStatic(pegState.body, true);
        pegState.isActive = false;
        this.activePegIds.delete(pegId);
    }

    /**
     * 金属疲労を計算（衝突の強さに応じて劣化）
     */
    applyFatigue(pegId: number, impactStrength: number): void {
        const pegState = this.pegStates.get(pegId);
        if (!pegState) return;

        const { Body } = Matter;

        // 衝突回数を増やす
        pegState.totalImpacts++;

        // 劣化量を計算（衝突の強さと累積回数に依存）
        // 係数を大幅に小さく調整（100回以上の衝突に耐えられるように）
        const fatigueAmount = impactStrength * 0.0008 + pegState.totalImpacts * 0.00002;
        pegState.health = Math.max(0, pegState.health - fatigueAmount);

        // 反発係数を減少（甘釘化）
        pegState.restitution = 0.8 * pegState.health + 0.2 * (1 - pegState.health);
        Body.set(pegState.body, { restitution: pegState.restitution });

        // 色を更新
        pegState.body.render.fillStyle = this.getColorFromHealth(pegState.health);

        // 互換性のためconstraintフィールドは保持（現構成では通常null）
        if (pegState.constraint) {
            pegState.constraint.stiffness = 0.8 - (1 - pegState.health) * 0.3;
        }
    }

    /**
     * 健康度に基づいて色を計算（新品=黄色 → 劣化=赤錆色）
     */
    private getColorFromHealth(health: number): string {
        const r = Math.floor(255);
        const g = Math.floor(204 * health + 100 * (1 - health)); // 204→100
        const b = Math.floor(health * 51); // 51→0
        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * 近接チェックと自動アクティブ化/非アクティブ化
     */
    updateProximity(ballPosition: { x: number; y: number }): void {
        this.pegStates.forEach((pegState, pegId) => {
            const pegPos = pegState.body.position;

            const dx = Math.abs(ballPosition.x - pegPos.x);
            const dy = Math.abs(ballPosition.y - pegPos.y);

            if (dx > PHYSICS_CONFIG.PEG_LEAVE_THRESHOLD || dy > PHYSICS_CONFIG.PEG_LEAVE_THRESHOLD) {
                if (pegState.isActive) {
                    this.deactivatePeg(pegId);
                }
                return;
            }

            const distance = Math.sqrt((pegPos.x - ballPosition.x) ** 2 + (pegPos.y - ballPosition.y) ** 2);

            if (distance < PHYSICS_CONFIG.PEG_PROXIMITY_THRESHOLD && !pegState.isActive) {
                this.activatePeg(pegId);
            } else if (distance > PHYSICS_CONFIG.PEG_LEAVE_THRESHOLD && pegState.isActive) {
                this.deactivatePeg(pegId);
            }
        });
    }

    /**
     * すべてのアクティブな釘を非アクティブ化
     */
    deactivateAllPegs(): void {
        this.activePegIds.forEach(pegId => {
            this.deactivatePeg(pegId);
        });
    }

    /**
     * 釘の状態を取得
     */
    getPegState(pegId: number): PegState | undefined {
        return this.pegStates.get(pegId);
    }

    /**
     * すべての釘の状態を取得
     */
    getAllPegStates(): Map<number, PegState> {
        return this.pegStates;
    }

    /**
     * アクティブな釘のIDセットを取得
     */
    getActivePegIds(): Set<number> {
        return this.activePegIds;
    }

    /**
     * クリーンアップ
     */
    clear(): void {
        this.pegStates.clear();
        this.activePegIds.clear();
    }
}
