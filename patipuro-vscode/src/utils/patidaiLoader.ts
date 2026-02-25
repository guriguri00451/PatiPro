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

export interface RushMovieEntry {
    video: string;
    audio: string | null;
}

export interface RushMoviePaths {
    reach: RushMovieEntry[];
    success: RushMovieEntry[];
    failure: RushMovieEntry[];
}

export interface LoadedDaiData {
    stageConfig: any;
    assets: Record<string, string>;
    normalEffects: EffectSet[];
    rushEffects: EffectSet[];
    extractedRoot: string;           // アセットサーバーのルートディレクトリ
    bgmPaths: string[];              // /assets/bgm/xxx.mp3 形式の相対パス
    boardBackgroundPath: string;     // /assets/images/xxx.png 形式の相対パス
    rushMoviePaths: RushMoviePaths;  // /assets/movies/reach/xxx.mp4 形式の相対パス
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
        fs.rmSync(extractPath, { recursive: true, force: true });
        fs.mkdirSync(extractPath, { recursive: true });
    }
    zip.extractAllTo(extractPath, true);

    // 真のルートディレクトリ（configsがある場所）を特定する
    let actualRoot = extractPath;
    const topLevelItems = fs.readdirSync(extractPath).filter(item =>
        item !== '__MACOSX' && !item.startsWith('.')
    );
    if (!topLevelItems.includes('configs') && topLevelItems.length === 1) {
        const potentialRoot = path.join(extractPath, topLevelItems[0]);
        if (fs.statSync(potentialRoot).isDirectory()) {
            actualRoot = potentialRoot;
        }
    }

    // 2. webview URI 変換（既存機能用）
    const toWebviewUri = (relPath: string) => {
        const fullPath = path.join(actualRoot, relPath);
        return webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
    };

    // 3. assetsフォルダ内の全ファイルをURI辞書化（既存機能用）
    const getAllAssetsUris = (dir: string): Record<string, string> => {
        let results: Record<string, string> = {};
        const assetsDir = path.join(actualRoot, 'assets');
        if (!fs.existsSync(dir)) return results;
        for (const file of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                results = { ...results, ...getAllAssetsUris(fullPath) };
            } else {
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
                    movieUri: config.moviePath ? toWebviewUri(config.moviePath) : ""
                };
            });
    };

    // 5. BGMパス一覧（/assets/bgm/xxx.mp3 形式）
    const getBgmPaths = (): string[] => {
        const bgmDir = path.join(actualRoot, 'assets', 'bgm');
        if (!fs.existsSync(bgmDir)) return [];
        return fs.readdirSync(bgmDir)
            .filter(f => /\.(mp3|ogg|wav)$/i.test(f))
            .sort()
            .map(f => `/assets/bgm/${f}`);
    };

    // 6. 背景画像パス（/assets/images/xxx.png 形式、最初の1枚）
    const getBoardBackgroundPath = (): string => {
        const imgDir = path.join(actualRoot, 'assets', 'images');
        if (!fs.existsSync(imgDir)) return '';
        const files = fs.readdirSync(imgDir)
            .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
            .sort();
        return files.length > 0 ? `/assets/images/${files[0]}` : '';
    };

    // 7. ラッシュ演出動画パス（サブフォルダで分類）
    const getRushMoviePaths = (): RushMoviePaths => {
        const moviesDir = path.join(actualRoot, 'assets', 'movies');
        if (!fs.existsSync(moviesDir)) return { reach: [], success: [], failure: [] };

        const readCategory = (subDir: string, urlPrefix: string): RushMovieEntry[] => {
            const dir = path.join(moviesDir, subDir);
            if (!fs.existsSync(dir)) return [];
            return fs.readdirSync(dir)
                .filter(f => /\.(mp4|webm|mov)$/i.test(f) && fs.statSync(path.join(dir, f)).size > 0)
                .sort()
                .map(f => {
                    const base = f.replace(/\.[^.]+$/, '');
                    const audioExt = ['.mp3', '.ogg', '.wav'].find(ext =>
                        fs.existsSync(path.join(dir, base + ext))
                    ) ?? null;
                    return {
                        video: `${urlPrefix}/${f}`,
                        audio: audioExt ? `${urlPrefix}/${base + audioExt}` : null,
                    };
                });
        };

        return {
            reach:   readCategory('reach',   '/assets/movies/reach'),
            success: readCategory('success', '/assets/movies/success'),
            failure: readCategory('fail',    '/assets/movies/fail'),
        };
    };

    // 8. データの組み立て
    return {
        stageConfig: JSON.parse(fs.readFileSync(path.join(actualRoot, 'configs', 'stageconfig.json'), 'utf-8')),
        assets: getAllAssetsUris(path.join(actualRoot, 'assets')),
        normalEffects: loadEffects('normal'),
        rushEffects: loadEffects('rush'),
        extractedRoot: actualRoot,
        bgmPaths: getBgmPaths(),
        boardBackgroundPath: getBoardBackgroundPath(),
        rushMoviePaths: getRushMoviePaths(),
    };
}
