import { create } from 'zustand';
import type { Message, EncryptedMessage, Room, KeyPair, AesKey, ConnectionStatus, BurnMode } from '@/types';
import { generateKeyPair, deriveSharedKey, publicKeyToBase64, base64ToPublicKey } from '@/crypto/ecdh';
import { encryptMessage, decryptMessage } from '@/crypto/aes';
import { signalChannel } from '@/signal/channel';
import { generateId, generateRoomId } from '@/utils';
import { saveMessages, loadMessages, loadLocalFile } from '@/storage';
import { useScreenShareStore } from './useScreenShareStore';
import { sendEncryptedFile, FileReceiver, createDownloadUrl, type FileTransferProgress } from '@/lib/fileTransfer';

export type CallType = 'voice' | 'video' | null;
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface ChatState {
  room: Room | null;
  myId: string;
  myName: string;
  keyPair: KeyPair | null;
  sharedKey: AesKey | null;
  messages: Message[];
  encryptedMessages: EncryptedMessage[];
  connectionStatus: ConnectionStatus;
  peerPublicKey: string | null;
  burnMode: BurnMode;

  callType: CallType;
  callStatus: CallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;

  fileTransferProgress: Map<string, FileTransferProgress>;

  setMyName: (name: string) => void;
  setBurnMode: (mode: BurnMode) => void;
  createRoom: (maxMembers?: number) => Promise<string>;
  joinRoom: (roomId: string, onRoomFull?: (maxMembers: number) => void) => Promise<void>;
  sendMessage: (content: string, type?: Message['type'], meta?: Partial<Message>) => Promise<void>;
  sendFile: (file: File, onProgress?: (progress: FileTransferProgress) => void) => Promise<void>;
  recallMessage: (msgId: string) => void;
  deleteMessage: (msgId: string) => void;
  burnMessage: (msgId: string) => void;
  markAsRead: (msgId: string) => void;
  handleKeyExchange: (peerPublicKey: string, peerId: string, peerName: string) => Promise<void>;
  handleIncomingMessage: (encrypted: EncryptedMessage) => Promise<void>;
  handleRecall: (msgId: string) => void;
  handleRead: (msgId: string) => void;
  handleBurnTrigger: (msgId: string) => void;
  handleRoomDissolved: () => void;
  handleScreenshot: (senderName: string) => void;
  handleFileSignal: (type: string, payload: any, senderId: string, senderName: string) => void;
  getFileUrl: (fileId: string) => Promise<string | null>;
  leaveRoom: () => void;
  dissolveRoom: () => void;
  loadHistory: (roomId: string) => Promise<void>;

  startCall: (type: 'voice' | 'video') => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  handleCallSignal: (data: any) => void;
  _cleanupCall: () => void;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const useChatStore = create<ChatState>((set, get) => ({
  room: null,
  myId: '',
  myName: '我',
  keyPair: null,
  sharedKey: null,
  messages: [],
  encryptedMessages: [],
  connectionStatus: 'idle',
  peerPublicKey: null,
  burnMode: 0,

  callType: null,
  callStatus: 'idle',
  localStream: null,
  remoteStream: null,
  peerConnection: null,

  fileTransferProgress: new Map(),

  setMyName: (name: string) => set({ myName: name }),
  setBurnMode: (mode: BurnMode) => set({ burnMode: mode }),

  createRoom: async (maxMembers = 2) => {
    const roomId = generateRoomId();
    const myId = generateId();
    const keyPair = await generateKeyPair();

    const room: Room = {
      id: roomId,
      name: '有言聊天室',
      maxMembers,
      createdAt: Date.now(),
      members: [
        { id: myId, name: '我', publicKey: publicKeyToBase64(keyPair.publicKey) },
      ],
    };

    set({
      room, myId, keyPair,
      connectionStatus: 'waiting',
      messages: [], encryptedMessages: [],
      sharedKey: null, peerPublicKey: null,
      burnMode: 0,
    });

    signalChannel.connect(roomId);
    _setupSignalHandlers(get, set, keyPair, myId);

    signalChannel.send(
      'join',
      { publicKey: publicKeyToBase64(keyPair.publicKey), name: get().myName, maxMembers },
      myId, get().myName
    );

    return roomId;
  },

  joinRoom: async (roomId: string, onRoomFull?: (maxMembers: number) => void) => {
    const myId = generateId();
    const keyPair = await generateKeyPair();

    const room: Room = {
      id: roomId,
      name: '有言聊天室',
      maxMembers: 2,
      createdAt: Date.now(),
      members: [
        { id: myId, name: '我', publicKey: publicKeyToBase64(keyPair.publicKey) },
      ],
    };

    set({
      room, myId, keyPair,
      connectionStatus: 'connecting',
      messages: [], encryptedMessages: [],
      sharedKey: null, peerPublicKey: null,
      burnMode: 0,
    });

    signalChannel.connect(roomId);
    _setupSignalHandlers(get, set, keyPair, myId);
    
    if (onRoomFull) {
      signalChannel.onRoomFull((data) => {
        onRoomFull(data.maxMembers || 2);
      });
    }

    signalChannel.send(
      'join',
      { publicKey: publicKeyToBase64(keyPair.publicKey), name: get().myName },
      myId, get().myName
    );

    await get().loadHistory(roomId);
  },

  handleKeyExchange: async (peerPublicKey: string, peerId: string, peerName: string) => {
    const { keyPair, room } = get();
    if (!keyPair || !room) return;

    const peerPubKeyBytes = base64ToPublicKey(peerPublicKey);
    const sharedKey = await deriveSharedKey(keyPair.privateKey, peerPubKeyBytes);

    const updatedMembers = [
      ...room.members.filter((m) => m.id !== peerId),
      { id: peerId, name: peerName, publicKey: peerPublicKey },
    ];

    const wasConnected = get().connectionStatus === 'connected';

    set({
      sharedKey, peerPublicKey,
      room: { ...room, members: updatedMembers },
      connectionStatus: 'connected',
    });

    if (!wasConnected) {
      get().loadHistory(room.id);
      get().sendMessage('加密通道已建立', 'system');
    }
  },

  sendMessage: async (content: string, type: Message['type'] = 'text', meta: Partial<Message> = {}) => {
    const { sharedKey, myId, myName, room, encryptedMessages, burnMode } = get();
    if (!sharedKey || !room) return;

    const message = {
      type, content,
      timestamp: Date.now(),
      senderId: myId, senderName: myName,
      burnAfterRead: type === 'text' || type === 'image' ? burnMode : undefined,
      ...meta,
    };

    const encrypted = await encryptMessage(message, sharedKey);
    const decrypted: Message = { id: encrypted.msgId!, ...message };

    const newEncrypted = [...encryptedMessages, encrypted];
    const newMessages = [...get().messages, decrypted];

    set({ messages: newMessages, encryptedMessages: newEncrypted });
    saveMessages(room.id, newEncrypted);
    signalChannel.send('message', encrypted, myId, myName);

    if (burnMode > 0 && (type === 'text' || type === 'image')) {
      signalChannel.send('burn_trigger', { msgId: encrypted.msgId }, myId);
    }
  },

  recallMessage: (msgId: string) => {
    const { messages, myId, room } = get();
    if (!room) return;

    const msg = messages.find(m => m.id === msgId);
    if (!msg || msg.senderId !== myId) return;

    const now = Date.now();
    if (now - msg.timestamp > 120000) return;

    set({
      messages: messages.map(m => m.id === msgId ? { ...m, recalled: true } : m),
    });

    signalChannel.send('message_recall', { msgId }, myId);
  },

  deleteMessage: (msgId: string) => {
    const { messages } = get();
    set({ messages: messages.filter(m => m.id !== msgId) });
  },

  burnMessage: (msgId: string) => {
    const { messages, myId, room } = get();
    if (!room) return;
    const msg = messages.find(m => m.id === msgId);
    if (!msg || msg.senderId !== myId) return;

    set({
      messages: messages.filter(m => m.id !== msgId),
    });
    signalChannel.send('message_recall', { msgId, burned: true }, myId);
  },

  sendFile: async (file: File, onProgress?: (progress: FileTransferProgress) => void) => {
    const { sharedKey, myId, myName, room } = get();
    if (!sharedKey || !room) return;

    await sendEncryptedFile(file, sharedKey, room.id, myId, myName, (progress) => {
      const newProgress = new Map(get().fileTransferProgress);
      newProgress.set(progress.fileId, progress);
      set({ fileTransferProgress: newProgress });
      onProgress?.(progress);

      if (progress.status === 'completed') {
        const fileMsg: Partial<Message> = {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        };
        get().sendMessage(progress.fileId, 'file', fileMsg);
        setTimeout(() => {
          const p = new Map(get().fileTransferProgress);
          p.delete(progress.fileId);
          set({ fileTransferProgress: p });
        }, 1000);
      }
    });
  },

  markAsRead: (msgId: string) => {
    const { messages, myId } = get();
    set({
      messages: messages.map(m =>
        m.id === msgId && m.senderId !== myId ? { ...m, read: true } : m
      ),
    });
    signalChannel.send('message_read', { msgId }, myId);
  },

  handleIncomingMessage: async (encrypted: EncryptedMessage) => {
    const { sharedKey, messages, encryptedMessages, room } = get();
    if (!sharedKey || !room) return;

    try {
      const decrypted = await decryptMessage(encrypted, sharedKey);

      if (decrypted.type === 'system' && decrypted.content === '加密通道已建立') {
        const exists = messages.some(m =>
          m.type === 'system' && m.content === '加密通道已建立'
        );
        if (exists) return;
      }

      const newEncrypted = [...encryptedMessages, encrypted];
      const newMessages = [...messages, decrypted];

      set({ messages: newMessages, encryptedMessages: newEncrypted });
      saveMessages(room.id, newEncrypted);

      if (decrypted.burnAfterRead && decrypted.burnAfterRead > 0) {
        setTimeout(() => {
          get().deleteMessage(decrypted.id);
        }, decrypted.burnAfterRead * 1000);
      }
    } catch (e) {
      console.error('Failed to decrypt message:', e);
    }
  },

  handleRecall: (msgId: string, burned?: boolean) => {
    const { messages } = get();
    if (burned) {
      set({ messages: messages.filter(m => m.id !== msgId) });
    } else {
      set({
        messages: messages.map(m => m.id === msgId ? { ...m, recalled: true, content: '消息已撤回' } : m),
      });
    }
  },

  handleRead: (msgId: string) => {
    const { messages } = get();
    set({
      messages: messages.map(m => m.id === msgId ? { ...m, read: true } : m),
    });
  },

  handleBurnTrigger: (msgId: string) => {
    const { messages } = get();
    const msg = messages.find(m => m.id === msgId);
    if (msg && msg.burnAfterRead && msg.burnAfterRead > 0) {
      setTimeout(() => {
        get().deleteMessage(msgId);
      }, msg.burnAfterRead * 1000);
    }
  },

  handleRoomDissolved: () => {
    const { room } = get();
    if (room) {
      set({
        room: { ...room, dissolved: true },
        connectionStatus: 'disconnected',
      });
      get()._cleanupCall();
    }
  },

  handleScreenshot: (senderName: string) => {
    const { messages, myId, room } = get();
    if (!room) return;

    const sysMsg: Message = {
      id: generateId(),
      type: 'system',
      content: `${senderName} 截屏了聊天界面`,
      timestamp: Date.now(),
      senderId: 'system',
      senderName: '系统',
    };
    set({ messages: [...messages, sysMsg] });
  },

  handleFileSignal: (type: string, payload: any, senderId: string, senderName: string) => {
    const { sharedKey, room, messages, encryptedMessages } = get();
    if (!sharedKey || !room) return;

    let receiver = (get() as any)._fileReceiver;
    if (!receiver) {
      receiver = new FileReceiver(sharedKey, room.id, 
        (progress) => {
          const newProgress = new Map(get().fileTransferProgress);
          newProgress.set(progress.fileId, progress);
          set({ fileTransferProgress: newProgress });
        },
        async (localFile) => {
          const fileMessage: Message = {
            id: generateId(),
            type: 'file',
            content: localFile.id,
            timestamp: Date.now(),
            senderId,
            senderName,
            fileName: localFile.name,
            fileSize: localFile.size,
            fileType: localFile.type,
          };
          
          const encrypted = await encryptMessage(fileMessage, sharedKey);
          const decrypted: Message = { id: encrypted.msgId!, ...fileMessage };
          
          const newEncrypted = [...get().encryptedMessages, encrypted];
          const newMessages = [...get().messages, decrypted];
          
          set({ messages: newMessages, encryptedMessages: newEncrypted });
          saveMessages(room.id, newEncrypted);
          
          setTimeout(() => {
            const p = new Map(get().fileTransferProgress);
            p.delete(localFile.id);
            set({ fileTransferProgress: p });
          }, 1000);
        }
      );
      (get() as any)._fileReceiver = receiver;
    }

    receiver.handleSignal(type, payload);
  },

  getFileUrl: async (fileId: string): Promise<string | null> => {
    try {
      const file = await loadLocalFile(fileId);
      if (file) {
        return createDownloadUrl(file);
      }
      return null;
    } catch (e) {
      console.error('Failed to get file url:', e);
      return null;
    }
  },

  dissolveRoom: () => {
    const { myId, room } = get();
    if (!room) return;
    signalChannel.send('room_dissolved', {}, myId);
    get().leaveRoom();
  },

  leaveRoom: () => {
    const { peerConnection, localStream } = get();
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    useScreenShareStore.getState()._cleanup();
    signalChannel.disconnect();
    set({
      room: null, myId: '', keyPair: null, sharedKey: null,
      messages: [], encryptedMessages: [],
      connectionStatus: 'idle', peerPublicKey: null,
      burnMode: 0,
      callType: null, callStatus: 'idle',
      localStream: null, remoteStream: null, peerConnection: null,
    });
  },

  loadHistory: async (roomId: string) => {
    const { sharedKey } = get();
    const encrypted = await loadMessages(roomId);
    if (sharedKey && encrypted.length > 0) {
      try {
        const decrypted = await Promise.all(encrypted.map(msg => decryptMessage(msg, sharedKey)));
        set({ encryptedMessages: encrypted, messages: decrypted });
      } catch (e) {
        console.error('Failed to decrypt history:', e);
      }
    } else {
      set({ encryptedMessages: encrypted });
    }
  },

  startCall: async (type: 'voice' | 'video') => {
    const { myId, room } = get();
    if (!room) return;
    try {
      const constraints = type === 'video' ? { audio: true, video: true } : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      set({ localStream: stream, callType: type, callStatus: 'calling' });

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      set({ peerConnection: pc });
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => set({ remoteStream: event.streams[0] });
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signalChannel.send('call', { callType: type, action: 'ice-candidate', candidate: event.candidate }, myId);
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') set({ callStatus: 'connected' });
        else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') get().endCall();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signalChannel.send('call', { callType: type, action: 'offer', offer }, myId);
    } catch (e) {
      console.error('Failed to start call:', e);
      set({ callStatus: 'idle', callType: null });
    }
  },

  acceptCall: async () => {
    const { myId, callType, peerConnection, localStream } = get();
    if (!callType || !peerConnection) return;
    try {
      const constraints = callType === 'video' ? { audio: true, video: true } : { audio: true, video: false };
      const stream = localStream || await navigator.mediaDevices.getUserMedia(constraints);
      set({ localStream: stream, callStatus: 'connected' });
      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      signalChannel.send('call', { callType, action: 'answer', answer }, myId);
    } catch (e) {
      console.error('Failed to accept call:', e);
      get().endCall();
    }
  },

  rejectCall: () => {
    const { myId, callType } = get();
    signalChannel.send('call', { callType, action: 'reject' }, myId);
    get()._cleanupCall();
  },

  endCall: () => {
    const { myId, callType } = get();
    if (callType) {
      signalChannel.send('call', { callType, action: 'end' }, myId);
    }
    get()._cleanupCall();
  },

  _cleanupCall: () => {
    const { peerConnection, localStream } = get();
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    set({
      callType: null, callStatus: 'idle',
      localStream: null, remoteStream: null, peerConnection: null,
    });
  },

  handleCallSignal: async (data: any) => {
    const { callStatus: currentStatus, peerConnection: existingPc, myId } = get();

    switch (data.action) {
      case 'offer':
        if (currentStatus === 'idle') {
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          set({ peerConnection: pc, callType: data.callType, callStatus: 'ringing' });
          pc.ontrack = (event) => set({ remoteStream: event.streams[0] });
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              signalChannel.send('call', { callType: data.callType, action: 'ice-candidate', candidate: event.candidate }, myId);
            }
          };
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') set({ callStatus: 'connected' });
            else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') get()._cleanupCall();
          };
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        }
        break;
      case 'answer':
        if (existingPc && currentStatus === 'calling') {
          await existingPc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        break;
      case 'ice-candidate':
        if (existingPc && data.candidate) {
          try { await existingPc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { console.error('ICE error:', e); }
        }
        break;
      case 'reject':
      case 'end':
        get()._cleanupCall();
        break;
    }
  },
}));

function _setupSignalHandlers(get: any, set: any, keyPair: KeyPair, myId: string) {
  signalChannel.on('join', async (message: any) => {
    if (message.senderId !== get().myId) {
      const { publicKey, name } = message.payload;
      await get().handleKeyExchange(publicKey, message.senderId, name || '对方');
      signalChannel.send('key_exchange',
        { publicKey: publicKeyToBase64(keyPair.publicKey), name: get().myName },
        get().myId);
    }
  });

  signalChannel.on('key_exchange', async (message: any) => {
    if (message.senderId !== get().myId) {
      const { publicKey, name } = message.payload;
      await get().handleKeyExchange(publicKey, message.senderId, name || '对方');
    }
  });

  signalChannel.on('message', async (message: any) => {
    if (message.senderId !== get().myId) {
      await get().handleIncomingMessage(message.payload);
    }
  });

  signalChannel.on('call', (message: any) => {
    if (message.senderId !== get().myId) get().handleCallSignal(message.payload);
  });

  signalChannel.on('message_recall', (message: any) => {
    if (message.senderId !== get().myId) get().handleRecall(message.payload.msgId, message.payload.burned);
  });

  signalChannel.on('message_read', (message: any) => {
    if (message.senderId !== get().myId) get().handleRead(message.payload.msgId);
  });

  signalChannel.on('burn_trigger', (message: any) => {
    if (message.senderId !== get().myId) get().handleBurnTrigger(message.payload.msgId);
  });

  signalChannel.on('room_dissolved', (message: any) => {
    if (message.senderId !== get().myId) get().handleRoomDissolved();
  });

  signalChannel.on('screenshot', (message: any) => {
    if (message.senderId !== get().myId) get().handleScreenshot(message.senderName || '对方');
  });

  signalChannel.on('screen_share', (message: any) => {
    if (message.senderId !== get().myId) {
      useScreenShareStore.getState().handleSignal(
        message.payload,
        message.senderId,
        message.senderName
      );
    }
  });

  signalChannel.on('file_start', (message: any) => {
    if (message.senderId !== get().myId) {
      get().handleFileSignal('file_start', message.payload, message.senderId, message.senderName || '对方');
    }
  });

  signalChannel.on('file_chunk', (message: any) => {
    if (message.senderId !== get().myId) {
      get().handleFileSignal('file_chunk', message.payload, message.senderId, message.senderName || '对方');
    }
  });

  signalChannel.on('file_end', (message: any) => {
    if (message.senderId !== get().myId) {
      get().handleFileSignal('file_end', message.payload, message.senderId, message.senderName || '对方');
    }
  });

  signalChannel.on('file_cancel', (message: any) => {
    if (message.senderId !== get().myId) {
      get().handleFileSignal('file_cancel', message.payload, message.senderId, message.senderName || '对方');
    }
  });
}
