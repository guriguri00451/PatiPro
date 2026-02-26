import Matter from 'matter-js';

/**
 * 物理演算の設定値
 */
export const PHYSICS_CONFIG = {
    BOARD_WIDTH: 400,
    BOARD_HEIGHT: 600,
    PEG_PROXIMITY_THRESHOLD: 18,  // 玉が釘に近づいたと判定する距離
    PEG_LEAVE_THRESHOLD: 28,      // 玉が離れたと判定する距離
    LAUNCH_POWER_MIN: 12,
    LAUNCH_POWER_MAX: 30,
    // へそ（玉が入る穴）の設定
    HESO_X: 200,
    HESO_Y: 500,
    HESO_RADIUS: 15,
    // 右打ちへそ（ラッシュ中の排出口）の設定
    RUSH_HESO_X: 334,
    RUSH_HESO_Y: 520,
    RUSH_HESO_RADIUS: 14,
    RUSH_HESO_SPIN_BONUS: 5,
} as const;

/**
 * へそ（玉が入る穴）の設定
 */
export interface HesoConfig {
    x: number;
    y: number;
    radius: number;
}

/**
 * 釘の状態を管理する型定義
 */
export interface PegState {
    body: Matter.Body;
    health: number;           // 0-1 (1=新品, 0=完全劣化)
    originalX: number;
    originalY: number;
    currentX: number;
    currentY: number;
    constraint: Matter.Constraint | null;  // バネのリファレンス
    isActive: boolean;        // 現在アクティブ（動的）かどうか
    totalImpacts: number;     // 累積衝突回数
    restitution: number;      // 現在の反発係数
}

/**
 * デバッグ情報
 */
export interface DebugInfo {
    fps: number;
    ballCount: number;
    activePegCount: number;
    totalPegCount: number;
}
