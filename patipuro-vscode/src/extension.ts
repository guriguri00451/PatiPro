import * as vscode from 'vscode';
import * as WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080';

let ws: WebSocket.WebSocket | null = null;
let isActive = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let statusBarItem: vscode.StatusBarItem;
let textChangeDisposable: vscode.Disposable | null = null;

function connect() {
    if (ws) {
        ws.terminate();
    }

    ws = new WebSocket.WebSocket(WS_URL);

    ws.on('open', () => {
        console.log('[PatiPro] WebSocket connected');
        updateStatusBar();
    });

    ws.on('close', () => {
        console.log('[PatiPro] WebSocket disconnected');
        updateStatusBar();
        if (isActive) {
            // 3秒後に再接続
            reconnectTimer = setTimeout(connect, 3000);
        }
    });

    ws.on('error', () => {
        // 接続エラーは静かに処理（サーバー未起動時）
    });
}

function sendKeypress() {
    if (ws && ws.readyState === WebSocket.WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'keypress' }));
    }
}

function updateStatusBar() {
    if (!isActive) {
        statusBarItem.text = '$(circle-slash) PatiPro';
        statusBarItem.tooltip = 'PatiPro: 停止中 (クリックで開始)';
        statusBarItem.command = 'patipuro.start';
    } else if (ws && ws.readyState === WebSocket.WebSocket.OPEN) {
        statusBarItem.text = '$(zap) PatiPro';
        statusBarItem.tooltip = 'PatiPro: 動作中 (クリックで停止)';
        statusBarItem.command = 'patipuro.stop';
    } else {
        statusBarItem.text = '$(sync~spin) PatiPro';
        statusBarItem.tooltip = 'PatiPro: サーバーに接続中...';
        statusBarItem.command = 'patipuro.stop';
    }
}

export function activate(context: vscode.ExtensionContext) {
    // ステータスバーアイテム作成
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.show();
    updateStatusBar();

    // 開始コマンド
    const startCmd = vscode.commands.registerCommand('patipuro.start', () => {
        isActive = true;
        connect();
        updateStatusBar();

        // テキスト変更イベントを登録
        textChangeDisposable = vscode.workspace.onDidChangeTextDocument(() => {
            sendKeypress();
        });

        context.subscriptions.push(textChangeDisposable);
        vscode.window.showInformationMessage('PatiPro 開始！コードを打つたびにパチンコの弾が飛びます');
    });

    // 停止コマンド
    const stopCmd = vscode.commands.registerCommand('patipuro.stop', () => {
        isActive = false;

        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        if (ws) {
            ws.terminate();
            ws = null;
        }

        if (textChangeDisposable) {
            textChangeDisposable.dispose();
            textChangeDisposable = null;
        }

        updateStatusBar();
        vscode.window.showInformationMessage('PatiPro 停止');
    });

    context.subscriptions.push(startCmd, stopCmd, statusBarItem);
}

export function deactivate() {
    isActive = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.terminate();
    if (textChangeDisposable) textChangeDisposable.dispose();
}
