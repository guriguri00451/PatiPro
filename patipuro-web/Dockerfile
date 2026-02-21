# ベースイメージ
FROM node:20-slim

# 作業ディレクトリの設定
WORKDIR /app

# パッケージ管理ファイルをコピー
COPY package*.json ./

# 依存関係のインストール
RUN npm install

# ソースコードをコピー
COPY . .

# Vite の開発サーバを起動（ホスト公開設定）
CMD ["npm", "run", "dev", "--", "--host"]