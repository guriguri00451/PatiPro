import * as vscode from 'vscode';

let panel: vscode.WebviewPanel | null = null;
let isActive = false;
let textChangeDisposable: vscode.Disposable | null = null;
let statusBarItem: vscode.StatusBarItem;

function getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 script-src 'unsafe-inline' https://cdnjs.cloudflare.com;
                 style-src 'unsafe-inline';">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #1a1a2e;
            display: flex;
            flex-direction: column;
            align-items: center;
            height: 100vh;
            overflow: hidden;
        }
        #info {
            color: #888;
            padding: 6px 0;
            font-family: sans-serif;
            font-size: 12px;
            letter-spacing: 0.05em;
        }
    </style>
</head>
<body>
    <div id="info">⌨️ コードを打つと玉が飛びます</div>
    <div id="scene"></div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js"></script>
    <script>
        const { Engine, Render, Runner, Bodies, Body, Composite, World } = Matter;

        const BOARD_WIDTH = 400;
        const BOARD_HEIGHT = 560;

        const engine = Engine.create();

        const render = Render.create({
            element: document.getElementById('scene'),
            engine,
            options: {
                width: BOARD_WIDTH,
                height: BOARD_HEIGHT,
                wireframes: false,
                background: '#1a1a2e'
            }
        });

        // 壁
        const ground    = Bodies.rectangle(BOARD_WIDTH / 2, BOARD_HEIGHT + 10, BOARD_WIDTH + 20, 20, { isStatic: true, render: { fillStyle: '#444' } });
        const leftWall  = Bodies.rectangle(-10, BOARD_HEIGHT / 2, 20, BOARD_HEIGHT, { isStatic: true, render: { fillStyle: '#444' } });
        const rightWall = Bodies.rectangle(BOARD_WIDTH + 10, BOARD_HEIGHT / 2, 20, BOARD_HEIGHT, { isStatic: true, render: { fillStyle: '#444' } });

        // 釘
        const pegs = [];
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 6; j++) {
                const x = 50 + j * 60 + (i % 2 === 0 ? 30 : 0);
                const y = 80 + i * 50;
                pegs.push(Bodies.circle(x, y, 5, {
                    isStatic: true,
                    render: { fillStyle: '#ffcc00' }
                }));
            }
        }

        World.add(engine.world, [ground, leftWall, rightWall, ...pegs]);
        Render.run(render);
        Runner.run(Runner.create(), engine);

        // 玉を発射
        function shootBall() {
            const ball = Bodies.circle(380, 30, 8, {
                restitution: 0.5,
                friction: 0.005,
                render: { fillStyle: '#00ffcc' }
            });
            Body.setVelocity(ball, { x: -5, y: 0 });
            Composite.add(engine.world, ball);
        }

        // 拡張機能からのメッセージを受信
        window.addEventListener('message', (event) => {
            if (event.data.type === 'keypress') {
                shootBall();
            }
        });
    </script>
</body>
</html>`;
}

function createPanel(context: vscode.ExtensionContext) {
    panel = vscode.window.createWebviewPanel(
        'patipuro',
        'PatiPro',
        vscode.ViewColumn.Beside,       // エディタの横に並べて表示
        {
            enableScripts: true,
            retainContextWhenHidden: true   // パネルを隠しても物理演算の状態を保持
        }
    );

    panel.webview.html = getWebviewContent();

    // パネルを閉じたら停止
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

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBar();
    statusBarItem.show();

    // 開始コマンド
    const startCmd = vscode.commands.registerCommand('patipuro.start', () => {
        isActive = true;

        // パネルが既にあれば前面に出すだけ、なければ新規作成
        if (!panel) {
            createPanel(context);
        } else {
            panel.reveal(vscode.ViewColumn.Beside);
        }

        // テキスト変更 → postMessage → WebView で shootBall()
        textChangeDisposable = vscode.workspace.onDidChangeTextDocument(() => {
            panel?.webview.postMessage({ type: 'keypress' });
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

    context.subscriptions.push(startCmd, stopCmd, statusBarItem);
}

export function deactivate() {
    stopPatiPro();
    panel?.dispose();
}
