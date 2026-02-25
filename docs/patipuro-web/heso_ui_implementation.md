# へそ UI 実装ガイド

へそ（玉が入る穴）の UI を実装する際の手順と、可読性・変更しやすさを意識した設計指針です。

---

## 1. 前提：物理層の実装

へそ機能の**物理演算部分は既に実装済み**です。

| ファイル | 役割 |
|----------|------|
| `physics/types.ts` | `HESO_X`, `HESO_Y`, `HESO_RADIUS` でへそ位置・サイズを定義 |
| `physics/HesoManager.ts` | 玉がへそ内かどうかを判定 |
| `physics/PachinkoPhysicsEngine.ts` | へそに入った玉を検知し、コールバック呼び出し・玉削除 |

`PachinkoPhysicsEngine` のコンストラクタは、へそに入ったときに呼ばれるコールバックをオプションで受け取ります。

```typescript
// コールバックなし（玉は削除されるがカウント等は行わない）
new PachinkoPhysicsEngine();

// コールバックあり（玉がへそに入るたびに呼ばれる）
new PachinkoPhysicsEngine((ball) => {
  // ここで UI 更新などの処理
});
```

---

## 2. UI 実装の流れ

### 2.1 変更対象ファイル

UI の変更は **`Patinko-home.tsx`** に集約します。物理層は触らず、コールバック経由で連携します。

### 2.2 実装ステップ

#### Step 1: カウント用 state の追加

```tsx
// へそに入った玉のカウント
const [hesoCount, setHesoCount] = React.useState(0);
```

#### Step 2: 物理エンジンにコールバックを渡す

`useRef` の初期化時に、へそに入ったときの処理を渡します。

```tsx
const physicsEngineRef = useRef<PachinkoPhysicsEngine>(
  new PachinkoPhysicsEngine(() => setHesoCount((prev) => prev + 1))
);
```

`setHesoCount((prev) => prev + 1)` のように関数形式を使うことで、非同期イベントでも最新の state を参照できます。

#### Step 3: 画面上への表示

表示位置やスタイルは用途に合わせて変更しやすいように、定数やコンポーネントに分離することを推奨します。

```tsx
{/* 例: 画面上部にカウント表示 */}
<span style={{ marginLeft: '16px', color: '#ffd700', fontWeight: 'bold' }}>
  🎯 へそ: {hesoCount}
</span>
```

---

## 3. 可読性・変更しやすさのための設計

### 3.1 責務の分離

| 層 | 担当 | 変更時の影響範囲 |
|----|------|------------------|
| 物理層 (`physics/`) | へそ判定・玉削除 | 物理挙動のみ |
| UI 層 (`Patinko-home.tsx`) | カウント表示・見た目 | 表示のみ |

物理層と UI 層の境界はコールバックに限定し、物理層から UI の詳細を知らせないようにします。

### 3.2 定数・設定の集約

へそ関連の表示設定をまとめておくと、後から変更しやすくなります。

```tsx
// ファイル先頭などに定数をまとめる
const HESO_UI = {
  label: 'へそ',
  color: '#ffd700',
  icon: '🎯',
} as const;
```

### 3.3 表示コンポーネントの切り出し（任意）

表示が複雑になる場合は、専用コンポーネントに切り出します。

```tsx
// 例: HesoCounter.tsx
interface HesoCounterProps {
  count: number;
  label?: string;
}

const HesoCounter: React.FC<HesoCounterProps> = ({ count, label = 'へそ' }) => (
  <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
    🎯 {label}: {count}
  </span>
);
```

---

## 4. デバッグモードでのへそ表示

デバッグモード（D キー）でへそ範囲を描画する場合は、`drawDebug` 内で `getHesoManager().getConfig()` を使います。

```tsx
// drawDebug 内に追加
const hesoConfig = physicsEngine.getHesoManager().getConfig();
ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
ctx.lineWidth = 2;
ctx.setLineDash([5, 5]);
ctx.beginPath();
ctx.arc(hesoConfig.x, hesoConfig.y, hesoConfig.radius, 0, Math.PI * 2);
ctx.stroke();
ctx.setLineDash([]);
ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
ctx.fill();
```

---

## 5. へそ位置・サイズの変更

へその物理的な位置やサイズは `physics/types.ts` の `PHYSICS_CONFIG` で変更します。

```typescript
// physics/types.ts
HESO_X: 196,      // 中心 X 座標
HESO_Y: 252,      // 中心 Y 座標
HESO_RADIUS: 25,  // 検知半径（px）
```

釘の `skipIndices` で空いているエリア（例: `y: 236` の中央付近）に合わせて調整してください。

---

## 6. チェックリスト

UI 実装時の確認項目です。

- [ ] `hesoCount` 用の state を追加したか
- [ ] `PachinkoPhysicsEngine` にコールバックを渡しているか
- [ ] コールバック内で `setHesoCount((prev) => prev + 1)` のように関数形式を使っているか
- [ ] 表示位置・スタイルが他と整合しているか
- [ ] （任意）デバッグモードでへそ範囲を描画しているか

---

## 7. 関連ファイル一覧

| ファイル | 用途 |
|----------|------|
| `patipuro-web/src/Patinko-home.tsx` | UI 実装のメイン |
| `patipuro-web/src/physics/types.ts` | へそ位置・サイズの定数 |
| `patipuro-web/src/physics/HesoManager.ts` | へそ判定ロジック |
| `patipuro-web/src/physics/PachinkoPhysicsEngine.ts` | コールバック呼び出し |
