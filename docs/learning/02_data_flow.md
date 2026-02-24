# データフロー解説

## 1. キー入力 → 玉発射の流れ（メインフロー）

```
[ユーザーがキーを押す]
        |
        | VS Code の onDidChangeTextDocument イベント発火
        v
[extension.ts: textChangeDisposable]
  ・挿入があるか確認（text.length > 0）
  ・Backspace や削除は text.length === 0 なのでスキップ
        |
        | postMessageToAll({ type: 'keypress' })
        v
[全アクティブな WebView]
  ・activeViews（Set）をループ
  ・view.webview.postMessage(message) を呼ぶ
        |
        | WebView HTML の window.addEventListener('message', ...)
        v
[Webview HTML (extension.ts の getWebviewContent())]
  ・VS Code → Webview へのメッセージを受信
  ・iframe.contentWindow.postMessage(message, '*') で React に転送
        |
        | React 側の window.onmessage
        v
[Patinko-home.tsx: useEffect 内の window.addEventListener]
  ・msg.type === 'keypress' を確認
  ・shootBallRef.current() を呼ぶ
        |
        v
[PachinkoPhysicsEngine.shootBall(launchPower)]
  ・Matter.Bodies.circle() で玉を生成
  ・発射位置: (56, 82)（左上）
  ・速度を設定: (x: speed * 0.82, y: speed * 0.57)
  ・Matter.Composite.add() でワールドに追加
  ・this.balls Set に追加（管理対象へ）
        |
        | Matter.js が毎フレーム物理演算を実行
        v
[毎フレーム: engine 'beforeUpdate' イベント]
  ・PachinkoPhysicsEngine.update()
    ├── 各玉の近接チェック: PegStateManager.updateProximity()
    └── 速度制限: max 12px/frame（すり抜け防止）
        |
        | 衝突時: engine 'collisionStart' イベント
        v
[PachinkoPhysicsEngine.handleCollision(pair)]
  ・玉 vs 釘の衝突か判定
  ・重複衝突防止（フレーム内・100ms クールダウン）
  ・PegStateManager.applyFatigue(pegId, impactStrength)
        |
        v
[PegStateManager.applyFatigue()]
  ・totalImpacts を増加
  ・health を減少（劣化）
  ・restitution（反発係数）を更新
  ・釘の色を更新（新品: 黄色 → 劣化: 赤錆色）
        |
        | 玉が BOARD_HEIGHT + 50px 以下に落ちたら
        v
[PachinkoPhysicsEngine.removeBall()]
  ・Matter.Composite.remove() でワールドから削除
  ・this.balls Set から削除
  ・関連する衝突時刻レコードをクリーンアップ
```

---

## 2. ビルド成功 → 大量発射の流れ

```
[ターミナルでビルドコマンドを実行]
  例: npm run build, vite build, tsc, ...
        |
        | VS Code: onDidEndTerminalShellExecution
        v
[extension.ts: shellExecDisposable]
  ・e.exitCode === 0 確認（失敗は無視）
  ・e.execution.commandLine.value でコマンド名取得
  ・buildPatterns 配列に部分一致するか確認
        |
        | 一致 → postMessageToAll({ type: 'burst', count: 15 })
        v
[Patinko-home.tsx]
  ・msg.type === 'burst' 確認
  ・msg.count 回だけ shootBall() を呼ぶ
  → 15 発一気に発射される！🎰
```

---

## 3. WebSocket 経由のマルチプレイフロー（オプション）

```
[クライアント A: VS Code でキー入力]
        |
        v
[patipuro-web (A): WebSocket に送信]
  ws.send(JSON.stringify({ type: 'keypress' }))
        |
        v
[patipuro-server]
  ・msg.type === 'keypress' を受信
  ・送信元 (A) 以外の全クライアントにブロードキャスト
        |
        v
[patipuro-web (B): WebSocket から受信]
  ・msg.type === 'keypress' を確認
  ・shootBallRef.current() を呼ぶ
  → B の画面にも玉が飛ぶ！
```

**注意**: VS Code 拡張機能 (extension.ts) から React への通信は `postMessage` 経由（WebSocket ではない）です。WebSocket はあくまで「別のブラウザ/ウィンドウ間での共有」に使います。

---

## 4. 物理演算ループの詳細

Matter.js は毎フレーム（約 60fps）以下を実行します。

```
[Matter.js Runner: 毎フレーム]
        |
        | beforeUpdate イベント
        v
[PachinkoPhysicsEngine.update()]
  1. collisionThisFrame.clear()（重複衝突リセット）
  2. FPS 計測（1秒ごとにカウントを更新）
  3. balls.size === 0 なら pegManager.deactivateAllPegs() で終了
  4. 各玉について:
     a. pegManager.updateProximity(ball.position)
        ・全釘との距離を計算
        ・18px 以内 → activatePeg（アクティブ化）
        ・28px 以上 → deactivatePeg（非アクティブ化）
     b. 速度制限チェック (maxSpeed: 12)
        ・超過なら scale で正規化
        |
        | Matter.js 内部の物理演算（位置・速度の更新）
        v
[衝突検出 → collisionStart イベント]
  ・handleCollision() が呼ばれる
        |
        | afterUpdate イベント（Matter.js が描画を更新）
        v
[Matter.js Render: Canvas に描画]
  ・玉・釘・壁を Canvas に描画
```

---

## 5. React コンポーネントの状態管理

`Patinko-home.tsx` では `useRef` と `useState` を使い分けています。

| 種類 | 変数名 | 理由 |
|---|---|---|
| `useRef` | `physicsEngineRef` | レンダーをトリガーせず、常に最新値を参照 |
| `useRef` | `shootBallRef` | WebSocket コールバックから安定した参照が必要 |
| `useRef` | `launchPowerRef` | インターバル内から最新の発射力を参照 |
| `useRef` | `isShootingRef` | 連続発射の ON/OFF（再レンダー不要） |
| `useState` | `debugMode` | 変わったら UI を再描画する必要がある |
| `useState` | `launchPower` | スライダーの値を UI に反映する必要がある |
| `useState` | `fps`, `ballCount` | デバッグパネルの表示に使う |

### なぜ `shootBallRef` が必要か

```typescript
// 問題: WebSocket のコールバックは古いクロージャを掴む
ws.onmessage = (event) => {
    // ここで直接 shootBall() を呼ぶと、launchPower が古い値になることがある
    shootBall(); // ← launchPower のクロージャが古い
};

// 解決: Ref を経由することで常に最新の関数を参照できる
ws.onmessage = (event) => {
    shootBallRef.current(); // ← 常に最新の shootBall を参照
};

// useEffect の最後で Ref を最新に保つ
shootBallRef.current = shootBall;
```
