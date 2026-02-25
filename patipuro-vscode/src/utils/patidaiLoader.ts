import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';

export interface EffectSet {
    name: string;
    movieUri: string;
    type: 'success' | 'reach' | 'fail';
    probability: number;
    stageEffectType: 'none' | 'A' | 'B' | 'C';
}

export interface LoadedDaiData {
    stageConfig: any;
    assets: Record<string, string>;
    normalEffects: EffectSet[];
    rushEffects: EffectSet[];
    bgmDataUrls: string[];       // BGMファイルをbase64データURLに変換したもの（iframeからも使える）
    boardBackground: string;     // 盤面背景画像のbase64データURL
}

export async function loadPatidai(zipPath: string, context: vscode.ExtensionContext, webview: vscode.Webview): Promise<LoadedDaiData> {
    // 解凍先ディレクトリ（拡張機能のグローバルストレージ）
    const storageUri = context.globalStorageUri;
    const extractPath = path.join(storageUri.fsPath, 'current_dai');

    // 1. 解凍処理
    const zip = new AdmZip(zipPath);
    if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath, { recursive: true });
    } else {
        // 前回の残骸を削除（重要：これをしないと前の台と混ざる可能性があります）
        fs.rmSync(extractPath, { recursive: true, force: true });
        fs.mkdirSync(extractPath, { recursive: true });
    }
    zip.extractAllTo(extractPath, true);

    // ★ 追加：真のルートディレクトリ（configsがある場所）を特定する
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

    // 2. ユーティリティ：パス変換
    const toWebviewUri = (relPath: string) => {
        const fullPath = path.join(actualRoot, relPath);
        return webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
    };

    // 3. assetsフォルダ内の全ファイルをURI辞書化
    const getAllAssetsUris = (dir: string): Record<string, string> => {
        let results: Record<string, string> = {};
        const assetsDir = path.join(actualRoot, 'assets'); // actualRootベース
        if (!fs.existsSync(dir)) return results;

        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                results = { ...results, ...getAllAssetsUris(fullPath) };
            } else {
                // キーを "images/Stage.png" のような形式にする
                const relToAssets = path.relative(assetsDir, fullPath).replace(/\\/g, '/');
                results[relToAssets] = webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
            }
        }
        return results;
    };

    // 4. 演出設定（JSON）と動画をセットにした配列を作成
    const loadEffects = (subDir: string): EffectSet[] => {
        const dirPath = path.join(extractPath, 'configs', 'effects', subDir);
        if (!fs.existsSync(dirPath)) return [];

        return fs.readdirSync(dirPath)
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const config = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8'));
                return {
                    ...config,
                    // JSON内のmoviePathをReactで使えるURIに変換して上書き
                    movieUri: config.moviePath ? toWebviewUri(config.moviePath) : ""
                };
            });
    };

    // 5. 盤面背景画像をbase64データURLに変換
    const getBoardBackground = (): string => {
        const imgDir = path.join(actualRoot, 'assets', 'images');
        if (!fs.existsSync(imgDir)) return '';
        const imgFiles = fs.readdirSync(imgDir)
            .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
            .sort();
        if (imgFiles.length === 0) return '';
        const ext = path.extname(imgFiles[0]).toLowerCase();
        const mimeMap: Record<string, string> = {
            '.png': 'image/png', '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg', '.webp': 'image/webp',
        };
        const content = fs.readFileSync(path.join(imgDir, imgFiles[0]));
        return `data:${mimeMap[ext] ?? 'image/png'};base64,${content.toString('base64')}`;
    };

    // 6. BGMファイルをbase64データURLに変換（vscode-resource://はiframeから使えないため）
    const getBgmDataUrls = (): string[] => {
        const bgmDir = path.join(actualRoot, 'assets', 'bgm');
        if (!fs.existsSync(bgmDir)) return [];
        return fs.readdirSync(bgmDir)
            .filter(file => /\.(mp3|ogg|wav)$/i.test(file))
            .sort()
            .map(file => {
                const ext = path.extname(file).toLowerCase();
                const mimeType = ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/wav';
                const content = fs.readFileSync(path.join(bgmDir, file));
                return `data:${mimeType};base64,${content.toString('base64')}`;
            });
    };

    // 7. データの組み立て
    return {
        stageConfig: JSON.parse(fs.readFileSync(path.join(actualRoot, 'configs', 'stageconfig.json'), 'utf-8')),
        assets: getAllAssetsUris(path.join(actualRoot, 'assets')),
        normalEffects: loadEffects('normal'),
        rushEffects: loadEffects('rush'),
        bgmDataUrls: getBgmDataUrls(),
        boardBackground: getBoardBackground()
    };
}