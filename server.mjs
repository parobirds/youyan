import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { readFile, stat, writeFile, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5173;
const DIST_DIR = join(__dirname, 'dist');
const UPLOADS_DIR = join(__dirname, 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
  
  // 处理上传文件下载
  if (urlPath.startsWith('/uploads/')) {
    const filePath = join(__dirname, urlPath);
    try {
      const content = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
      });
      res.end(content);
      return;
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
  }
  
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

// 处理文件上传
async function handleUpload(req, res) {
  const chunks = [];
  let totalSize = 0;
  
  req.on('data', (chunk) => {
    totalSize += chunk.length;
    if (totalSize > MAX_FILE_SIZE) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '文件过大，最大支持 50MB' }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  
  req.on('end', async () => {
    try {
      const buffer = Buffer.concat(chunks);
      const boundary = req.headers['content-type'].split('boundary=')[1];
      
      // 解析 multipart 数据
      const fileData = parseMultipart(buffer, boundary);
      if (!fileData) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '无法解析文件' }));
        return;
      }
      
      // 生成文件 ID
      const fileId = randomUUID();
      const ext = extname(fileData.filename).toLowerCase();
      const savedName = `${fileId}${ext}`;
      const savedPath = join(UPLOADS_DIR, savedName);
      
      // 确保 uploads 目录存在
      try {
        await stat(UPLOADS_DIR);
      } catch {
        await writeFile(join(UPLOADS_DIR, '.gitkeep'), '');
      }
      
      // 保存文件
      await writeFile(savedPath, fileData.data);
      
      // 返回结果
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: fileId,
        url: `/uploads/${savedName}`,
        name: fileData.filename,
        size: fileData.data.length,
        type: fileData.type || mimeTypes[ext] || 'application/octet-stream',
      }));
    } catch (err) {
      console.error('Upload error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '上传失败' }));
    }
  });
}

// 解析 multipart/form-data
function parseMultipart(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  
  while (start < buffer.length) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;
    
    const nextBoundary = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
    if (nextBoundary === -1) break;
    
    const part = buffer.slice(boundaryIndex + boundaryBuffer.length, nextBoundary);
    parts.push(part);
    start = nextBoundary;
  }
  
  for (const part of parts) {
    // 查找 header 和 body 分隔符
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    
    const header = part.slice(0, headerEnd).toString();
    const body = part.slice(headerEnd + 4, part.length - 2); // 去掉结尾的 \r\n
    
    // 解析 header
    const filenameMatch = header.match(/filename="([^"]+)"/);
    const typeMatch = header.match(/Content-Type: ([^\r\n]+)/);
    
    if (filenameMatch) {
      return {
        filename: filenameMatch[1],
        type: typeMatch ? typeMatch[1] : null,
        data: body,
      };
    }
  }
  
  return null;
}

const server = createServer((req, res) => {
  // WebSocket 升级请求不处理
  if (req.url?.startsWith('/ws')) {
    return;
  }
  
  // 文件上传 API
  if (req.url === '/api/upload' && req.method === 'POST') {
    handleUpload(req, res);
    return;
  }
  
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let clientId = null;

  // 发送连接确认
  ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'join' || message.type === 'connect') {
        currentRoomId = message.roomId;
        clientId = message.senderId;
        const room = getRoom(currentRoomId);
        room.clients.set(clientId, ws);
        
        // 广播给房间其他人
        broadcastToRoom(currentRoomId, message, clientId);
        
        // 告知客户端已加入成功
        ws.send(JSON.stringify({ 
          type: 'joined', 
          roomId: currentRoomId, 
          memberCount: room.clients.size,
          timestamp: Date.now() 
        }));
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
        // 广播离开消息
        broadcastToRoom(currentRoomId, { 
          type: 'leave', 
          roomId: currentRoomId, 
          senderId: clientId,
          timestamp: Date.now() 
        }, clientId);
        
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
  console.log(`File upload API: http://0.0.0.0:${PORT}/api/upload`);
});