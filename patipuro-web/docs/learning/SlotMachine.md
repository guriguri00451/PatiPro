# SlotMachine コンポーネント 学習ガイド

> ファイル: `patipuro-web/src/components/SlotMachine.tsx`
> 生成日時: 2026-02-26

---

## 1. このコンポーネントは何をするか？

パチンコのヘソ（スタートチャッカー）に玉が入ったときに回転する **3リール式スロット液晶** を表現するコンポーネントです。

```
┌─────────────────────────┐
│      SLOT MACHINE       │
│  ┌───┐  ┌───┐  ┌───┐   │
│  │ 7 │  │ 7 │  │ 7 │   │  ← 3つのリール
│  └───┘  └───┘  └───┘   │
│        ★ WIN! ★         │  ← 結果表示
└─────────────────────────┘
```

---

## 2. 外部インターフェース

### Props

| プロパティ | 型 | 説明 |
|---|---|---|
| `onResult` | `(result: string[], isWin: boolean) => void` | 全リール停止時に呼ばれるコールバック |
| `compact` | `boolean` | 液晶オーバーレイ用の小さいサイズ（デフォルト: false） |

### ref（`SlotMachineHandle`）

```typescript
slotRef.current?.spin(); // 外部からスピンを起動する
```

親コンポーネント（`Patinko-home.tsx`）がへそ入球を検知したとき、この `spin()` を呼び出してスロットを回します。

---

## 3. 内部の仕組み

### 定数

```typescript
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']; // 数字の候補
const SPIN_INTERVAL_MS = 60;          // 回転中の数字切り替え間隔（60ms）
const STOP_TIMES = [1000, 2000, 3000]; // 各リールが停止するタイミング（ms）
```

リール1は1秒後、リール2は2秒後、リール3は3秒後に止まります。

### State と Ref の使い分け

```
┌──────────────────────────────────────────────┐
│  State（React再描画に使う）                    │
│  ・reels: string[]    → 画面に表示する数字     │
│  ・spinning: boolean  → 回転中かどうかのフラグ  │
│  ・win: boolean|null  → 当選状態               │
├──────────────────────────────────────────────┤
│  Ref（タイマー処理内で「最新値」を参照するため） │
│  ・reelsRef           → タイマー内で数字を更新  │
│  ・intervalsRef       → setIntervalのIDを管理  │
└──────────────────────────────────────────────┘
```

> **なぜ Ref が必要か？**
> `setInterval` のコールバックは「作成時点」の変数しか見られません（クロージャ問題）。
> `reelsRef.current` を使うことで常に最新の値を参照できます。

### スピン処理の流れ

```
handleSpin() が呼ばれる
    │
    ├─ spinning = true に設定
    ├─ reelsRef をリセット ['0','0','0']
    │
    ├─ 3つの setInterval を起動（60msごとにランダムな数字に更新）
    │      リール0: ランダム数字 → updateReel(0, next)
    │      リール1: ランダム数字 → updateReel(1, next)
    │      リール2: ランダム数字 → updateReel(2, next)
    │
    └─ 3つの setTimeout を予約
           1000ms後 → リール0の interval をクリア（停止）
           2000ms後 → リール1の interval をクリア（停止）
           3000ms後 → リール2の interval をクリア（停止）
                       └─ 全停止 → 勝敗判定 → onResult() 呼び出し
```

### 当選判定

```typescript
const isWin = finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2];
// 3つのリールが全て同じ数字 → 当選
```

当選確率 = 1/9 × 1/9 ≈ **約1.2%**（リール1を基準にリール2・3が一致する確率）

---

## 4. ゲームへの組み込み方法

### Patinko-home.tsx での使い方

```typescript
// 1. refを作る
const slotRef = useRef<SlotMachineHandle>(null);

// 2. へそに玉が入ったら spin() を呼ぶ
hesoCallbackRef.current = () => {
    if (!isSpinningRef.current) {
        isSpinningRef.current = true;
        slotRef.current?.spin(); // ← ここでスロットが回り始める
    }
};

// 3. 結果を受け取る
const handleSlotResult = (reels: string[], isWin: boolean) => {
    if (isWin) {
        setIsRushOpen(true);                          // ラッシュ画面を開く
        physicsEngineRef.current.setRushMode(true);   // 右打ちモードに切り替え
    }
    // 保留の消化処理...
};

// 4. JSXに配置
<SlotMachine ref={slotRef} compact onResult={handleSlotResult} />
```

### データフロー全体図

```
玉がへそに入る
    │
    ▼
hesoCallbackRef() 発火
    │
    ▼
slotRef.current.spin()
    │
    ▼
3リールが60msごとにランダム回転
    │
    ▼
1秒・2秒・3秒で順番に停止
    │
    ▼
isWin 判定
    ├── true  → onResult(reels, true)
    │               → ラッシュ突入 + 右打ちモード
    └── false → onResult(reels, false)
                    → 保留消化 or 待機
```

---

## 5. 表示の仕組み

### glowColor でUIの色が変わる

```typescript
const glowColor =
    win === true  ? '#00ff88' // 緑（当選）
  : win === false ? '#ff3333' // 赤（ハズレ）
  :                '#ffcc00'; // 黄（回転中/待機）
```

枠のボーダー・数字の光（glow）・結果テキストが全て `glowColor` で統一されているため、**1つの変数だけで見た目全体が切り替わります**。

### compact モード

`compact={true}` にすると液晶オーバーレイサイズになります:

| プロパティ | 通常 | compact |
|---|---|---|
| リール幅 | 80px | 55px |
| リール高さ | 100px | 75px |
| フォントサイズ | 56px | 40px |
| 背景 | 不透明黒 | 半透明黒 |
| SPINボタン | あり | なし |

---

## 6. 保留システムとの連携

スロットが**回転中にへそへ入球**した場合、すぐに次のスピンはできません。そのため `Patinko-home.tsx` が **保留キュー**（最大5個）を管理しています。

```
へそ入球
    │
    ├─ spinning = false → 即 spin()
    │
    └─ spinning = true
            ├─ 保留 < 5 → pendingCount++（ランプが点灯）
            └─ 保留 = 5 → 無視

スロット停止時
    ├─ 保留 > 0 → pendingCount-- して 500ms 後に次の spin()
    └─ 保留 = 0 → spinning = false（待機状態へ）
```

---

## 7. つまずきやすいポイント

### Q: `reelsRef` と `reels` (state) の両方があるのはなぜ？

`setInterval` のコールバック内では `reels` state の最新値が見えません。
`reelsRef.current` を更新してから `setReels([...reelsRef.current])` を呼ぶことで、
「タイマー内の正確な処理」と「Reactの再描画」を両立しています。

### Q: `useImperativeHandle` は何をしているか？

```typescript
useImperativeHandle(ref, () => ({
    spin: handleSpin,
}));
```

親から `ref` 経由で `spin()` だけを公開します。内部状態（`spinning`, `reels` など）は外部から操作できないようにカプセル化されています。

### Q: 3リールが同時に止まらないのはなぜ？

`STOP_TIMES = [1000, 2000, 3000]` で意図的にずらしています。
リアルなスロット演出（順番に止まっていく）を再現するためです。
