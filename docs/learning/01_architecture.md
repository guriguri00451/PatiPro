# アーキテクチャ解説

## 採用しているパターン

PatiPro は **マルチコンポーネント構成** で、それぞれが明確な責任を持ちます。
物理演算部分では **責務分離（Separation of Concerns）** を採用しており、
4 つのクラスに役割が分かれています。

---

## コンポーネント間の関係

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code 本体                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │            patipuro-vscode                       │    │
│  │  extension.ts                                    │    │
│  │  ・イベント検知（文字入力・ビルド・Lint）         │    │
│  │  ・WebView の管理                                │    │
│  │  ・コマンド登録（start/stop/runBuild/runLint）   │    │
│  └───────────────────────┬─────────────────────────┘    │
│                          │ postMessage()                 │
│  ┌───────────────────────▼─────────────────────────┐    │
│  │            Webview (iframe)                      │    │
│  │  localhost:5173 (React アプリ) を iframe で表示  │    │
│  └───────────────────────┬─────────────────────────┘    │
└──────────────────────────│──────────────────────────────┘
                           │ window.postMessage
                ┌──────────▼───────────────────────────────┐
                │       patipuro-web (React)                │
                │                                          │
                │  App.tsx                                  │
                │  └── Patinko-home.tsx  ←── 核心コンポーネント │
                │       ├── PachinkoPhysicsEngine           │
                │       │   ├── PegStateManager             │
                │       │   └── (Matter.js Engine)          │
                │       └── PegLayoutGenerator              │
                └──────────────────────────────────────────┘
                           ↕ WebSocket (オプション)
                ┌──────────────────────────────────────────┐
                │       patipuro-server (Node.js)           │
                │  他のクライアントへ keypress をブロードキャスト │
                └──────────────────────────────────────────┘
```

---

## VS Code 拡張機能のアーキテクチャ

`extension.ts` は 1 ファイルですが、内部は明確に役割が分かれています。

### 主要な要素

| 要素 | 役割 |
|---|---|
| `PatiProViewProvider` | WebView パネルを生成・管理するクラス |
| `activeViews` | アクティブな WebView の Set（複数パネル対応） |
| `isActive` | 機能の ON/OFF 状態 |
| `textChangeDisposable` | 文字入力イベントのリスナー（解除可能） |
| `shellExecDisposable` | ターミナルシェル実行イベントのリスナー |
| `statusBarItem` | ステータスバーのボタン |

### イベントの種類と対応アクション

```
文字入力 (onDidChangeTextDocument)
  └→ 挿入のみ検知（削除・Backspace は除外）
  └→ postMessageToAll({ type: 'keypress' })  // 玉を1発発射

ターミナルでビルド成功 (onDidEndTerminalShellExecution)
  └→ buildPatterns に一致 && exitCode === 0
  └→ postMessageToAll({ type: 'burst', count: 15 })  // 15発一気に

コマンドパレットからビルド (patipuro.runBuild)
  └→ VS Code Task として実行
  └→ 成功時: burst(15発), 失敗時: 通知のみ

ターミナルで Lint 成功
  └→ lintPatterns に一致 && exitCode === 0
  └→ postMessageToAll({ type: 'burst', count: 10 })  // 10発
```

### なぜ iframe を使っているのか

VS Code の WebView はセキュリティ制限が厳しく、複雑な React アプリを直接埋め込むと CSP（Content Security Policy）の問題が生じます。開発時は `localhost:5173`（Vite の開発サーバー）を iframe で表示することで、React の HMR（Hot Module Replacement）をそのまま使えます。

---

## 物理演算モジュールのアーキテクチャ

`src/physics/` ディレクトリは **4 クラス + 1 型定義** で構成されています。

### クラス間の依存関係

```
Patinko-home.tsx (React コンポーネント)
│  ・UI の描画・イベント処理
│  ・物理エンジンの生存管理（useEffect のクリーンアップ）
│
├── PachinkoPhysicsEngine  ← メインの司令塔
│   │  ・玉（Ball）の生成・削除・管理
│   │  ・衝突イベントの振り分け
│   │  ・FPS 計測・デバッグ情報の提供
│   │  ・速度制限（すり抜け防止）
│   │
│   └── PegStateManager  ← 釘の専門家
│       ・釘の健康度（health: 0-1）の管理
│       ・金属疲労の計算（衝突強度 × 係数）
│       ・近接判定（玉が近い釘を「アクティブ」に）
│       ・反発係数の動的変更（劣化すると跳ね返りが弱くなる）
│
└── PegLayoutGenerator  ← 釘の配置設計士
    ・行仕様（rowSpecs）から釘群を生成
    ・ジグザグ列（サイド道釘）の生成
    ・釘の物理特性を設定（restitution: 0.8 など）
```

### types.ts が果たす役割

`types.ts` は **設定値の一元管理** と **型定義の共有** をしています。

```typescript
// PHYSICS_CONFIG: 全クラスが参照する「真実の源」
export const PHYSICS_CONFIG = {
    BOARD_WIDTH: 400,          // 盤面の幅（px）
    BOARD_HEIGHT: 600,         // 盤面の高さ（px）
    PEG_PROXIMITY_THRESHOLD: 18,  // アクティブ化の距離（px）
    PEG_LEAVE_THRESHOLD: 28,      // 非アクティブ化の距離（px）
    LAUNCH_POWER_MIN: 12,
    LAUNCH_POWER_MAX: 30,
} as const;
```

`as const` によってすべての値がリテラル型になるため、誤って上書きできません。

---

## なぜこの設計にしているのか

### 1. 物理演算を独立したクラスに分けた理由
React コンポーネント（Patinko-home.tsx）に全ロジックを書くと、コンポーネントが肥大化して読みにくくなります。物理演算は「ゲームロジック」であり、UI の関心事ではないため分離しています。

### 2. PegStateManager を独立させた理由
釘の状態管理（健康度・疲労計算）は複雑なロジックを含みます。独立させることで、テストしやすく、変更の影響範囲を限定できます。

### 3. WebSocket サーバーをオプションにした理由
```typescript
ws.onerror = () => {
    // サーバー未起動時は静かに無視
};
ws.onclose = () => {
    setTimeout(connectWS, 3000);  // 3秒後に再接続
};
```
サーバーが起動していなくてもクラッシュしないため、ソロプレイでも問題なく動作します。
