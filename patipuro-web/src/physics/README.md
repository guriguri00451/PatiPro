# パチンコ物理演算システム

## ディレクトリ構成

```
src/
├── Patinko-home.tsx            # UI統合コンポーネント
└── physics/
    ├── index.ts                # エクスポート集約
    ├── types.ts                # 型定義・定数
    ├── PegStateManager.ts      # 釘の状態管理（疲労・近接フラグ）
    ├── PegLayoutGenerator.ts   # 編集しやすい釘座標生成
    ├── HesoManager.ts          # へそ（玉が入る穴）の検知
    └── PachinkoPhysicsEngine.ts # 物理演算コア
```

## 現在の実装仕様

### 釘配置 (`PegLayoutGenerator.ts`)
- 釘は **固定座標ベース**（ランダム要素なし）
- 主に `rowSpecs` と `buildZigzagColumns` で構成
- 目安本数は現設定で **約110本前後**
- `customPegs` は個別に座標を足したい時の拡張ポイント

### 釘状態 (`PegStateManager.ts`)
- 釘ボディは常に `isStatic: true`
- `isActive` は近接状態を示すフラグとして利用（デバッグ用途含む）
- 玉との衝突で疲労を蓄積し、色と反発係数を更新

### 疲労モデル
- `health` は `1.0 -> 0.0` で劣化
- `restitution` は `0.8 -> 0.2` に低下
- `health` が 0 でも釘は削除されず、そのまま衝突対象として残る

### 発射・更新 (`PachinkoPhysicsEngine.ts`)
- 玉は左上付近から盤面へ斜め方向に発射
- 発射パワーは `PHYSICS_CONFIG.LAUNCH_POWER_MIN/MAX` で補間
- 同一ペア衝突の重複防止（フレーム内 + 時間クールダウン）
- 最高速度制限とアウト口/タイムアウト削除あり

### へそ (`HesoManager.ts`, `types.ts`)
- 玉が指定範囲（円形）内に入ると検知し、コールバック呼び出し後に玉を削除
- 位置・半径は `types.ts` の `HESO_X`, `HESO_Y`, `HESO_RADIUS` で設定
- UI 実装方法は `docs/patipuro-web/heso_ui_implementation.md` を参照

## 調整ポイント

- 発射強度レンジ: `types.ts` の `LAUNCH_POWER_MIN/MAX`
- 近接判定距離: `types.ts` の `PEG_PROXIMITY_THRESHOLD`, `PEG_LEAVE_THRESHOLD`
- 釘レイアウト: `PegLayoutGenerator.ts` の `rowSpecs`, `customPegs`, `buildZigzagColumns`
- 疲労速度: `PegStateManager.ts` の `fatigueAmount` 計算式
- へそ位置・サイズ: `types.ts` の `HESO_X`, `HESO_Y`, `HESO_RADIUS`

## 使い方（最小例）

```typescript
import { PachinkoPhysicsEngine, PegLayoutGenerator } from './physics';
import Matter from 'matter-js';

const physicsEngine = new PachinkoPhysicsEngine();
const pegManager = physicsEngine.getPegManager();

const pegs = PegLayoutGenerator.generateRealisticPegs(Matter.Bodies);
pegs.forEach((peg) => {
  pegManager.addPeg(peg, peg.position.x, peg.position.y);
});

physicsEngine.shootBall(20);
physicsEngine.update();
```
