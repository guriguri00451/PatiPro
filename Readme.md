## 環境構築
・patipuro-vscodeの中で　```npm install```

・通知を許可する必要がある
セキュリティ上の理由で、VS Codeは「勝手にコマンドを実行する設定」を見つけると、ユーザーに確認を求めます。一度「許可」してしまえば、それ以降は何もせずにバックグラウンドでビルドが走るようになります。

## 作業ファイル
・Web
patipuro-web/src/ここら辺

・拡張機能
patipuro-vscode/src/extention.ts
(セーブしたらextention.jsに自動コンパイルされる)

## 動作確認
1. Dockerアプリを立ち上げる
2. ルートディレクトリーで　``` docker-compose up server web ```
3. F5、またはfn+F5を押して、patipuro-vscode/out/extension.jsを起動する
4. vscode extention developmentを実行、別Windowが開く
5. shift + command + P　で　「PatiPro: 開始」を実行
6. 適当なフォルダを開いてテキストファイルを開いて遊ぶ（一応patipuro-playgroundにテストファイルあるからそこで遊ぶと良いかも）

## ブランチ命名規則
以下のいずれかの形式のブランチ名にすることを心がけてください
- issue<issue番号>
- hotfix<番号名>
- アカウント名<番号名>
