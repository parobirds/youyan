import type { Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

interface SignalMessage {
  type: string;
  roomId: string;
  senderId: string;
  senderName?: string;
  payload: any;
  timestamp: number;
}

interface Room {
  id: string;
  clients: Map<string, WebSocket>;
}

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { id: roomId, clients: new Map() });
  }
  return rooms.get(roomId)!;
}

function broadcastToRoom(roomId: string, message: SignalMessage, excludeId?: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const messageStr = JSON.stringify(message);
  room.clients.forEach((ws, clientId) => {
    if (clientId !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
}

export default function signalServerPlugin(): Plugin {
  return {
    name: 'signal-server',
    configureServer(server) {
      if (!server.httpServer) return;

      const wss = new WebSocketServer({ noServer: true });

      server.httpServer.on('upgrade', (request, socket, head) => {
        const { pathname } = new URL(request.url!, `http://${request.headers.host}`);
        
        if (pathname === '/ws') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            let currentRoomId: string | null = null;
            let clientId: string | null = null;

            ws.on('message', (data) => {
              try {
                const message = JSON.parse(data.toString()) as SignalMessage;

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
        }
      });

      console.log('[signal-server] WebSocket signaling server ready at /ws');
    },
    configurePreviewServer(server) {
      if (!server.httpServer) return;

      const wss = new WebSocketServer({ noServer: true });

      server.httpServer.on('upgrade', (request, socket, head) => {
        const { pathname } = new URL(request.url!, `http://${request.headers.host}`);
        
        if (pathname === '/ws') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            let currentRoomId: string | null = null;
            let clientId: string | null = null;

            ws.on('message', (data) => {
              try {
                const message = JSON.parse(data.toString()) as SignalMessage;

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
        }
      });

      console.log('[signal-server] WebSocket signaling server ready at /ws');
    },
  };
}
