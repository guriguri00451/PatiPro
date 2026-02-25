# パチ台zip読み込み〜表示 学習ガイド

このディレクトリには、PatiProの「パチ台データ読み込みと表示」機能を理解するための学習ドキュメントがあります。

---

## 読む順番

### 1. [00_overview.md](00_overview.md) — 全体像を把握する

まずここから読んでください。システム全体の構造をASCII図で俯瞰します。

- このシステムで何ができるか
- VSCode拡張 / Webviewページ / React の3層アーキテクチャ
- ディレクトリ構造ツリー

**読む時間の目安：** 5〜10分

---

### 2. [01_patidai_format.md](01_patidai_format.md) — パチ台データの構造を知る

「パチ台」がどんなフォルダ構造・ファイルで構成されているかを解説します。自分のオリジナル台を作りたい場合は特に重要です。

- パチ台フォルダの構造（実際のA.patidaiを例に）
- stageconfig.json の全フィールドの説明
- assets/ 以下の画像・BGM・動画のルール
- ステップバイステップの「自作台の作り方」

**読む時間の目安：** 15〜20分

---

### 3. [02_load_flow.md](02_load_flow.md) — データが届くまでの流れを追う

zipが選択されてからReactの画面に背景・BGMが反映されるまでの処理フローを、実際のコードと合わせて解説します。

- 全体シーケンス図（ユーザー操作からReact反映まで）
- PATIPURO_READY ハンドシェイクの必要性と仕組み
- なぜbase64データURLを使うか（vscode-resource:// の限界）
- 各ステップのコード引用と解説

**読む時間の目安：** 20〜30分

---

### 4. [03_bgm_background.md](03_bgm_background.md) — BGMと背景の実装詳細

BgmPlayerコンポーネントの内部ロジックと、背景画像のレイヤー構造を詳しく解説します。

- BgmPlayer の Props・初期化・曲切り替えロジック
- ラッシュ中ミュートの仕組み（なぜpauseでなくvolume=0か）
- zIndexの重なり順（背景 / スロット / Matter.jsキャンバス）
- objectFit: cover の動作説明
- 自作台のBGM・画像ファイルに関する推奨事項

**読む時間の目安：** 10〜15分

---

## 機能を触る前に確認すること

1. React開発サーバーが起動しているか（`http://localhost:5173` が開けるか）
2. VSCode拡張機能をデバッグモードで起動しているか（F5キー）
3. サンプル台 `sample-root/patipuro/patidais/A.patidai.zip` が存在するか

---

## 主要ファイルの早見表

| やりたいこと | 参照ファイル |
|-------------|-------------|
| zip読み込み処理を変更する | `patipuro-vscode/src/utils/patidaiLoader.ts` |
| コマンド登録・メッセージ送信を変更する | `patipuro-vscode/src/extension.ts` |
| LOAD_DAI受信処理を変更する | `patipuro-web/src/Patinko-home.tsx`（handlePostMessage） |
| BGM再生ロジックを変更する | `patipuro-web/src/components/BgmPlayer.tsx` |
| 背景画像のレイアウトを変更する | `patipuro-web/src/Patinko-home.tsx`（boardBackground の img タグ） |
| サンプル台を参照する | `sample-root/patipuro/patidais/A.patidai/` |

---

生成日時: 2026-02-26
