import type { SignalMessage, SignalType } from '@/types';

type MessageHandler = (message: SignalMessage) => void;
type ConnectionCallback = () => void;

class SignalChannel {
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private roomId: string = '';
  private handlers: Map<SignalType, MessageHandler[]> = new Map();
  private onConnectedCallback: ConnectionCallback | null = null;
  private onJoinedCallback: ConnectionCallback | null = null;
  private status: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private pendingMessages: SignalMessage[] = [];
  // 记录已处理的消息 ID，防止重复处理
  private processedMsgIds: Set<string> = new Set();
  private maxProcessedMsgIds: number = 500;
  // 发送消息队列（等待连接就绪）
  private sendQueue: { type: SignalType; payload: any; senderId: string; senderName?: string }[] = [];

  connect(roomId: string): void {
    this.roomId = roomId;
    this.handlers.clear();
    this.pendingMessages = [];
    this.sendQueue = [];
    this.reconnectAttempts = 0;
    this.processedMsgIds.clear();

    // 优先使用 WebSocket（跨设备通信）
    if (typeof WebSocket !== 'undefined') {
      this.connectWebSocket(roomId);
    } else {
      // WebSocket 不可用时使用 BroadcastChannel（本地同浏览器标签页间通信）
      this.setupBroadcastChannel(roomId);
    }
  }

  private connectWebSocket(roomId: string): void {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.status = 'connecting';
      console.log('[SignalChannel] Connecting to', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[SignalChannel] WebSocket opened');
        this.status = 'connected';
        this.reconnectAttempts = 0;
        
        // 连接成功后发送队列中的消息
        this.flushSendQueue();
        
        // 触发连接回调
        if (this.onConnectedCallback) {
          this.onConnectedCallback();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as SignalMessage | { type: string; timestamp: number };
          
          // 处理服务端响应
          if (message.type === 'connected') {
            console.log('[SignalChannel] Server confirmed connection');
            this.status = 'connected';
            this.flushSendQueue();
            return;
          }
          
          if (message.type === 'joined') {
            console.log('[SignalChannel] Joined room successfully');
            if (this.onJoinedCallback) {
              this.onJoinedCallback();
            }
            return;
          }
          
          // 处理业务信令
          if ((message as SignalMessage).roomId === this.roomId) {
            this.dispatchOnce(message as SignalMessage);
          }
        } catch (e) {
          console.error('[SignalChannel] Failed to parse message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[SignalChannel] WebSocket closed:', event.code, event.reason);
        this.status = 'disconnected';
        
        // 如果不是正常关闭，尝试重连
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.tryReconnect(roomId);
        } else {
          // WebSocket 断开时启用 BroadcastChannel 作为备用
          this.setupBroadcastChannel(roomId);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[SignalChannel] WebSocket error:', error);
      };
    } catch (e) {
      console.error('[SignalChannel] Failed to create WebSocket:', e);
      this.status = 'disconnected';
      this.setupBroadcastChannel(roomId);
    }
  }

  private setupBroadcastChannel(roomId: string): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(`e2ee-chat-${roomId}`);
      this.broadcastChannel.onmessage = (event) => {
        const message = event.data as SignalMessage;
        if (message.roomId === this.roomId) {
          this.dispatchOnce(message);
        }
      };
      console.log('[SignalChannel] BroadcastChannel setup for local fallback');
    }
  }

  private tryReconnect(roomId: string): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
    
    console.log(`[SignalChannel] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.roomId === roomId && this.status === 'disconnected') {
        this.connectWebSocket(roomId);
      }
    }, delay);
  }

  private flushSendQueue(): void {
    console.log('[SignalChannel] Flushing send queue, items:', this.sendQueue.length);
    while (this.sendQueue.length > 0) {
      const item = this.sendQueue.shift();
      if (item) {
        this.doSend(item.type, item.payload, item.senderId, item.senderName);
      }
    }
  }

  private doSend(type: SignalType, payload: any, senderId: string, senderName?: string): void {
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
    } else if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(message);
    }
  }

  disconnect(): void {
    console.log('[SignalChannel] Disconnecting...');
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
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
    this.sendQueue = [];
    this.reconnectAttempts = 0;
    this.processedMsgIds.clear();
    this.onConnectedCallback = null;
    this.onJoinedCallback = null;
  }

  send(type: SignalType, payload: any, senderId: string, senderName?: string): void {
    // 如果 WebSocket 未连接，加入队列等待
    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
      console.log('[SignalChannel] Queuing message:', type, 'status:', this.status);
      this.sendQueue.push({ type, payload, senderId, senderName });
      return;
    }
    
    this.doSend(type, payload, senderId, senderName);
  }

  // 设置连接就绪回调
  onConnected(callback: ConnectionCallback): void {
    this.onConnectedCallback = callback;
  }

  // 设置加入房间成功回调
  onJoined(callback: ConnectionCallback): void {
    this.onJoinedCallback = callback;
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
        const candidateId = candidate?.candidate || candidate?.sdpMid || JSON.stringify(candidate);
        msgId = `${message.senderId}-ice-${candidateId}`;
      } else {
        msgId = `${message.timestamp}-${message.senderId}-${message.type}-${action}`;
      }
    } else if (message.type === 'message') {
      // 消息使用 timestamp 作为唯一标识
      msgId = `${message.timestamp}-${message.senderId}-message`;
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
      this.processedMsgIds = new Set(arr.slice(-250));
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
    return this.status === 'connected' || (this.ws && this.ws.readyState === WebSocket.OPEN);
  }
}

export const signalChannel = new SignalChannel();