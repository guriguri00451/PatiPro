# 📚 コードベース学習ガイド

このドキュメントは `/code-learner` によって自動生成されました。

## 読む順番

1. [00_overview.md](00_overview.md) — まずここから。何を作っているか・全体像
2. [01_architecture.md](01_architecture.md) — 各コンポーネントの設計・責任分担
3. [02_data_flow.md](02_data_flow.md) — キー入力から玉発射までの詳細な流れ
4. [03_key_concepts.md](03_key_concepts.md) — 重要な実装パターン・つまずきポイント
5. [04_getting_started.md](04_getting_started.md) — セットアップ・新機能追加の手順

## 機能別ドキュメント

| 機能 | ドキュメント |
|------|---------------|
| へそ UI 実装 | [patipuro-web/heso_ui_implementation.md](../patipuro-web/heso_ui_implementation.md) |

## プロジェクト概要（1行）

コードを書くたびにパチンコ玉が飛ぶ VS Code 拡張機能

## 主要ファイルの早見表

| やりたいこと | ファイル |
|---|---|
| VS Code イベント・コマンドを変更 | `patipuro-vscode/src/extension.ts` |
| UI・表示を変更 | `patipuro-web/src/Patinko-home.tsx` |
| 玉の物理挙動を変更 | `patipuro-web/src/physics/PachinkoPhysicsEngine.ts` |
| 釘の配置を変更 | `patipuro-web/src/physics/PegLayoutGenerator.ts` |
| へそ（穴）の位置・UI | `patipuro-web/src/physics/types.ts`, [heso_ui_implementation.md](../patipuro-web/heso_ui_implementation.md) |
| 釘の劣化・色を変更 | `patipuro-web/src/physics/PegStateManager.ts` |
| 定数を変更（サイズ・閾値） | `patipuro-web/src/physics/types.ts` |
| WebSocket サーバーを変更 | `patipuro-server/server.js` |

生成日時: 2026-02-25
