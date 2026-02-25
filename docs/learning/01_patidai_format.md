# パチ台フォーマット解説

PatiPro で使う「パチ台」は、特定のフォルダ構造を持つディレクトリをzipで固めたファイルです。このドキュメントでは、パチ台の構造・設定ファイルの仕様・自作方法を解説します。

---

## 1. パチ台フォルダ構造

サンプル台 `A.patidai` の実際の構造を見てみましょう。

```
A.patidai/
├── assets/                        # ゲームで使う素材ファイル
│   ├── bgm/
│   │   └── toudai.mp3             # BGMファイル（.mp3/.ogg/.wav）
│   ├── images/
│   │   └── jyogi.png              # 盤面背景画像（.png/.jpg/.jpeg/.webp）
│   └── movies/
│       ├── reach_01.mp4           # リーチ演出動画
│       ├── reach_02.mp4
│       ├── reach_03.mp4
│       ├── success_01.mp4         # 大当たり演出動画
│       ├── fail_01.mp4            # 外れ演出動画
│       └── fail_02.mp4
│
└── configs/                       # 台の設定ファイル群
    ├── stageconfig.json           # メイン設定ファイル（必須）
    └── effects/                   # 演出設定JSONフォルダ
        ├── normal/                # 通常時の演出
        │   ├── reach/             # リーチ演出設定
        │   │   └── A.txt          # 演出ごとのJSON（拡張子はtxtだがJSON内容）
        │   └── success/           # 大当たり演出設定
        │       └── A.txt
        └── rush/                  # ラッシュ（確変）時の演出
            ├── reach/
            │   └── A-R.txt
            └── success/
                └── A-R.txt
```

**重要なポイント：**
- `configs/stageconfig.json` は必須です。これがない台は読み込みに失敗します。
- フォルダ名は自由ですが、拡張子 `.patidai` を付けるのがPatiProの慣例です。
- `__MACOSX` フォルダや `.` で始まるファイルは自動的に無視されます（macOSのzipに付く余計なファイル対策）。

---

## 2. stageconfig.json の仕様

`A.patidai/configs/stageconfig.json` の実際の内容です。

```json
{
  "bgm": {
    "normal": [
      "../../assets/bgm/bgm_normal_01.mp3",
      "../../assets/bgm/bgm_normal_02.mp3"
    ]
  },
  "rush": {
    "reachMoviePaths": [
      "../../assets/movies/reach_01.mp4",
      "../../assets/movies/reach_02.mp4",
      "../../assets/movies/reach_03.mp4"
    ],
    "successMoviePaths": [
      "../../assets/movies/success_01.mp4"
    ],
    "failureMoviePaths": [
      "../../assets/movies/fail_01.mp4",
      "../../assets/movies/fail_02.mp4"
    ]
  }
}
```

### 各フィールドの説明

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `bgm.normal` | `string[]` | 通常時に再生するBGMファイルのパス一覧。複数指定可能（将来の曲選択機能用）。 |
| `rush.reachMoviePaths` | `string[]` | ラッシュ中のリーチ演出動画のパス一覧。ランダムに選ばれる（予定）。 |
| `rush.successMoviePaths` | `string[]` | ラッシュ中の大当たり演出動画のパス一覧。 |
| `rush.failureMoviePaths` | `string[]` | ラッシュ中の外れ演出動画のパス一覧。 |

**パスの書き方について：**
`../../assets/bgm/bgm_normal_01.mp3` のように相対パスで書きます。`configs/stageconfig.json` から見た相対パスです（`configs/` の2つ上 = `A.patidai/` ルート）。

**注意：** 現在の実装では `stageconfig.json` のパス情報はそのまま参照されますが、実際にReactへ届くBGMデータは `patidaiLoader.ts` が `assets/bgm/` フォルダを直接スキャンしてbase64変換したものです。つまりBGMについては `stageconfig.json` の記載がなくても `assets/bgm/` にファイルを置くだけで再生されます。

---

## 3. assetsフォルダのルール

`assets/` 以下のサブフォルダには以下のルールがあります。

### images/ ： 盤面背景

```
assets/images/
└── jyogi.png   ← この画像がパチンコ盤の背景に表示される
```

`patidaiLoader.ts` の実装（96〜111行目）：

```typescript
const getBoardBackground = (): string => {
    const imgDir = path.join(actualRoot, 'assets', 'images');
    if (!fs.existsSync(imgDir)) return '';
    const imgFiles = fs.readdirSync(imgDir)
        .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
        .sort();       // ← ファイル名でソートする
    if (imgFiles.length === 0) return '';
    // ↑ ソート後の「最初の1枚」だけが使われる
    const ext = path.extname(imgFiles[0]).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    };
    const content = fs.readFileSync(path.join(imgDir, imgFiles[0]));
    return `data:${mimeMap[ext] ?? 'image/png'};base64,${content.toString('base64')}`;
};
```

**ルール：**
- 対応形式：`.png` / `.jpg` / `.jpeg` / `.webp`
- ファイルが複数ある場合、ファイル名をアルファベット順でソートした**最初の1枚**だけが使われます
- ファイルが1枚もなければ背景なし（透明）になります

### bgm/ ： BGM

```
assets/bgm/
├── toudai.mp3        ← 全ファイルがReactへ送られる
├── toudai_rush.mp3   ← 将来的に曲選択で使える
└── battle.ogg
```

`patidaiLoader.ts` の実装（114〜126行目）：

```typescript
const getBgmDataUrls = (): string[] => {
    const bgmDir = path.join(actualRoot, 'assets', 'bgm');
    if (!fs.existsSync(bgmDir)) return [];
    return fs.readdirSync(bgmDir)
        .filter(file => /\.(mp3|ogg|wav)$/i.test(file))
        .sort()          // ← ファイル名でソートする
        .map(file => {
            const ext = path.extname(file).toLowerCase();
            const mimeType = ext === '.mp3' ? 'audio/mpeg'
                           : ext === '.ogg' ? 'audio/ogg'
                           : 'audio/wav';
            const content = fs.readFileSync(path.join(bgmDir, file));
            return `data:${mimeType};base64,${content.toString('base64')}`;
        });
};
```

**ルール：**
- 対応形式：`.mp3` / `.ogg` / `.wav`
- フォルダ内の**全ファイル**がbase64データURLに変換されてReactへ送られます
- ソート順（アルファベット順）で配列に格納されます
- BgmPlayerコンポーネントはデフォルトで配列の最初の曲を再生します

### movies/ ： 演出動画

```
assets/movies/
├── reach_01.mp4
├── reach_02.mp4
├── success_01.mp4
└── fail_01.mp4
```

**ルール：**
- `stageconfig.json` でパスを指定した動画が演出として使われます
- 現在の実装ではvscode-resource:// URI（Webviewローカルファイルアクセス用URI）で参照されます
- BGM・背景画像と異なり、動画はbase64変換されません（ファイルサイズが大きいため）

---

## 4. 独自のパチ台を作るには

ステップバイステップで自分だけのパチ台を作る方法を説明します。

### ステップ1: フォルダを作る

任意の場所に、以下の構造でフォルダを作成します。

```
MyDai.patidai/
├── assets/
│   ├── bgm/
│   ├── images/
│   └── movies/
└── configs/
```

ターミナルでの作成コマンド例：

```bash
mkdir -p MyDai.patidai/assets/{bgm,images,movies}
mkdir -p MyDai.patidai/configs
```

### ステップ2: 素材を配置する

- `assets/images/` に盤面の背景画像を1枚置く（`.png` 推奨）
- `assets/bgm/` にBGMファイルを置く（`.mp3` 推奨）
- `assets/movies/` に演出動画を置く（`.mp4` 推奨、なくてもOK）

### ステップ3: stageconfig.json を作る

`configs/stageconfig.json` を以下の内容で作成します。

```json
{
  "bgm": {
    "normal": [
      "../../assets/bgm/my_bgm.mp3"
    ]
  },
  "rush": {
    "reachMoviePaths": [
      "../../assets/movies/reach_01.mp4"
    ],
    "successMoviePaths": [
      "../../assets/movies/success_01.mp4"
    ],
    "failureMoviePaths": [
      "../../assets/movies/fail_01.mp4"
    ]
  }
}
```

動画がない場合は、各配列を空にしてください（`[]`）。

### ステップ4: zipで固める

`MyDai.patidai` フォルダをzip圧縮します。

```bash
# フォルダごとzip化（Macの場合）
zip -r MyDai.patidai.zip MyDai.patidai/

# __MACOSXを除外したい場合
zip -r MyDai.patidai.zip MyDai.patidai/ --exclude "__MACOSX/*" --exclude "*.DS_Store"
```

重要：zipの中身の構造は以下のどちらでも認識されます。

```
# パターン1: ルート直下にconfigsがある
MyDai.patidai.zip/
  configs/
  assets/

# パターン2: フォルダ名付きで圧縮（こちらが一般的）
MyDai.patidai.zip/
  MyDai.patidai/
    configs/
    assets/
```

パターン2の場合、`patidaiLoader.ts` が自動的にルートフォルダを検出します（46〜51行目のルート特定ロジック）。

### ステップ5: VSCode拡張機能で読み込む

1. VSCodeで `Shift+Cmd+P`（Mac）または `Ctrl+Shift+P`（Windows）を押す
2. 「PatiPro: 開始」コマンドを実行する
3. ファイル選択ダイアログが開く
4. 作成した `.zip` または `.patidai` ファイルを選択する
5. 「台を設置中...」の後、「〇〇 の読み込みが完了しました！」と表示されれば成功

### トラブルシューティング

| 症状 | 原因と対処 |
|------|-----------|
| 「台の読み込みに失敗しました」 | `configs/stageconfig.json` がないか、JSON形式が壊れている |
| 背景が表示されない | `assets/images/` に画像がないか、対応していない形式（`.gif`等）を使っている |
| BGMが再生されない | `assets/bgm/` にファイルがないか、`.mp4` など非対応形式 / ブラウザのautoplayポリシーにより初回再生がブロックされることがある |
| 前の台の素材が混ざる | 通常は自動削除されるが、解凍先の `current_dai/` フォルダを手動で削除して再試行 |
