import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

let server: http.Server | null = null;

const MIME: Record<string, string> = {
    '.mp4':  'video/mp4',
    '.webm': 'video/webm',
    '.mov':  'video/quicktime',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
    '.wav':  'audio/wav',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
};

export function startAssetServer(rootDir: string): Promise<number> {
    return new Promise((resolve, reject) => {
        stopAssetServer();

        server = http.createServer((req, res) => {
            if (!req.url) { res.writeHead(404); res.end(); return; }

            const filePath = path.join(rootDir, decodeURIComponent(req.url.split('?')[0]));

            // ディレクトリトラバーサル防止
            if (!filePath.startsWith(rootDir)) {
                res.writeHead(403); res.end(); return;
            }
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                res.writeHead(404); res.end(); return;
            }

            const ext  = path.extname(filePath).toLowerCase();
            const mime = MIME[ext] ?? 'application/octet-stream';
            const size = fs.statSync(filePath).size;
            const range = req.headers['range'];

            if (range) {
                // ブラウザからの Range リクエスト（動画のシーク・バッファリングに必須）
                const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
                const start = parseInt(startStr, 10);
                const end   = endStr ? parseInt(endStr, 10) : size - 1;
                const chunk = end - start + 1;

                res.writeHead(206, {
                    'Content-Range':  `bytes ${start}-${end}/${size}`,
                    'Accept-Ranges':  'bytes',
                    'Content-Length': chunk,
                    'Content-Type':   mime,
                    'Access-Control-Allow-Origin': '*',
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                // 通常リクエスト（Accept-Ranges を宣言してブラウザに Range 対応を知らせる）
                res.writeHead(200, {
                    'Content-Length': size,
                    'Accept-Ranges':  'bytes',
                    'Content-Type':   mime,
                    'Access-Control-Allow-Origin': '*',
                });
                fs.createReadStream(filePath).pipe(res);
            }
        });

        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const addr = server!.address() as { port: number };
            resolve(addr.port);
        });
    });
}

export function stopAssetServer(): void {
    if (server) {
        server.close();
        server = null;
    }
}
