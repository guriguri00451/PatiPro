const { WebSocketServer } = require('ws');

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[server] client connected. total: ${clients.size}`);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'keypress') {
      // 送信元以外の全クライアントにbroadcast
      for (const client of clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'keypress' }));
        }
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[server] client disconnected. total: ${clients.size}`);
  });
});

console.log(`[server] WebSocket server running on ws://localhost:${PORT}`);
