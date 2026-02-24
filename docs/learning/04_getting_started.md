# 開発を始めるには

## セットアップ手順

### 前提条件
- Node.js（npm）
- Docker
- VS Code

### 手順

```bash
# 1. 拡張機能の依存関係をインストール
cd patipuro-vscode
npm install

# 2. TypeScript を自動コンパイル（開発中は常にこれを起動しておく）
npm run watch

# 3. 別ターミナルで Docker を起動（Web アプリ + WebSocket サーバー）
cd ..
docker-compose up server web
```

```
# 4. VS Code で F5（または fn+F5）を押す
# → 「Extension Development Host」という別 VS Code ウィンドウが開く

# 5. 別ウィンドウで Shift+Cmd+P → 「PatiPro: 開始」を選択

# 6. サイドバー or パネルに PatiPro アイコンが現れる
#    クリックしてパチンコ盤を開く

# 7. テキストファイルを開いて文字を打つと玉が飛ぶ！
```

---

## 各コンポーネントのポート

| コンポーネント | ポート | 役割 |
|---|---|---|
| patipuro-web (Vite) | 5173 | React アプリ（パチンコ画面） |
| patipuro-server (WebSocket) | 8080 | マルチプレイ用リレーサーバー |

---

## 新機能を追加する際の判断フロー

```
追加したい機能はどこに属するか？
│
├── VS Code の操作・イベント検知に関係する
│   └── patipuro-vscode/src/extension.ts を編集
│       例: 新しいイベントを追加、新コマンドを登録
│
├── パチンコの見た目・UI に関係する
│   └── patipuro-web/src/Patinko-home.tsx を編集
│       例: ボタン追加、デバッグ表示の変更
│
├── 玉の動き・物理挙動に関係する
│   └── patipuro-web/src/physics/PachinkoPhysicsEngine.ts を編集
│       例: 玉のサイズ変更、発射角度の調整
│
├── 釘の配置を変えたい
│   └── patipuro-web/src/physics/PegLayoutGenerator.ts を編集
│       例: 行の追加・削除、rowSpecs の変更
│
├── 釘の挙動（劣化・色）を変えたい
│   └── patipuro-web/src/physics/PegStateManager.ts を編集
│       例: 疲労係数の調整、色の変更
│
└── 定数値（盤面サイズ・閾値）を変えたい
    └── patipuro-web/src/physics/types.ts を編集
        例: BOARD_WIDTH, PEG_PROXIMITY_THRESHOLD
```

---

## よくあるタスクのパターン

### ケース 1: 新しいイベントトリガーを追加する

例: ファイル保存時に玉を発射したい

```typescript
// extension.ts の activate() 内に追加
const saveDisposable = vscode.workspace.onDidSaveTextDocument(() => {
    if (!isActive) return;
    postMessageToAll({ type: 'burst', count: 3 }); // 3発発射
});

// 忘れずに stopPatiPro() でも dispose する
// isActive が false の時は無視する条件を入れる
context.subscriptions.push(saveDisposable);
```

### ケース 2: React 側でメッセージの種類を追加する

```tsx
// Patinko-home.tsx の useEffect 内
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'keypress') {
        shootBallRef.current();
    } else if (msg.type === 'burst') {
        // burst メッセージを追加
        for (let i = 0; i < (msg.count ?? 5); i++) {
            setTimeout(() => shootBallRef.current(), i * 50);
        }
    } else if (msg.type === 'myNewEvent') {
        // 新しいイベントを処理
        doSomethingNew();
    }
};
```

### ケース 3: 釘の配置を調整する

```typescript
// PegLayoutGenerator.ts の rowSpecs を編集するだけ
const rowSpecs = [
    { y: 170, xStart: 92, count: 8, step: 32 },
    // ↑ y: 行の高さ, xStart: 左端の X, count: 本数, step: 間隔(px)

    // 新しい行を追加する例
    { y: 150, xStart: 100, count: 5, step: 40 },

    // 特定の位置を空ける例（中央を空けたい）
    { y: 236, xStart: 92, count: 8, step: 32, skipIndices: [3, 4] },
];
```

### ケース 4: デバッグモードに情報を追加する

```tsx
// Patinko-home.tsx のデバッグパネル部分
{debugMode && (
    <div className="debug-panel">
        {/* 既存の情報 */}
        <div>FPS: {fps}</div>
        {/* 新しい情報を追加 */}
        <div>カスタム情報: {myNewState}</div>
    </div>
)}
```

---

## デバッグのヒント

### デバッグモードの起動
パチンコ画面が表示されている状態で `D` キーを押すと、デバッグオーバーレイが表示されます。

**表示される情報:**
- FPS（フレームレート）
- 現在の玉の数
- アクティブな釘の数 / 全釘の数
- 各釘の健康度バー
- 玉の速度ベクトル（黄色の矢印）
- 近接範囲の円（緑: 18px、灰: 28px）

### コンソールログ
```
[patipuro-web] WebSocket connected    # WebSocket 接続成功
[patipuro-web] WebSocket disconnected # WebSocket 切断（3秒後に再接続）
```

### よくある問題と解決策

| 症状 | 原因 | 解決策 |
|---|---|---|
| WebView が真っ黒 | `localhost:5173` が起動していない | `docker-compose up web` を実行 |
| 玉が発射されない | PatiPro が停止中 | 「PatiPro: 開始」コマンドを実行 |
| 玉がすり抜ける | 発射力が高すぎる | スライダーで発射力を下げる |
| TypeScript のエラー | コンパイルが必要 | `npm run watch` を実行 |

### extension.ts の変更を反映するには
1. `npm run watch` が起動中なら自動で `out/extension.js` が再生成される
2. VS Code の Extension Development Host ウィンドウで `Cmd+R` でリロード

---

## ブランチ命名規則

```
issue<番号>       例: issue12
hotfix<番号>      例: hotfix3
<アカウント名>    例: guriguri00451-feature1
```
