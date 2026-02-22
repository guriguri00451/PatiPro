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
1.ルートディレクトリーで　``` docker-compose up server web ```

2.extention.jsを開いてF5を押す

3.vscode extention developmentを実行、別Windowが開く

4.shift + command + P　で　「PatiPro開始」を実行

5.適当なフォルダを開いてテキストファイルを開いて遊ぶ（一応patipuro-playgroundにテストファイルあるからそこで遊ぶと良いかも）