# PatiPro プロジェクト全体図

## 何を作っているか

**PatiPro（パティプロ）** は、VS Code でコードを書くたびにパチンコの玉が飛ぶ拡張機能です。
キーを押すたびにパチンコ玉が発射され、釘（ペグ）にぶつかりながら落ちていきます。
ビルドや Lint が成功すると大量の玉が一気に放出されます（「大当たり！」演出）。

```
コードを書く → 玉が発射される → 釘にぶつかる → 楽しい 🎰
```

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| VS Code 拡張機能 | TypeScript + VS Code Extension API |
| フロントエンド (物理シミュレーション) | React 19 + TypeScript + Vite |
| 物理演算ライブラリ | Matter.js 0.20 |
| WebSocket サーバー（マルチプレイ用） | Node.js + ws ライブラリ |

---

## ディレクトリ構造

```
PatiPro/
├── patipuro-vscode/          # VS Code 拡張機能本体
│   ├── src/
│   │   └── extension.ts      # 拡張機能のエントリポイント（唯一のソースファイル）
│   ├── out/
│   │   └── extension.js      # TypeScript のコンパイル結果（自動生成）
│   ├── icons/                # 拡張機能アイコン
│   └── package.json          # 拡張機能の定義（コマンド・設定・ビュー）
│
├── patipuro-web/             # パチンコ画面（React アプリ）
│   └── src/
│       ├── main.tsx          # React エントリポイント
│       ├── App.tsx           # ルートコンポーネント（スタート画面 ↔ ゲーム画面の切替）
│       ├── Patinko-home.tsx  # パチンコ盤コンポーネント（UI の核心）
│       └── physics/          # 物理演算モジュール群（責務分離）
│           ├── index.ts      # 外部向けエクスポート窓口
│           ├── types.ts      # 型定義・設定定数
│           ├── PachinkoPhysicsEngine.ts  # 物理エンジン本体（玉の管理・衝突処理）
│           ├── PegStateManager.ts        # 釘の状態管理（疲労・健康度）
│           └── PegLayoutGenerator.ts    # 釘の配置パターン生成
│
├── patipuro-server/          # WebSocket リレーサーバー（マルチプレイ用）
│   └── server.js             # keypress イベントを全クライアントにブロードキャスト
│
├── patipuro-extension/       # （アイコン素材のみ、未使用の可能性あり）
├── patipuro-playground/      # 動作確認用のテストファイル置き場
└── docs/
    └── learning/             # このドキュメント群
```

---

## システム全体のデータフロー（概略）

```
[VS Code エディタ]
     |  文字入力イベント
     v
[extension.ts]
     |  WebView に postMessage({ type: 'keypress' })
     v
[Webview HTML (iframe)]
     |  iframe.contentWindow.postMessage(...)
     v
[React: Patinko-home.tsx]
     |  shootBall() を呼ぶ
     v
[PachinkoPhysicsEngine]
     |  Matter.js で玉を生成・速度を設定
     v
[Matter.js 物理演算]
     |  毎フレーム位置・速度を更新
     v
[PegStateManager]  ← 衝突時に釘の健康度を減らす
     |
     v
[Matter.js Render]  → 画面に描画（Canvas）
```

---

## 開発環境の起動方法（まずここを確認）

1. Docker を起動する
2. ルートで `docker-compose up server web` を実行
3. VS Code で `F5`（または `fn+F5`）を押して拡張機能を起動
4. 「Extension Development Host」ウィンドウが開く
5. `Shift+Cmd+P` → 「PatiPro: 開始」を選択
6. `patipuro-playground/Playground` のファイルを開いて文字を入力してみる
