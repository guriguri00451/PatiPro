import * as vscode from 'vscode';
import { loadPatidai } from './utils/patidaiLoader';
import * as path from 'path'; // 追加
import * as fs from 'fs';   // 追加

let isActive = false;
let textChangeDisposable: vscode.Disposable | null = null;
let shellExecDisposable: vscode.Disposable | null = null;
let statusBarItem: vscode.StatusBarItem;

// 登録済みのWebviewViewを全て追跡する
const activeViews = new Set<vscode.WebviewView>();

function getWebviewContent(): string {
    const devServerUrl = "http://localhost:5173";

    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #1a1a2e; }
        iframe { width: 100%; height: 100%; border: none; }
    </style>
</head>
<body>
    <iframe src="${devServerUrl}" allow="scripts"></iframe>

    <script>
        const vscode = acquireVsCodeApi();
        const iframe = document.querySelector('iframe');

        // VS Codeからのメッセージを受け取って iframe（React）に転送する
        window.addEventListener('message', (event) => {
            const message = event.data;
            // React側の window.onmessage に送る
            iframe.contentWindow.postMessage(message, '*');
        });
    </script>
</body>
</html>`;
}

// 全アクティブViewにメッセージを送る
function postMessageToAll(message: object) {
    activeViews.forEach(view => {
        view.webview.postMessage(message);
    });
}



class PatiProViewProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
        };
        webviewView.webview.html = getWebviewContent();

        activeViews.add(webviewView);

        webviewView.onDidDispose(() => {
            activeViews.delete(webviewView);
        });
    }
}

/**
 * 台を選択して読み込むメイン関数
 */
export async function selectPatidai(context: vscode.ExtensionContext) { // asyncを追加
    // 1. ファイル選択ダイアログ
    const fileUri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'パチ台を読み込む',
        filters: { 'PatiDai Files': ['patidai', 'zip'] }
    });

    if (!fileUri || fileUri.length === 0) {
        vscode.window.showInformationMessage('台の選択がキャンセルされました');
        return;
    }

    const selectedZipPath = fileUri[0].fsPath;

    // 2. Webviewパネルの作成（メイン画面）
    const panel = vscode.window.createWebviewPanel(
        'pachinkoView',
        'パチプロ演出画面',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true, // タブを切り替えても状態を維持
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'dist')),
                context.globalStorageUri, 
                vscode.Uri.file(path.dirname(selectedZipPath)) // 台があるフォルダも念のため
            ]
        }
    );

    panel.webview.html = getWebviewContent();

    // 3. データの読み込みと送信
    try {
        vscode.window.showInformationMessage('台を設置中...');
        // 1. React側が起動してリスナーを登録するまで待機（1秒程度）
        await new Promise(resolve => setTimeout(resolve, 3000));
        // パス変換のためにpanel.webviewを渡す
        const daiData = await loadPatidai(selectedZipPath, context, panel.webview);

        console.log(daiData)
        // メインパネルに送信
        panel.webview.postMessage({
            command: 'LOAD_DAI',
            payload: daiData
        });

        // サイドバーなどの他のViewにも一斉送信
        postMessageToAll({
            command: 'LOAD_DAI',
            payload: daiData
        });

        vscode.window.showInformationMessage(`${daiData.stageConfig.name || "台"} の読み込みが完了しました！`);
    } catch (error) {
        vscode.window.showErrorMessage('台の読み込みに失敗しました: ' + error);
    }
}

function stopPatiPro() {
    isActive = false;
    if (textChangeDisposable) {
        textChangeDisposable.dispose();
        textChangeDisposable = null;
    }
    if (shellExecDisposable) {
        shellExecDisposable.dispose();
        shellExecDisposable = null;
    }
    updateStatusBar();
}

function updateStatusBar() {
    if (isActive) {
        statusBarItem.text = '$(zap) PatiPro';
        statusBarItem.tooltip = 'PatiPro: 動作中 (クリックで停止)';
        statusBarItem.command = 'patipuro.stop';
    } else {
        statusBarItem.text = '$(circle-slash) PatiPro';
        statusBarItem.tooltip = 'PatiPro: 停止中 (クリックで開始)';
        statusBarItem.command = 'patipuro.start';
    }
}

/**
 * シェルコマンドをVSCodeタスクとして実行し、終了コードに応じて弾を発射する
 */
async function runPatiTask(commandKey: 'buildCommand' | 'lintCommand' | 'testCommand') {
    const config = vscode.workspace.getConfiguration('patipuro');
    const defaultCmd = commandKey === 'buildCommand' ? 'npm run build' : commandKey === 'lintCommand' ? 'npm run lint' : 'npm test';
    const cmd = config.get<string>(commandKey) ?? defaultCmd;
    const label = commandKey === 'buildCommand' ? 'ビルド' : commandKey === 'lintCommand' ? 'Lint' : 'テスト';

    const task = new vscode.Task(
        { type: 'patipuro', command: commandKey },
        vscode.TaskScope.Workspace,
        label,
        'PatiPro',
        new vscode.ShellExecution(cmd)
    );

    const execution = await vscode.tasks.executeTask(task);

    const disposable = vscode.tasks.onDidEndTaskProcess(e => {
        if (e.execution !== execution) { return; }
        disposable.dispose();

        if (e.exitCode === 0) {
            postMessageToAll({ type: 'burst', count: 15 });
            vscode.window.showInformationMessage(`🎰 ${label}成功！パチンコ大放出！`);
        } else {
            vscode.window.showWarningMessage(`❌ ${label}失敗... 不発`);
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBar();
    statusBarItem.show();

    // WebviewViewProviderをサイドバーとパネル両方に登録
    const provider = new PatiProViewProvider();
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('patipuro.sidebarView', provider),
        vscode.window.registerWebviewViewProvider('patipuro.panelView', provider),
    );

    // 開始コマンド
    const startCmd = vscode.commands.registerCommand('patipuro.start',async () => {
        isActive = true;
        await selectPatidai(context);

        // 文字が追加されたときだけ発射（Backspace・削除は除外）
        textChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
            const hasInsertion = event.contentChanges.some(c => c.text.length > 0);
            if (hasInsertion) {
                postMessageToAll({ type: 'keypress' });
            }
        });

        // ターミナルでのビルド・Lintコマンドを検知して発射
        const config = vscode.workspace.getConfiguration('patipuro');
        const buildPatterns = config.get<string[]>('buildPatterns') ?? []; //情報源を一つにするために削除
        const lintPatterns  = config.get<string[]>('lintPatterns')  ?? [];
        const testPatterns  = config.get<string[]>('testPatterns')  ?? [];

        shellExecDisposable = vscode.window.onDidEndTerminalShellExecution(e => {
            if (e.exitCode === undefined || e.exitCode !== 0) { return; }

            const cmd = e.execution.commandLine.value;
            const isBuild = buildPatterns.some(p => cmd.includes(p));
            const isLint  = lintPatterns.some(p => cmd.includes(p));
            const isTest  = testPatterns.some(p => cmd.includes(p));

            if (isBuild) {
                postMessageToAll({ type: 'burst', count: 15 });
                vscode.window.showInformationMessage('🎰 ビルド成功！パチンコ大放出！');
            } else if (isLint) {
                postMessageToAll({ type: 'burst', count: 10 });
                vscode.window.showInformationMessage('✅ Lint通過！パチンコ放出！');
            } else if (isTest) {
                postMessageToAll({ type: 'burst', count: 20 });
                vscode.window.showInformationMessage('🎯 テスト全通過！パチンコ大当たり！');
            }
        });

        updateStatusBar();
        vscode.window.showInformationMessage('PatiPro 開始！コードを打つたびにパチンコの弾が飛びます 🎰');
    });

    // 停止コマンド
    const stopCmd = vscode.commands.registerCommand('patipuro.stop', () => {
        stopPatiPro();
        vscode.window.showInformationMessage('PatiPro 停止');
    });

    // ビルド実行コマンド
    const runBuildCmd = vscode.commands.registerCommand('patipuro.runBuild', () => {
        runPatiTask('buildCommand');
    });

    // Lint実行コマンド
    const runLintCmd = vscode.commands.registerCommand('patipuro.runLint', () => {
        runPatiTask('lintCommand');
    });

    // テスト実行コマンド
    const runTestCmd = vscode.commands.registerCommand('patipuro.runTest', () => {
        runPatiTask('testCommand');
    });

    context.subscriptions.push(startCmd, stopCmd, runBuildCmd, runLintCmd, runTestCmd, statusBarItem);
}

export function deactivate() {
    stopPatiPro();
}


