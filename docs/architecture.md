# PatiPro — Tech Architecture Diagram

> VS Code拡張 × パチンコ物理演算エンジン × WebSocketリレー

## システム全体構成図

```mermaid
graph TD
    subgraph VSCode["🖥 VS Code Extension Host (patipuro-vscode)"]
        EXT["extension.ts<br/>・Command Handler<br/>・Event Listener<br/>・WebView Provider<br/>・WebSocket Client"]
        LOADER["patidaiLoader.ts<br/>・.pati (ZIP) 解凍<br/>・config.json パース<br/>adm-zip v0.5.16"]
        ASSET["assetServer.ts<br/>・HTTP アセット配信<br/>・Range リクエスト対応<br/>Node.js http"]
        WEBVIEW["WebView (iframe)<br/>src=localhost:5173"]
    end

    subgraph WS["🔌 WebSocket Server (patipuro-server)"]
        SERVER["server.js<br/>・マルチクライアント管理<br/>・broadcast<br/>ws v8.18.0 · port 8080"]
    end

    subgraph PATI[".pati Asset Package (ZIP)"]
        CONFIG["config.json<br/>lottery / sequences / layers"]
        ASSETS["assets/<br/>movies(.mp4) / images / sounds"]
        SM["演出ステートマシン<br/>待機→入賞→変動→リーチ→結果"]
    end

    subgraph Docker["🐳 Docker Compose"]
        direction LR
        DC_S["server コンテナ<br/>node:20 · port 8080"]
        DC_W["web コンテナ<br/>node:20-slim · port 5173"]
    end

    subgraph ReactApp["⚛️ React Web App (patipuro-web)"]
        HOME["Patinko-home.tsx<br/>Main Controller<br/>useRef / useState / useEffect"]
        PHYSICS["PachinkoPhysicsEngine<br/>玉の物理演算<br/>釘衝突判定・へそ入賞検出<br/>Matter.js v0.20"]
        SLOT["NormalSlot + SlotMachine<br/>3リール回転演出<br/>抽選ロジック 1/81<br/>mp4 動画演出"]
        RUSH["RushMode<br/>ボーナス演出<br/>右打ちモード<br/>動画レイヤー合成"]
        BGM["BgmPlayer<br/>BGM 再生・切替<br/>HTML5 Audio API"]
    end

    %% Extension connections
    EXT -->|"解凍指示"| LOADER
    EXT -->|"サーバ起動"| ASSET
    LOADER -->|"解凍済みアセット"| ASSET
    EXT <-->|"ws://localhost:8080"| SERVER
    EXT --> WEBVIEW

    %% .pati connections
    PATI -.->|".pati ファイル読込"| LOADER
    CONFIG --- ASSETS
    ASSETS --- SM

    %% HTTP asset serving
    ASSET -.->|"HTTP アセット配信"| HOME

    %% WebSocket broadcast
    SERVER -->|"broadcast JSON"| HOME

    %% React component tree
    HOME --> PHYSICS
    HOME --> SLOT
    HOME --> RUSH
    HOME --> BGM
    PHYSICS -.->|"へそ入賞コールバック"| SLOT

    %% Styling
    classDef vscode fill:#0f1f3d,stroke:#1f6feb,color:#79c0ff
    classDef wsserver fill:#0a1a30,stroke:#0078d4,color:#58a6ff
    classDef pati fill:#201508,stroke:#f29111,color:#f0a050
    classDef react fill:#0a2535,stroke:#61dafb,color:#61dafb
    classDef game fill:#0a2535,stroke:#3fb950,color:#56d364
    classDef docker fill:#0d1117,stroke:#0078d4,color:#4d8fea,stroke-dasharray:6 4

    class EXT,LOADER,ASSET,WEBVIEW vscode
    class SERVER wsserver
    class CONFIG,ASSETS,SM pati
    class HOME react
    class PHYSICS,SLOT,RUSH,BGM game
    class DC_S,DC_W docker
```

## モジュール依存関係

```mermaid
graph LR
    subgraph Entry["エントリーポイント"]
        EXT["extension.ts"]
        MAIN["main.tsx"]
    end

    subgraph Utils["ユーティリティ (VSCode)"]
        LOADER["patidaiLoader.ts"]
        ASRV["assetServer.ts"]
    end

    subgraph Physics["物理演算モジュール"]
        ENGINE["PachinkoPhysicsEngine.ts"]
        PEG["PegStateManager.ts"]
        HESO["HesoManager.ts"]
        GEN["PegLayoutGenerator.ts"]
        TYPES["types.ts"]
    end

    subgraph Components["React コンポーネント"]
        HOME["Patinko-home.tsx"]
        SLOT["NormalSlot.tsx"]
        SLOT_M["SlotMachine.tsx"]
        RUSH["RushMode.tsx"]
        BGM["BgmPlayer.tsx"]
    end

    %% Dependencies
    EXT --> LOADER
    EXT --> ASRV
    MAIN --> HOME
    HOME --> ENGINE
    HOME --> SLOT
    HOME --> RUSH
    HOME --> BGM
    SLOT --> SLOT_M
    ENGINE --> PEG
    ENGINE --> HESO
    ENGINE --> GEN
    ENGINE --> TYPES
    PEG --> TYPES
    HESO --> TYPES

    classDef entry fill:#1a2a4a,stroke:#1f6feb,color:#79c0ff
    classDef util fill:#1a2a3a,stroke:#0078d4,color:#58a6ff
    classDef physics fill:#0a2030,stroke:#3fb950,color:#56d364
    classDef comp fill:#0a2535,stroke:#61dafb,color:#61dafb

    class EXT,MAIN entry
    class LOADER,ASRV util
    class ENGINE,PEG,HESO,GEN,TYPES physics
    class HOME,SLOT,SLOT_M,RUSH,BGM comp
```

## データフロー

```mermaid
sequenceDiagram
    actor Dev as 開発者
    participant EXT as extension.ts
    participant WS as WebSocket Server
    participant React as Patinko-home.tsx
    participant Physics as PhysicsEngine
    participant Slot as NormalSlot

    Dev->>EXT: キーストローク / lint / build
    EXT->>WS: JSON { type: 'keypress' }
    WS->>React: broadcast (全クライアント)
    React->>Physics: shootBall()
    Physics->>Physics: Matter.js 物理演算
    Physics-->>Slot: へそ入賞コールバック
    Slot->>Slot: startSlot() 抽選 (1/81)
    alt 大当たり
        Slot-->>React: onBigWin()
        React->>React: RushMode 起動
    else はずれ
        Slot-->>React: onMiss()
    end
```

## Tech Stack 一覧

| カテゴリ | 技術 | バージョン | 役割 |
|---|---|---|---|
| **Frontend** | React | 19.2.0 | UI / コンポーネント |
| **Frontend** | TypeScript | 5.9.3 | 型安全 |
| **Frontend** | Vite | 7.3.1 | ビルドツール / HMR |
| **Physics** | Matter.js | 0.20.0 | 物理演算エンジン |
| **WebSocket** | ws | 8.18.0 | リアルタイム通信 |
| **VS Code** | VS Code API | 1.93+ | 拡張機能 API |
| **VS Code** | TypeScript | 5.3.0 | 拡張機能型安全 |
| **Asset** | adm-zip | 0.5.16 | .pati ZIP 解凍 |
| **Runtime** | Node.js | 20 | サーバー実行環境 |
| **Infra** | Docker Compose | — | コンテナ管理 |
| **State** | React Hooks | — | UI / Game State |
| **DB** | — | — | DB なし（メモリのみ） |

---

> 自動生成: Claude Code · tech-architecture-diagram · 2026-02-26
