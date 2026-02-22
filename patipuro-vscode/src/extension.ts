import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | null = null;
let isActive = false;
let textChangeDisposable: vscode.Disposable | null = null;
let shellExecDisposable: vscode.Disposable | null = null;
let statusBarItem: vscode.StatusBarItem;

// patipuro-vscode/src/extension.ts の一部を修正

function getWebviewContent(): string {
    // Viteの開発サーバーURLを指定します
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

function createPanel(context: vscode.ExtensionContext) {
    panel = vscode.window.createWebviewPanel(
        'patipuro',
        'PatiPro',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = getWebviewContent();

    panel.onDidDispose(() => {
        panel = null;
        stopPatiPro();
    }, null, context.subscriptions);
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
async function runPatiTask(commandKey: 'buildCommand' | 'lintCommand') {
    const config = vscode.workspace.getConfiguration('patipuro');
    const cmd = config.get<string>(commandKey) ?? (commandKey === 'buildCommand' ? 'npm run build' : 'npm run lint');
    const label = commandKey === 'buildCommand' ? 'ビルド' : 'Lint';

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
            panel?.webview.postMessage({ type: 'burst', count: 15 });
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

    // 開始コマンド
    const startCmd = vscode.commands.registerCommand('patipuro.start', () => {
        isActive = true;

        if (!panel) {
            createPanel(context);
        } else {
            panel.reveal(vscode.ViewColumn.Beside);
        }

        // 文字が追加されたときだけ発射（Backspace・削除は除外）
        textChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
            const hasInsertion = event.contentChanges.some(c => c.text.length > 0);
            if (hasInsertion) {
                // 直接 Webview へ postMessage を送る
                panel?.webview.postMessage({ type: 'keypress' });
            }
        });

        // ターミナルでのビルド・Lintコマンドを検知して発射
        const config = vscode.workspace.getConfiguration('patipuro');
        const buildPatterns = config.get<string[]>('buildPatterns') ?? ['run build', 'tsc', 'webpack', 'vite build'];
        const lintPatterns  = config.get<string[]>('lintPatterns')  ?? ['run lint', 'eslint', 'biome check', 'biome lint'];

        shellExecDisposable = vscode.window.onDidEndTerminalShellExecution(e => {
            if (e.exitCode === undefined || e.exitCode !== 0) { return; }

            const cmd = e.execution.commandLine.value;
            const isBuild = buildPatterns.some(p => cmd.includes(p));
            const isLint  = lintPatterns.some(p => cmd.includes(p));

            if (isBuild) {
                panel?.webview.postMessage({ type: 'burst', count: 15 });
                vscode.window.showInformationMessage('🎰 ビルド成功！パチンコ大放出！');
            } else if (isLint) {
                panel?.webview.postMessage({ type: 'burst', count: 10 });
                vscode.window.showInformationMessage('✅ Lint通過！パチンコ放出！');
            }
        });

        updateStatusBar();
        vscode.window.showInformationMessage('PatiPro 開始！コードを打つたびにパチンコの弾が飛びます 🎰');
    });

    // 停止コマンド
    const stopCmd = vscode.commands.registerCommand('patipuro.stop', () => {
        stopPatiPro();
        panel?.dispose();
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

    context.subscriptions.push(startCmd, stopCmd, runBuildCmd, runLintCmd, statusBarItem);
}

export function deactivate() {
    stopPatiPro();
    panel?.dispose();
}
