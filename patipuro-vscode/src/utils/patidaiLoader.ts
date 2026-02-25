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
}

export async function loadPatidai(zipPath: string, context: vscode.ExtensionContext, webview: vscode.Webview): Promise<LoadedDaiData> {
    // 解凍先ディレクトリ（拡張機能のグローバルストレージ）
    const storageUri = context.globalStorageUri;
    const extractPath = path.join(storageUri.fsPath, 'current_dai');

    // 1. 解凍処理
    const zip = new AdmZip(zipPath);
    if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath, { recursive: true });
    }
    zip.extractAllTo(extractPath, true);

    // 2. ユーティリティ：パス変換
    const toWebviewUri = (relPath: string) => {
        const fullPath = path.join(extractPath, relPath);
        return webview.asWebviewUri(vscode.Uri.file(fullPath)).toString();
    };

    // 3. assetsフォルダ内の全ファイルをURI辞書化
    const getAllAssetsUris = (dir: string): Record<string, string> => {
        let results: Record<string, string> = {};
        if (!fs.existsSync(dir)) return results;

        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                results = { ...results, ...getAllAssetsUris(fullPath) };
            } else {
                const relToAssets = path.relative(path.join(extractPath, 'assets'), fullPath).replace(/\\/g, '/');
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

    // 5. データの組み立て
    return {
        stageConfig: JSON.parse(fs.readFileSync(path.join(extractPath, 'configs', 'stageconfig.json'), 'utf-8')),
        assets: getAllAssetsUris(path.join(extractPath, 'assets')),
        normalEffects: loadEffects('normal'),
        rushEffects: loadEffects('rush')
    };
}