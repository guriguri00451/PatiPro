# BGM・背景画像の仕組み

このドキュメントでは、パチ台のBGMと背景画像がどのように表示・再生されるかを解説します。

---

## 1. BGM の仕組み

### BgmPlayer.tsx の Props と内部ロジック

**ファイル:** `patipuro-web/src/components/BgmPlayer.tsx`

```typescript
type Props = {
    tracks: string[];  // base64データURLの配列（複数曲対応）
    muted: boolean;    // ラッシュ中はtrue → 音量ゼロ
};

export const BgmPlayer: React.FC<Props> = ({ tracks, muted }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    // ...
};
```

| Prop | 型 | 役割 |
|------|----|------|
| `tracks` | `string[]` | base64データURLの配列。`LOAD_DAI` 受信後に差し替わる。 |
| `muted` | `boolean` | ラッシュモード中に `true` になり、BGMを無音にする。 |

### マウント時の初期化

```typescript
// マウント時にAudio要素を作成
useEffect(() => {
    const audio = new Audio();
    audio.loop = true;   // ← ループ再生ON
    audio.volume = 1;
    audioRef.current = audio;

    if (tracks.length > 0) {
        audio.src = tracks[0];
        audio.play().then(() => {
            setIsPlaying(true);
        }).catch(() => {
            // autoplay ポリシーでブロックされた場合は停止状態のまま
            setIsPlaying(false);
        });
    }

    return () => {
        audio.pause();
        audio.src = '';
        audioRef.current = null;
    };
}, []); // ← 依存配列が空 = コンポーネントマウント時に1回だけ実行
```

**なぜ `[]` 依存配列なのか：** Audio要素は一度作れば使い回せるためです。曲の切り替えは別の `useEffect` で対応します。

**autoplayポリシーについて：** ブラウザはユーザーが操作する前の自動再生を制限しています（スパム対策）。VSCode内のWebviewでは許可される場合が多いですが、ブロックされても静かに `isPlaying = false` として扱います。

### tracks propが変わったときに音源を切り替える仕組み

```typescript
// tracks が変わったとき（LOAD_DAI 受信後など）に音源を切り替え
useEffect(() => {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0) return;
    const wasPaused = audio.paused;   // 再生中だったかを記憶
    audio.src = tracks[0];            // 先頭曲に切り替え
    setCurrentTrackIndex(0);
    if (!wasPaused) {
        audio.play().catch(() => {});  // 再生中だったなら引き続き再生
    }
}, [tracks]); // ← tracks が変わるたびに実行
```

`LOAD_DAI` メッセージを受け取ると、`Patinko-home.tsx` の `setBgmTracks(bgmDataUrls)` が呼ばれます。`BgmPlayer` の `tracks` propはこのstateと連動しているため、自動的にこの `useEffect` が発火し、BGMが新しい台のものに切り替わります。

**変化の流れ：**

```
LOAD_DAI 受信
  └─ setBgmTracks(bgmDataUrls)  ← Patinko-home.tsx
       └─ bgmTracks state 更新
            └─ BgmPlayer に tracks として渡される
                 └─ tracks が変化 → useEffect([tracks]) 発火
                      └─ audio.src = tracks[0]  BGM切り替え完了
```

### ラッシュ中ミュートの仕組み（muted prop）

```typescript
// muted prop が変わったとき音量を切り替え
useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = muted ? 0 : 1;
}, [muted]);
```

**なぜ `pause()` ではなく音量0にするのか：**
`pause()` にすると再生位置がリセットされてしまいます。音量を0にするだけなら、ラッシュが終わった瞬間に音量を1に戻すだけで曲の続きから再生できます。

**muted がどこから来るか（Patinko-home.tsx: 503行目）：**

```typescript
<BgmPlayer tracks={bgmTracks} muted={isRushOpen} />
```

`isRushOpen` がラッシュモードの開閉フラグです。スロットで数字が揃うと `setIsRushOpen(true)` が呼ばれ、`isRushOpen` が `true` になります。

---

## 2. 背景画像の仕組み

### zIndex の構造

パチンコ盤の描画は複数のレイヤーが重なって構成されています。

```
┌──────────────────────────────────────┐
│                                      │ ← 全体コンテナ（position: relative）
│  ┌────────────────────────────────┐  │
│  │  <img> 背景画像                │  │  zIndex: 0 （最背面）
│  │  objectFit: cover              │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  SlotMachine（スロット）        │  │  zIndex: 1
│  │  保留ランプ（5個）              │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  Matter.js Canvas              │  │  zIndex: 2 （最前面）
│  │  （物理演算・玉・釘の描画）    │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

**コード（Patinko-home.tsx: 414〜445行目）：**

```typescript
<div style={{ position: 'relative' }}>
    {/* 盤面背景画像（zIndex: 0 = 最背面） */}
    {boardBackground && (
        <img
            src={boardBackground}      // base64データURL
            alt=""
            style={{
                position: 'absolute',
                top: 0, left: 0,
                width: BOARD_WIDTH,
                height: BOARD_HEIGHT,
                objectFit: 'cover',    // ← 重要
                zIndex: 0,
                pointerEvents: 'none', // クリックイベントを透過
            }}
        />
    )}

    {/* Matter.js キャンバス（zIndex: 2 = 最前面） */}
    <div ref={sceneRef} style={{ position: 'relative', zIndex: 2 }} />

    {/* スロット・保留ランプ（zIndex: 1 = 中間） */}
    <div style={{
        position: 'absolute',
        top: 150,
        left: 85,
        pointerEvents: 'none',
        zIndex: 1,
    }}>
        <SlotMachine ref={slotRef} compact onResult={handleSlotResult} />
    </div>
</div>
```

### objectFit: cover でどう表示されるか

`objectFit: cover` は「画像の縦横比を維持しながら、指定したボックスを完全に覆うように拡大縮小する」CSSプロパティです。

```
例：盤面サイズ 400×600px、画像サイズ 1920×1080px の場合

objectFit: cover の動作:
  1. 幅400pxに収めると高さ = 400 × (1080/1920) = 225px → 高さが足りない
  2. 高さ600pxに収めると幅 = 600 × (1920/1080) = 1067px → こちらを採用
  3. 中央を基準に幅1067pxのうち400px分だけ表示（左右がクリップされる）

結果: 盤面が画像でピッタリ覆われる。画像が引き伸びたり潰れたりしない。
```

これにより、どんなサイズの画像を用意しても盤面全体にきれいに表示されます。

---

## 3. 独自の台を作るときのBGM・画像のルール

### 背景画像のルール

```
assets/images/
├── 01_background.png  ← アルファベット順で最初 → これが使われる
├── 02_alternate.png   ← 使われない（将来の機能用に置いておくことは可能）
└── thumbnail.jpg      ← 使われない
```

**推奨事項：**

| 項目 | 推奨値 | 理由 |
|------|--------|------|
| ファイル形式 | PNG | 透過対応、高品質 |
| 画像サイズ | 400×600px 以上 | 盤面サイズに合わせて。それ以上は `objectFit: cover` でトリミングされる |
| ファイルサイズ | 5MB以下 | base64変換後にpostMessageで送るため、大きすぎると遅くなる |
| ファイル名 | `01_` などの数字プレフィックス | ソート順を制御したい場合 |

### BGMのルール

```
assets/bgm/
├── 01_normal.mp3   ← ソート順1番目 → デフォルトで再生される
├── 02_battle.mp3   ← 将来の曲切り替え機能で選択可能になる
└── 03_ending.ogg
```

**推奨事項：**

| 項目 | 推奨値 | 理由 |
|------|--------|------|
| ファイル形式 | MP3 | 高い互換性。OGGはSafariで再生できない場合がある |
| ファイルサイズ | 10MB以下推奨 | base64変換後はさらに約1.33倍になる。大きすぎると読み込みが重い |
| ループ | 設計不要 | BgmPlayerが `audio.loop = true` で自動ループ |
| ビットレート | 128kbps程度 | BGMとしては十分な品質 |

### ラッシュ中の動作

ラッシュモード（確変）に入ると `isRushOpen` が `true` になります：

1. `BgmPlayer` の `muted` propが `true` になる
2. `audioRef.current.volume = 0` でBGMが無音になる
3. ラッシュ演出動画（`RushMode` コンポーネント）が前面に表示される
4. ラッシュ終了後、`muted` が `false` に戻り `volume = 1` になってBGMが再開

```
[通常時]                    [ラッシュ突入]              [ラッシュ終了]
BgmPlayer: muted=false     BgmPlayer: muted=true       BgmPlayer: muted=false
volume=1 → BGM再生中       volume=0 → 無音             volume=1 → BGM再開（続きから）
                           RushMode: 演出動画再生中
```

**BGMを完全に止めたい場合：** 現在のAPIでは `muted` propを使います。将来的に台ごとにラッシュBGMを持たせる設計にする場合は、`tracks` を通常BGMとラッシュBGMで切り替えるように拡張することが考えられます。
