import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5173;
const DIST_DIR = join(__dirname, 'dist');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { id: roomId, clients: new Map() });
  }
  return rooms.get(roomId);
}

function broadcastToRoom(roomId, message, excludeId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const messageStr = JSON.stringify(message);
  room.clients.forEach((ws, clientId) => {
    if (clientId !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
}

async function serveStatic(req, res) {
  let urlPath = req.url || '/';
  
  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  const filePath = join(DIST_DIR, urlPath);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      const indexPath = join(filePath, 'index.html');
      try {
        const indexStat = await stat(indexPath);
        if (indexStat.isFile()) {
          const content = await readFile(indexPath);
          const ext = extname(indexPath).toLowerCase();
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
          res.end(content);
          return;
        }
      } catch {}
    }

    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (err) {
    try {
      const indexPath = join(DIST_DIR, 'index.html');
      const content = await readFile(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/ws')) {
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let clientId = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'join' || message.type === 'connect') {
        currentRoomId = message.roomId;
        clientId = message.senderId;
        const room = getRoom(currentRoomId);
        room.clients.set(clientId, ws);
        broadcastToRoom(currentRoomId, message, clientId);
      } else if (currentRoomId && clientId) {
        broadcastToRoom(currentRoomId, message, clientId);
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoomId && clientId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.clients.delete(clientId);
        if (room.clients.size === 0) {
          rooms.delete(currentRoomId);
        }
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket endpoint: ws://0.0.0.0:${PORT}/ws`);
});
