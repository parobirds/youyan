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
  // 记录已处理的消息 ID，防止重复处理
  private processedMsgIds: Set<string> = new Set();
  private maxProcessedMsgIds: number = 1000;

  connect(roomId: string): void {
    this.roomId = roomId;
    this.handlers.clear();
    this.pendingMessages = [];
    this.reconnectAttempts = 0;
    this.processedMsgIds.clear();

    // 优先使用 WebSocket（跨设备通信）
    if (typeof WebSocket !== 'undefined') {
      this.connectWebSocket(roomId);
    }
    
    // BroadcastChannel 仅用于本地同浏览器标签页间通信（备用）
    // 注意：WebSocket 已连接时不使用 BroadcastChannel 发送，避免重复
    if (typeof BroadcastChannel !== 'undefined' && !this.ws) {
      this.broadcastChannel = new BroadcastChannel(`e2ee-chat-${roomId}`);
      this.broadcastChannel.onmessage = (event) => {
        const message = event.data as SignalMessage;
        if (message.roomId === this.roomId) {
          this.dispatchOnce(message);
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
        
        // WebSocket 连接成功后关闭 BroadcastChannel（避免重复接收）
        if (this.broadcastChannel) {
          this.broadcastChannel.close();
          this.broadcastChannel = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as SignalMessage;
          if (message.roomId === this.roomId) {
            this.dispatchOnce(message);
          }
        } catch (e) {
          console.error('[SignalChannel] Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[SignalChannel] WebSocket closed');
        this.status = 'disconnected';
        // WebSocket 断开时启用 BroadcastChannel 作为备用
        if (typeof BroadcastChannel !== 'undefined' && !this.broadcastChannel) {
          this.broadcastChannel = new BroadcastChannel(`e2ee-chat-${this.roomId}`);
          this.broadcastChannel.onmessage = (event) => {
            const message = event.data as SignalMessage;
            if (message.roomId === this.roomId) {
              this.dispatchOnce(message);
            }
          };
        }
        this.tryReconnect(roomId);
      };

      this.ws.onerror = (error) => {
        console.error('[SignalChannel] WebSocket error:', error);
      };
    } catch (e) {
      console.error('[SignalChannel] Failed to create WebSocket:', e);
      this.status = 'disconnected';
      // WebSocket 创建失败时使用 BroadcastChannel
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel(`e2ee-chat-${roomId}`);
        this.broadcastChannel.onmessage = (event) => {
          const message = event.data as SignalMessage;
          if (message.roomId === this.roomId) {
            this.dispatchOnce(message);
          }
        };
      }
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
    this.processedMsgIds.clear();
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

    // 优先通过 WebSocket 发送（跨设备）
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else if (this.ws && this.status === 'connecting') {
      this.pendingMessages.push(message);
    } else if (this.broadcastChannel) {
      // WebSocket 不可用时才用 BroadcastChannel（本地通信）
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

  // 只处理一次，防止重复
  private dispatchOnce(message: SignalMessage): void {
    // 根据不同信令类型构建唯一标识
    let msgId: string;
    
    if (message.type === 'call') {
      const action = message.payload?.action || '';
      if (action === 'ice-candidate') {
        // ICE candidate 每个都不同，需要更精细的标识
        const candidate = message.payload?.candidate;
        const candidateId = candidate?.candidate || candidate?.sdpMid || '';
        msgId = `${message.senderId}-ice-${candidateId}`;
      } else {
        msgId = `${message.timestamp}-${message.senderId}-${message.type}-${action}`;
      }
    } else {
      msgId = `${message.timestamp}-${message.senderId}-${message.type}`;
    }
    
    if (this.processedMsgIds.has(msgId)) {
      console.log('[SignalChannel] Skipping duplicate message:', msgId);
      return;
    }
    
    // 记录已处理的消息
    this.processedMsgIds.add(msgId);
    if (this.processedMsgIds.size > this.maxProcessedMsgIds) {
      // 清理旧记录
      const arr = Array.from(this.processedMsgIds);
      this.processedMsgIds = new Set(arr.slice(-500));
    }
    
    this.dispatch(message);
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