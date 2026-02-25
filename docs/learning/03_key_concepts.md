# 重要な実装パターン

## 1. 釘の「金属疲労」システム

パチンコの釘は衝突を繰り返すと劣化します（甘釘化）。
これを `PegStateManager` が管理しています。

### PegState の型定義

```typescript
// src/physics/types.ts
export interface PegState {
    body: Matter.Body;      // Matter.js の物理ボディ
    health: number;         // 0.0（完全劣化）〜 1.0（新品）
    originalX: number;      // 初期 X 座標
    originalY: number;      // 初期 Y 座標
    currentX: number;       // 現在 X 座標
    currentY: number;       // 現在 Y 座標
    constraint: Matter.Constraint | null; // バネ（現状は未使用）
    isActive: boolean;      // 近接しているか
    totalImpacts: number;   // 累積衝突回数
    restitution: number;    // 現在の反発係数（0.2〜0.8）
}
```

### 疲労計算の式

```typescript
// src/physics/PegStateManager.ts: applyFatigue()
const fatigueAmount = impactStrength * 0.0008 + pegState.totalImpacts * 0.00002;
pegState.health = Math.max(0, pegState.health - fatigueAmount);
```

- `impactStrength * 0.0008`: 強い衝突ほど多く劣化
- `totalImpacts * 0.00002`: 衝突回数が多いほど少し劣化が加速
- `Math.max(0, ...)`: health が 0 未満にならないよう保護

### 反発係数の変化

```typescript
// 健康度に応じて反発係数を線形補間
// 新品（health=1.0）→ restitution = 0.8
// 完全劣化（health=0.0）→ restitution = 0.2
pegState.restitution = 0.8 * pegState.health + 0.2 * (1 - pegState.health);
Body.set(pegState.body, { restitution: pegState.restitution });
```

### 釘の色変化

```typescript
// health: 1.0（新品）= rgb(255, 204, 51) 黄色
// health: 0.0（劣化）= rgb(255, 100, 0) 赤錆色
private getColorFromHealth(health: number): string {
    const r = 255;
    const g = Math.floor(204 * health + 100 * (1 - health)); // 204→100
    const b = Math.floor(health * 51); // 51→0
    return `rgb(${r}, ${g}, ${b})`;
}
```

---

## 2. 重複衝突防止パターン

Matter.js は同じ衝突を複数回発火することがあります。2 段階の防止策があります。

### フレーム内の重複防止

```typescript
// PachinkoPhysicsEngine.ts
private collisionThisFrame: Set<string> = new Set();

handleCollision(pair: Matter.Pair): void {
    const collisionKey = `${ball.id}-${pegBody.id}`;

    // 同じフレームで同じペアの衝突を2回処理しない
    if (this.collisionThisFrame.has(collisionKey)) return;
    this.collisionThisFrame.add(collisionKey);

    // ...
}

update(): void {
    this.collisionThisFrame.clear(); // 毎フレームリセット
}
```

### 時間ベースのクールダウン

```typescript
private lastCollisionTime: Map<string, number> = new Map();
private readonly COLLISION_COOLDOWN = 100; // ms

// 同じ球・釘ペアは 100ms に1回しか疲労を適用しない
const lastTime = this.lastCollisionTime.get(collisionKey);
if (lastTime && (now - lastTime) < this.COLLISION_COOLDOWN) {
    return;
}
this.lastCollisionTime.set(collisionKey, now);
```

---

## 3. すり抜け防止のための設定

小さくて速い物体（玉）は、1 フレームで壁や釘を「すり抜ける」ことがあります。
以下の設定でこれを防いでいます。

```typescript
// エンジンの反復回数を増やす（精度向上）
this.engine.positionIterations = 12; // デフォルト 6 → 12
this.engine.velocityIterations = 10;  // デフォルト 4 → 10

// 玉の物理パラメータ
const ball = Bodies.circle(x, y, 5.2, {
    frictionAir: 0.001,  // 空気抵抗（すり抜け防止に一定の効果）
    slop: 0.005,         // 重なりの許容量を小さく（より厳密な衝突判定）
    inertia: Infinity,   // 回転慣性を無限大にして安定化
    density: 0.004,      // 密度を上げて安定化
});

// 速度の上限を設定
const maxSpeed = 12;
if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    Matter.Body.setVelocity(ball, { x: velocity.x * scale, y: velocity.y * scale });
}
```

---

## 4. 近接検出の最適化

全ての釘との距離を毎フレーム計算すると重いため、まず矩形チェックで絞り込んでから正確な円形判定をしています。

```typescript
// PegStateManager.ts: updateProximity()
updateProximity(ballPosition: { x: number; y: number }): void {
    this.pegStates.forEach((pegState, pegId) => {
        const pegPos = pegState.body.position;

        // 1. 矩形チェック（安い計算）で早期リターン
        const dx = Math.abs(ballPosition.x - pegPos.x);
        const dy = Math.abs(ballPosition.y - pegPos.y);
        if (dx > PHYSICS_CONFIG.PEG_LEAVE_THRESHOLD ||
            dy > PHYSICS_CONFIG.PEG_LEAVE_THRESHOLD) {
            if (pegState.isActive) this.deactivatePeg(pegId);
            return;
        }

        // 2. 正確な距離計算（重い計算）は近いものだけ
        const distance = Math.sqrt(
            (pegPos.x - ballPosition.x) ** 2 + (pegPos.y - ballPosition.y) ** 2
        );

        if (distance < PHYSICS_CONFIG.PEG_PROXIMITY_THRESHOLD && !pegState.isActive) {
            this.activatePeg(pegId);
        } else if (distance > PHYSICS_CONFIG.PEG_LEAVE_THRESHOLD && pegState.isActive) {
            this.deactivatePeg(pegId);
        }
    });
}
```

---

## 5. 釘配置の定義方法

釘の配置は `PegLayoutGenerator` に「行の仕様」として定義されています。
直感的に釘を追加・調整できます。

```typescript
// PegLayoutGenerator.ts
const rowSpecs = [
    { y: 170, xStart: 92, count: 8, step: 32 },           // 8本、32px間隔
    { y: 236, xStart: 92, count: 8, step: 32,
      skipIndices: [3, 4] },  // 3番目と4番目を空ける（中央に穴）
];

// サイドの道釘（ジグザグ列）
const leftGuidePegs = this.buildZigzagColumns(
    34,   // xA: 左列の X 座標
    52,   // xB: 右列の X 座標
    166,  // yStart: 開始 Y 座標
    32,   // rowStep: 行間隔
    16,   // offset: A 列と B 列の Y オフセット差
    10    // rows: 行数
);
```

---

## 6. VS Code 拡張機能のビルド・Lint 検知パターン

設定ファイル（`package.json` の `patipuro.buildPatterns`）で検知コマンドを設定できます。
デフォルトは多数の言語に対応しています。

```json
"patipuro.buildPatterns": [
    "run build", "tsc", "webpack", "vite build",
    "flutter build", "cargo build", "go build",
    "gradle build", "swift build"
]
```

部分一致で検知するため、`npm run build` も `yarn run build` も同じパターンで検知できます。

---

## 7. RushMode（ラッシュ演出）コンポーネント

`RushMode.tsx` はパチンコの「大当たりラッシュ」を再現する液晶演出コンポーネントです。

### 動作の仕組み

```
isOpen = true になる
    ↓
remainingSpins をリセット（maxSpins に戻す）
    ↓
startSpin() が呼ばれる
    ↓
lottery() で結果を抽選（success / reach / failure）
    ↓
結果に対応する動画 URL をランダム選択して <video> を再生
    ↓
動画が終了（onEnded）
    ↓
success → remainingSpins を MAX に戻して次のスピンへ
failure/reach → remainingSpins を 1 減らす
    ↓
残り 0 になったら onRushEnd() コールバックを呼ぶ
```

### 確率定数

```typescript
// src/components/RushMode.tsx
const PROB_SUCCESS = 0.010; // 約1/99 当たり確率
const PROB_REACH   = 0.100; // 10%  リーチ演出に発展する確率
// 残りはハズレ（= 1 - 0.010 - 0.100 = 89%）
```

### Props 定義

```typescript
type Props = {
  isOpen: boolean;     // ラッシュ表示のON/OFF
  maxSpins: number;    // 最大スピン回数（当たると復活）
  moviePaths: {        // 演出ごとの動画URLリスト
    reach: string[];
    success: string[];
    failure: string[];
  };
  onRushEnd: () => void; // ラッシュ終了コールバック
};
```

### 古いクロージャ問題を避ける Ref パターン

コールバック（`onEnded`）は初回レンダーで登録されるため、最新の props を `useRef` 経由で参照しています。

```typescript
const onRushEndRef = useRef(onRushEnd);
useEffect(() => { onRushEndRef.current = onRushEnd; }, [onRushEnd]);

// onEnded ハンドラ内では Ref 経由で呼ぶ（古いクロージャを避ける）
onRushEndRef.current();
```

### 現在の仮実装について

`Patinko-home.tsx` に仮の動画 URL が直書きされています（`testMoviePaths`）。
将来は `.pati` ファイル（演出パッケージ）から動画を読み込む予定です。

```typescript
// 仮置き（将来は削除予定）
const testMoviePaths = {
    reach: ["https://www.w3schools.com/html/mov_bbb.mp4"],
    success: ["..."],
    failure: ["..."]
};
```

---

## 8. 演出システム（.pati ファイル）— 将来の仕様

`EffectRule.md` に記述されている将来の演出パッケージ仕様です。現在は未実装ですが、設計理解に重要です。

### .pati ファイルの構造

```
example.pati (ZIP形式)
├── config.json      # 演出の全定義（抽選テーブル・シーケンス）
└── assets/
    ├── movies/      # mp4
    ├── images/      # png, jpg, svg
    └── sounds/      # mp3, wav
```

### config.json の主要フィールド

```json
{
  "lottery": {
    "probability": 0.003,
    "patterns": [
      { "id": "pattern_01", "weight": 10, "is_win": true, "sequence_id": "seq_reach_01" }
    ]
  },
  "sequences": [
    {
      "id": "seq_reach_01",
      "total_duration": 15000,
      "layers": [
        { "type": "video", "resource_id": "vid_reach_01", "start_time": 0, "stop_time": 5000 },
        { "type": "slot",  "resource_id": "slot_01",     "start_time": 0 }
      ]
    }
  ]
}
```

### ID 解決フロー（なぜ直接パスを使わないか）

VS Code Webview のセキュリティ制限により、ローカルファイルパスを React に直接渡せません。

```
1. 拡張機能が起動時に .pati（ZIP）を展開
2. asWebviewUri() でファイルパスを Webview 用 URL に変換
3. 「ID: URL」マッピングテーブルを postMessage で React に送信
4. React は src に直接パスを書かず、ID からテーブルを引く
```

---

## 命名規則・コーディング規約

| 対象 | 規則 | 例 |
|---|---|---|
| ファイル名（物理モジュール） | PascalCase | `PachinkoPhysicsEngine.ts` |
| クラス | PascalCase | `PegStateManager` |
| 定数 | UPPER_SNAKE_CASE | `PHYSICS_CONFIG`, `BOARD_WIDTH` |
| メソッド・変数 | camelCase | `shootBall()`, `launchPower` |
| React コンポーネント | PascalCase | `Patinko-home.tsx`（ファイルはケバブ） |

---

## 初学者がつまずきやすいポイント

### 1. メッセージが 2 段階で転送される

「VS Code 拡張 → Webview」と「Webview → React（iframe）」の 2 段階があります。
extension.ts で `postMessageToAll()` を呼んでも、Webview HTML の `window.addEventListener('message', ...)` を経由してから、finally iframe（React）に届きます。

### 2. `useRef` と `useState` の使い分け

コールバック（WebSocket の `onmessage`、`setInterval`）から参照する値は `useRef` を使います。
`useState` は再レンダーをトリガーするため、コールバックのたびにレンダーが走ると重くなります。

### 3. 開発時は `localhost:5173` が必要

extension.ts の `getWebviewContent()` がハードコードで `http://localhost:5173` を参照しています。
Vite の開発サーバー（`npm run dev`）が起動していないと、WebView が真っ黒になります。

### 4. クリーンアップが重要

`useEffect` のクリーンアップ関数で、Matter.js のイベントリスナー・WebSocket 接続・タイマーをすべて解除しています。これをしないと、コンポーネントがアンマウントされた後もリスナーが残って不具合が起きます。
