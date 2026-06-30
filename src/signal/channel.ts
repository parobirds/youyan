import type { SignalMessage, SignalType } from '@/types';

type MessageHandler = (message: SignalMessage) => void;
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

class SignalChannel {
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private roomId: string = '';
  private handlers: Map<SignalType, MessageHandler[]> = new Map();
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private pendingMessages: SignalMessage[] = [];

  connect(roomId: string): void {
    this.roomId = roomId;
    this.handlers.clear();
    this.pendingMessages = [];
    this.reconnectAttempts = 0;

    if (typeof WebSocket !== 'undefined') {
      this.connectWebSocket(roomId);
    }
    
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(`e2ee-chat-${roomId}`);
      this.broadcastChannel.onmessage = (event) => {
        const message = event.data as SignalMessage;
        if (message.roomId === this.roomId) {
          this.dispatch(message);
        }
      };
    }
  }

  private connectWebSocket(roomId: string): void {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.status = 'connecting';
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[SignalChannel] WebSocket connected');
        this.status = 'connected';
        this.reconnectAttempts = 0;
        this.flushPendingMessages();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as SignalMessage;
          if (message.roomId === this.roomId) {
            this.dispatch(message);
          }
        } catch (e) {
          console.error('[SignalChannel] Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[SignalChannel] WebSocket closed');
        this.status = 'disconnected';
        this.tryReconnect(roomId);
      };

      this.ws.onerror = (error) => {
        console.error('[SignalChannel] WebSocket error:', error);
      };
    } catch (e) {
      console.error('[SignalChannel] Failed to create WebSocket:', e);
      this.status = 'disconnected';
    }
  }

  private tryReconnect(roomId: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[SignalChannel] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
    
    console.log(`[SignalChannel] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      if (this.roomId === roomId && this.status === 'disconnected') {
        this.connectWebSocket(roomId);
      }
    }, delay);
  }

  private flushPendingMessages(): void {
    while (this.pendingMessages.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.pendingMessages.shift();
      if (message) {
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    this.handlers.clear();
    this.roomId = '';
    this.status = 'disconnected';
    this.pendingMessages = [];
    this.reconnectAttempts = 0;
  }

  send(type: SignalType, payload: any, senderId: string, senderName?: string): void {
    const message: SignalMessage = {
      type,
      roomId: this.roomId,
      senderId,
      senderName,
      payload,
      timestamp: Date.now(),
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else if (this.ws && this.status === 'connecting') {
      this.pendingMessages.push(message);
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(message);
    }
  }

  on(type: SignalType, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: SignalType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private dispatch(message: SignalMessage): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }
}

export const signalChannel = new SignalChannel();
