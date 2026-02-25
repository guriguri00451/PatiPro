# zip読み込みからReact表示までのフロー

このドキュメントでは、ユーザーがzipファイルを選択してからReact画面に背景画像・BGMが反映されるまでの処理の流れを、実際のコードと合わせて解説します。

---

## 1. 全体フロー（シーケンス図）

```
ユーザー      extension.ts    patidaiLoader.ts   Webviewページ    React (Patinko-home.tsx)
   |               |                |                 |                    |
   | コマンド実行  |                |                 |                    |
   |──────────────>|                |                 |                    |
   |               |                |                 |                    |
   |   ダイアログ  |                |                 |                    |
   |<──────────────|                |                 |                    |
   |               |                |                 |                    |
   | zipファイル選択|               |                 |                    |
   |──────────────>|                |                 |                    |
   |               |                |                 |                    |
   |               | loadPatidai()  |                 |                    |
   |               |───────────────>|                 |                    |
   |               |                |                 |                    |
   |               |  [1] zip解凍   |                 |                    |
   |               |  [2] ルート特定|                 |                    |
   |               |  [3] JSON読込  |                 |                    |
   |               |  [4] 画像→base64               |                    |
   |               |  [5] BGM→base64|                |                    |
   |               |                |                 |                    |
   |               |   LoadedDaiData を返す           |                    |
   |               |<───────────────|                 |                    |
   |               |                |                 |                    |
   |               | postMessage(LOAD_DAI)            |                    |
   |               |─────────────────────────────────>|                    |
   |               |                |                 |                    |
   |               |                |                 | iframeReady?       |
   |               |                |                 |  No → キューへ     |
   |               |                |                 |  Yes → 即転送      |
   |               |                |                 |                    |
   |               |                |            (React起動後)             |
   |               |                |                 |                    |
   |               |                |                 | PATIPURO_READY     |
   |               |                |                 |<───────────────────|
   |               |                |                 |                    |
   |               |                |                 | キューのLOAD_DAIを |
   |               |                |                 | postMessage転送    |
   |               |                |                 |───────────────────>|
   |               |                |                 |                    |
   |               |                |                 |             bgmTracks 更新
   |               |                |                 |             boardBackground 更新
   |               |                |                 |             → 画面に反映     |
```

---

## 2. なぜ PATIPURO_READY ハンドシェイクが必要か

### 問題：タイミングのズレ

PatiProのReactアプリは**iframe内**で動いています。iframeはページのロードに時間がかかります。

```
extension.ts が LOAD_DAI を送信
       ↓ （数ミリ秒後）
Webviewページが受信
       ↓
iframeに転送しようとする
       ↓ ← ★ここが問題！
Reactアプリがまだ起動していない
（message イベントリスナーが登録されていない）
       ↓
LOAD_DAI メッセージが消える → 台が読み込まれない！
```

### 解決策：キューとREADYシグナルの仕組み

```
┌─────────────────────────────────────────────────────────────────┐
│  Webviewページ（仲介役）                                          │
│                                                                  │
│  let iframeReady = false;                                        │
│  let messageQueue = [];        ← キュー（溜め場所）              │
│                                                                  │
│  LOAD_DAI受信                                                    │
│       ↓                                                          │
│  iframeReady が false？                                          │
│       ↓ Yes                                                      │
│  messageQueue.push(LOAD_DAI)  ← キューに溜める                  │
│                                                                  │
│  ─────────────────── (時間経過) ────────────────────            │
│                                                                  │
│  PATIPURO_READY受信（Reactから）                                 │
│       ↓                                                          │
│  iframeReady = true                                              │
│       ↓                                                          │
│  messageQueue.forEach(msg =>  ← 溜めたメッセージを一括送信      │
│      iframe.postMessage(msg)) │                                  │
│  messageQueue = []            │                                  │
└───────────────────────────────┼─────────────────────────────────┘
                                │
                                ▼ LOAD_DAI 到着
                         React（起動済み）
                         bgmTracks / boardBackground を更新
```

### Webviewページのコード（extension.ts: 38〜56行目）

```typescript
// Reactアプリが準備完了するまでメッセージをキューに溜める
let iframeReady = false;
let messageQueue = [];

window.addEventListener('message', (event) => {
    if (event.source === iframe.contentWindow) {
        // iframe（React）からのメッセージ → VS Codeへ転送
        if (event.data?.type === 'PATIPURO_READY') {
            // React準備完了：キューに溜まったメッセージを一括送信
            iframeReady = true;
            messageQueue.forEach(msg => iframe.contentWindow.postMessage(msg, '*'));
            messageQueue = [];
        }
        vscode.postMessage(event.data);
    } else {
        // VS Codeからのメッセージ → iframeへ転送（未準備ならキュー）
        if (iframeReady) {
            iframe.contentWindow.postMessage(event.data, '*');
        } else {
            messageQueue.push(event.data);
        }
    }
});
```

### ReactがREADYシグナルを送るコード（Patinko-home.tsx: 47〜49行目）

```typescript
// VSCode拡張のwebviewページに「Reactが準備完了」を通知する
// → webviewページはキューに溜めていた LOAD_DAI メッセージをここで流す
useEffect(() => {
    window.parent.postMessage({ type: 'PATIPURO_READY' }, '*');
}, []);
```

`useEffect(() => {...}, [])` は**マウント時に1回だけ実行される**Reactのフック。Reactのコンポーネントが初期化されたタイミングで必ずこのシグナルが送られます。

### さらなるフォールバック（extension.ts: 134〜138行目）

タイミングによってはこれでも間に合わない場合があるため、extension.ts にも追加の保険があります。

```typescript
// React側から PATIPURO_READY が来たら再送（iframeがまだ起動中だった場合のフォールバック）
panel.webview.onDidReceiveMessage(msg => {
    if (msg?.type === 'PATIPURO_READY') {
        panel.webview.postMessage(loadDaiMessage);
    }
});
```

`PATIPURO_READY` を受け取ったら `LOAD_DAI` を**もう一度送る**ことで、確実に台データが届くようにしています。

---

## 3. なぜ vscode-resource:// URI ではなく base64 データURLを使うか

### 問題：セキュリティ制限

VSCodeのWebviewには「ローカルファイルへのアクセス」のセキュリティ機能があります。

```
VSCode Webview
  └── getWebviewContent() で生成されたHTML（第1層）
        └── <iframe src="http://localhost:5173"> （第2層のReactアプリ）
```

VSCodeが提供する `vscode-resource://` URI（またはWebview専用URI）は、**第1層のWebviewページからしかアクセスできません。**

```
第1層（Webviewページ） → vscode-resource://... ← アクセス可能
第2層（iframe内React） → vscode-resource://... ← アクセス不可！（クロスオリジン制限）
```

iframeは別オリジン扱いになるため、VSCodeが用意した特別なURIスキームを使えないのです。

### 解決策：base64データURLに変換して文字列で渡す

base64データURLは「URIではなくデータそのもの」です。どこからでもアクセスできます。

```
通常のURI:
  src="vscode-resource:///path/to/image.png"
  → iframeからは403 Forbidden

base64データURL:
  src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  → どこからでも参照可能（データが文字列として埋め込まれているため）
```

`patidaiLoader.ts` でのbase64変換（BGMの例、114〜126行目）：

```typescript
const getBgmDataUrls = (): string[] => {
    const bgmDir = path.join(actualRoot, 'assets', 'bgm');
    if (!fs.existsSync(bgmDir)) return [];
    return fs.readdirSync(bgmDir)
        .filter(file => /\.(mp3|ogg|wav)$/i.test(file))
        .sort()
        .map(file => {
            const ext = path.extname(file).toLowerCase();
            const mimeType = ext === '.mp3' ? 'audio/mpeg'
                           : ext === '.ogg' ? 'audio/ogg'
                           : 'audio/wav';
            const content = fs.readFileSync(path.join(bgmDir, file));
            // ファイルのバイナリデータをbase64文字列に変換
            return `data:${mimeType};base64,${content.toString('base64')}`;
        });
};
```

`patidaiLoader.ts` での画像base64変換（96〜111行目）：

```typescript
const getBoardBackground = (): string => {
    const imgDir = path.join(actualRoot, 'assets', 'images');
    // ...
    const content = fs.readFileSync(path.join(imgDir, imgFiles[0]));
    return `data:${mimeMap[ext] ?? 'image/png'};base64,${content.toString('base64')}`;
};
```

### トレードオフ

base64変換にはデメリットもあります：

| 項目 | vscode-resource:// URI | base64データURL |
|------|------------------------|----------------|
| iframeからのアクセス | 不可 | 可能 |
| データサイズ | 元のファイルサイズ | 約1.33倍に膨らむ |
| メモリ使用量 | 少ない | 大きい |
| 向いているファイル | - | 数MB以下の画像・音声 |

動画（`.mp4`）はファイルサイズが大きすぎるためbase64変換せず、vscode-resource:// URIを使っています（これがiframeから動画を再生するには別の工夫が必要な理由でもあります）。

---

## 4. コードと対応させた説明（ステップ別）

### ステップ1: ファイル選択ダイアログの表示

**ファイル:** `patipuro-vscode/src/extension.ts`（91〜102行目）

```typescript
const fileUri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'パチ台を読み込む',
    filters: { 'PatiDai Files': ['patidai', 'zip'] }
});

if (!fileUri || fileUri.length === 0) {
    vscode.window.showInformationMessage('台の選択がキャンセルされました');
    return;
}

const selectedZipPath = fileUri[0].fsPath;
```

`.patidai` と `.zip` の両方を選択できるようにしています。内部的にはどちらも同じzip形式として処理されます。

### ステップ2: Webviewパネルの作成

**ファイル:** `patipuro-vscode/src/extension.ts`（105〜119行目）

```typescript
const panel = vscode.window.createWebviewPanel(
    'pachinkoView',
    'パチプロ演出画面',
    vscode.ViewColumn.One,
    {
        enableScripts: true,
        retainContextWhenHidden: true,  // タブを切り替えても状態を維持
        localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'dist')),
            context.globalStorageUri   // 解凍先へのアクセスを許可
        ]
    }
);

panel.webview.html = getWebviewContent();
```

`localResourceRoots` に `context.globalStorageUri` を追加することで、解凍先フォルダへのアクセスを許可しています。

### ステップ3: zip解凍とルート特定

**ファイル:** `patipuro-vscode/src/utils/patidaiLoader.ts`（24〜51行目）

```typescript
const storageUri = context.globalStorageUri;
const extractPath = path.join(storageUri.fsPath, 'current_dai');

// 前回の残骸を削除（重要：これをしないと前の台と混ざる可能性があります）
fs.rmSync(extractPath, { recursive: true, force: true });
fs.mkdirSync(extractPath, { recursive: true });
zip.extractAllTo(extractPath, true);

// 真のルートディレクトリ（configsがある場所）を特定する
let actualRoot = extractPath;
const topLevelItems = fs.readdirSync(extractPath).filter(item =>
    item !== '__MACOSX' && !item.startsWith('.')
);

// 直下に configs がなく、かつフォルダが1つだけ存在する場合、その中をルートとみなす
if (!topLevelItems.includes('configs') && topLevelItems.length === 1) {
    const potentialRoot = path.join(extractPath, topLevelItems[0]);
    if (fs.statSync(potentialRoot).isDirectory()) {
        actualRoot = potentialRoot;
    }
}
```

macOSでzipを作ると `__MACOSX` という隠しフォルダが入ることがあります。これを除外しつつ、「フォルダ付きzip」と「フォルダなしzip」の両パターンに対応しています。

### ステップ4: データ組み立てとメッセージ送信

**ファイル:** `patipuro-vscode/src/extension.ts`（126〜141行目）

```typescript
const daiData = await loadPatidai(selectedZipPath, context, panel.webview);

const loadDaiMessage = { command: 'LOAD_DAI', payload: daiData };

// メインパネルに送信
panel.webview.postMessage(loadDaiMessage);

// React側から PATIPURO_READY が来たら再送（フォールバック）
panel.webview.onDidReceiveMessage(msg => {
    if (msg?.type === 'PATIPURO_READY') {
        panel.webview.postMessage(loadDaiMessage);
    }
});

// サイドバーなどの他のViewにも一斉送信
postMessageToAll(loadDaiMessage);
```

### ステップ5: ReactがLOAD_DAIを受信して画面に反映

**ファイル:** `patipuro-web/src/Patinko-home.tsx`（198〜215行目）

```typescript
const handlePostMessage = (event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'keypress') {
        shootBallRef.current();
    } else if (msg.type === 'burst' && typeof msg.count === 'number') {
        // ...大量発射処理...
    } else if (msg.command === 'LOAD_DAI') {
        // BGMデータURLの配列を受け取ってStateに設定
        const bgmDataUrls: string[] = msg.payload?.bgmDataUrls ?? [];
        if (bgmDataUrls.length > 0) {
            setBgmTracks(bgmDataUrls);  // ← BgmPlayerへ渡すStateを更新
        }
        // 背景画像データURLを受け取ってStateに設定
        const bg: string = msg.payload?.boardBackground ?? '';
        if (bg) setBoardBackground(bg);  // ← imgタグのsrcに使うStateを更新
    }
};
window.addEventListener('message', handlePostMessage);
```

`setBgmTracks` / `setBoardBackground` が呼ばれることで、Reactのレンダリングが走り画面が更新されます。
