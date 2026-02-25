# PatiPro システム概要

## このシステムで何ができるか

VSCode拡張機能でパチ台データ（zipファイル）を選択すると、VSCode内のWebviewパネルにパチンコ台が表示され、コードを書くたびに玉が発射されるゲーミング開発体験ができるシステムです。台ごとに背景画像・BGM・演出動画を差し替えられるのが特徴で、誰でも「自分だけのパチ台」を作って読み込ませることができます。

---

## 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│  VSCode 拡張機能 (patipuro-vscode)                               │
│                                                                  │
│  ┌──────────────────────────────────────────┐                   │
│  │  extension.ts                             │                   │
│  │  - コマンド登録 (patipuro.start 等)       │                   │
│  │  - テキスト変更 / ターミナル実行の監視    │                   │
│  │  - ファイル選択ダイアログの表示           │                   │
│  └──────────────────┬───────────────────────┘                   │
│                     │ loadPatidai() 呼び出し                     │
│  ┌──────────────────▼───────────────────────┐                   │
│  │  utils/patidaiLoader.ts                   │                   │
│  │  - zip解凍                                │                   │
│  │  - stageconfig.json 読み込み              │                   │
│  │  - 画像・BGMをbase64データURLに変換       │                   │
│  └──────────────────┬───────────────────────┘                   │
│                     │ LoadedDaiData を返す                       │
│  ┌──────────────────▼───────────────────────┐                   │
│  │  Webviewページ (getWebviewContent())      │  ← 第1層         │
│  │  HTML/JS で動的生成された仲介ページ       │                   │
│  │  - PATIPURO_READY ハンドシェイク処理      │                   │
│  │  - メッセージキュー管理                   │                   │
│  └──────────────────┬───────────────────────┘                   │
│                     │ iframe埋め込み                             │
└─────────────────────┼───────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│  React アプリ (patipuro-web / http://localhost:5173)  ← 第2層   │
│                                                                  │
│  ┌──────────────────────────────────────────┐                   │
│  │  Patinko-home.tsx                         │                   │
│  │  - LOAD_DAI メッセージ受信                │                   │
│  │  - bgmTracks / boardBackground の更新     │                   │
│  │  - 物理エンジン (Matter.js) の管理        │                   │
│  └──────────┬──────────────┬────────────────┘                   │
│             │              │                                     │
│  ┌──────────▼──┐  ┌────────▼───────┐  ┌──────────────────┐    │
│  │ BgmPlayer   │  │ SlotMachine    │  │ RushMode         │    │
│  │ (BGM再生)   │  │ (スロット演出) │  │ (ラッシュ演出)   │    │
│  └─────────────┘  └────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 3層構造の役割

| 層 | 場所 | 役割 |
|----|------|------|
| 第1層：VSCode拡張（メイン処理） | `patipuro-vscode/src/` | zipの選択・解凍・データ変換・メッセージ送信 |
| 第2層：Webviewページ（仲介） | `getWebviewContent()` 内のHTML文字列 | iframeのホスト。メッセージ中継とキュー管理を担う |
| 第3層：Reactアプリ（UI） | `patipuro-web/src/` | 実際のパチンコ台UI・物理演算・BGM再生 |

なぜ3層に分かれているかは [02_load_flow.md](02_load_flow.md) で詳しく説明します。

---

## ディレクトリ構造ツリー

```
/Users/kotaro/PatiPro/
│
├── patipuro-vscode/src/          # VSCode拡張機能のソース
│   ├── extension.ts              # エントリーポイント。コマンド登録・イベント監視
│   └── utils/
│       └── patidaiLoader.ts      # zip読み込み・データ変換のコア処理
│
├── patipuro-web/src/             # Reactアプリ（パチンコ台UI）
│   ├── Patinko-home.tsx          # メインコンポーネント（物理演算・メッセージ受信）
│   ├── components/
│   │   ├── BgmPlayer.tsx         # BGM再生コンポーネント
│   │   ├── SlotMachine.tsx       # スロット演出コンポーネント
│   │   └── RushMode.tsx          # ラッシュ演出コンポーネント
│   ├── physics/
│   │   ├── index.ts              # 物理エンジン公開インターフェース
│   │   ├── PachinkoPhysicsEngine.ts  # Matter.js ラッパー
│   │   ├── PegLayoutGenerator.ts     # 釘配置生成
│   │   ├── HesoManager.ts            # へそ（中心穴）管理
│   │   ├── PegStateManager.ts        # 釘状態管理
│   │   └── types.ts                  # 型定義・定数
│   ├── App.tsx
│   └── main.tsx
│
└── sample-root/patipuro/patidais/  # サンプルパチ台データ
    ├── A.patidai/                  # サンプル台A（展開済みフォルダ）
    │   ├── assets/
    │   │   ├── bgm/                # BGMファイル（toudai.mp3 など）
    │   │   ├── images/             # 盤面背景画像（jyogi.png など）
    │   │   └── movies/             # 演出動画（reach_01.mp4 など）
    │   └── configs/
    │       ├── stageconfig.json    # 台の設定ファイル（BGM・動画パスを定義）
    │       └── effects/            # 演出設定JSONフォルダ
    │           ├── normal/         # 通常時演出（reach/ / success/）
    │           └── rush/           # ラッシュ時演出（reach/ / success/）
    ├── A.patidai.zip               # 配布用zipファイル（これを拡張機能に読み込む）
    └── B.patidai/                  # サンプル台B（同じ構造）
```

---

## ドキュメント一覧

| ファイル | 内容 |
|----------|------|
| [00_overview.md](00_overview.md) | このファイル。全体像とアーキテクチャ |
| [01_patidai_format.md](01_patidai_format.md) | パチ台フォーマット解説（自作台の作り方） |
| [02_load_flow.md](02_load_flow.md) | zip読み込みからReact表示までのフロー |
| [03_bgm_background.md](03_bgm_background.md) | BGM・背景画像の仕組み |
