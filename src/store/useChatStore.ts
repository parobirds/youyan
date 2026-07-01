import { create } from 'zustand';
import type { Message, EncryptedMessage, Room, Member, KeyPair, AesKey, ConnectionStatus } from '@/types';
import { generateKeyPair, deriveSharedKey, publicKeyToBase64, base64ToPublicKey } from '@/crypto/ecdh';
import { encryptMessage, decryptMessage } from '@/crypto/aes';
import { signalChannel } from '@/signal/channel';
import { generateId, generateRoomId } from '@/utils';
import { saveMessages, loadMessages } from '@/storage';

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

  callType: CallType;
  callStatus: CallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;

  setMyName: (name: string) => void;
  createRoom: (maxMembers?: number) => Promise<string>;
  joinRoom: (roomId: string) => Promise<void>;
  sendMessage: (content: string, type?: 'text' | 'image' | 'file' | 'voice', meta?: Partial<Message>) => Promise<void>;
  handleKeyExchange: (peerPublicKey: string, peerId: string, peerName: string) => Promise<void>;
  handleIncomingMessage: (encrypted: EncryptedMessage) => Promise<void>;
  leaveRoom: () => void;
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

  callType: null,
  callStatus: 'idle',
  localStream: null,
  remoteStream: null,
  peerConnection: null,

  setMyName: (name: string) => set({ myName: name }),

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
        {
          id: myId,
          name: '我',
          publicKey: publicKeyToBase64(keyPair.publicKey),
        },
      ],
    };

    set({
      room,
      myId,
      keyPair,
      connectionStatus: 'waiting',
      messages: [],
      encryptedMessages: [],
      sharedKey: null,
      peerPublicKey: null,
    });

    signalChannel.connect(roomId);

    signalChannel.on('join', async (message) => {
      if (message.senderId !== get().myId) {
        const { publicKey, name } = message.payload;
        await get().handleKeyExchange(publicKey, message.senderId, name || '对方');
        signalChannel.send(
          'key_exchange',
          { publicKey: publicKeyToBase64(keyPair.publicKey), name: get().myName },
          get().myId
        );
      }
    });

    signalChannel.on('message', async (message) => {
      if (message.senderId !== get().myId) {
        await get().handleIncomingMessage(message.payload);
      }
    });

    signalChannel.on('call', (message) => {
      if (message.senderId !== get().myId) {
        get().handleCallSignal(message.payload);
      }
    });

    return roomId;
  },

  joinRoom: async (roomId: string) => {
    const myId = generateId();
    const keyPair = await generateKeyPair();

    const room: Room = {
      id: roomId,
      name: '有言聊天室',
      maxMembers: 2,
      createdAt: Date.now(),
      members: [
        {
          id: myId,
          name: '我',
          publicKey: publicKeyToBase64(keyPair.publicKey),
        },
      ],
    };

    set({
      room,
      myId,
      keyPair,
      connectionStatus: 'connecting',
      messages: [],
      encryptedMessages: [],
      sharedKey: null,
      peerPublicKey: null,
    });

    signalChannel.connect(roomId);

    signalChannel.on('join', async (message) => {
      if (message.senderId !== get().myId) {
        const { publicKey, name } = message.payload;
        await get().handleKeyExchange(publicKey, message.senderId, name || '对方');
        signalChannel.send(
          'key_exchange',
          { publicKey: publicKeyToBase64(keyPair.publicKey), name: get().myName },
          get().myId
        );
      }
    });

    signalChannel.on('key_exchange', async (message) => {
      if (message.senderId !== get().myId) {
        const { publicKey, name } = message.payload;
        await get().handleKeyExchange(publicKey, message.senderId, name || '对方');
      }
    });

    signalChannel.on('message', async (message) => {
      if (message.senderId !== get().myId) {
        await get().handleIncomingMessage(message.payload);
      }
    });

    signalChannel.on('call', (message) => {
      if (message.senderId !== get().myId) {
        get().handleCallSignal(message.payload);
      }
    });

    signalChannel.send(
      'join',
      { publicKey: publicKeyToBase64(keyPair.publicKey), name: get().myName },
      myId,
      get().myName
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

    set({
      sharedKey,
      peerPublicKey,
      room: { ...room, members: updatedMembers },
      connectionStatus: 'connected',
    });
  },

  sendMessage: async (content: string, type: 'text' | 'image' | 'file' | 'voice' = 'text', meta: Partial<Message> = {}) => {
    const { sharedKey, myId, myName, room, encryptedMessages } = get();
    if (!sharedKey || !room) return;

    const message = {
      type,
      content,
      timestamp: Date.now(),
      senderId: myId,
      senderName: myName,
      ...meta,
    };

    const encrypted = await encryptMessage(message, sharedKey);
    const decrypted = {
      id: generateId(),
      ...message,
    };

    const newEncrypted = [...encryptedMessages, encrypted];
    const newMessages = [...get().messages, decrypted];

    set({
      messages: newMessages,
      encryptedMessages: newEncrypted,
    });

    saveMessages(room.id, newEncrypted);
    signalChannel.send('message', encrypted, myId, myName);
  },

  handleIncomingMessage: async (encrypted: EncryptedMessage) => {
    const { sharedKey, messages, encryptedMessages, room } = get();
    if (!sharedKey || !room) return;

    try {
      const decrypted = await decryptMessage(encrypted, sharedKey);

      const newEncrypted = [...encryptedMessages, encrypted];
      const newMessages = [...messages, decrypted];

      set({
        messages: newMessages,
        encryptedMessages: newEncrypted,
      });

      saveMessages(room.id, newEncrypted);
    } catch (e) {
      console.error('Failed to decrypt message:', e);
    }
  },

  leaveRoom: () => {
    const { peerConnection, localStream } = get();
    if (peerConnection) {
      peerConnection.close();
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    signalChannel.disconnect();
    set({
      room: null,
      myId: '',
      keyPair: null,
      sharedKey: null,
      messages: [],
      encryptedMessages: [],
      connectionStatus: 'idle',
      peerPublicKey: null,
      callType: null,
      callStatus: 'idle',
      localStream: null,
      remoteStream: null,
      peerConnection: null,
    });
  },

  loadHistory: async (roomId: string) => {
    const { sharedKey } = get();
    const encrypted = loadMessages(roomId);

    if (sharedKey && encrypted.length > 0) {
      try {
        const decrypted = await Promise.all(
          encrypted.map((msg) => decryptMessage(msg, sharedKey))
        );
        set({
          encryptedMessages: encrypted,
          messages: decrypted,
        });
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
      const constraints = type === 'video'
        ? { audio: true, video: true }
        : { audio: true, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      set({ localStream: stream, callType: type, callStatus: 'calling' });

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      set({ peerConnection: pc });

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        set({ remoteStream: event.streams[0] });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signalChannel.send('call', {
            callType: type,
            action: 'ice-candidate',
            candidate: event.candidate,
          }, myId);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          set({ callStatus: 'connected' });
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          get().endCall();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      signalChannel.send('call', {
        callType: type,
        action: 'offer',
        offer,
      }, myId);

    } catch (e) {
      console.error('Failed to start call:', e);
      set({ callStatus: 'idle', callType: null });
    }
  },

  acceptCall: async () => {
    const { myId, callType, peerConnection, localStream } = get();
    if (!callType || !peerConnection) return;

    try {
      const constraints = callType === 'video'
        ? { audio: true, video: true }
        : { audio: true, video: false };

      const stream = localStream || await navigator.mediaDevices.getUserMedia(constraints);
      set({ localStream: stream, callStatus: 'connected' });

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      signalChannel.send('call', {
        callType,
        action: 'answer',
        answer,
      }, myId);

    } catch (e) {
      console.error('Failed to accept call:', e);
      get().endCall();
    }
  },

  rejectCall: () => {
    const { myId, callType } = get();
    signalChannel.send('call', {
      callType,
      action: 'reject',
    }, myId);
    get()._cleanupCall();
  },

  endCall: () => {
    const { myId, callType } = get();
    if (callType) {
      signalChannel.send('call', {
        callType,
        action: 'end',
      }, myId);
    }
    get()._cleanupCall();
  },

  _cleanupCall: () => {
    const { peerConnection, localStream } = get();
    if (peerConnection) {
      peerConnection.close();
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    set({
      callType: null,
      callStatus: 'idle',
      localStream: null,
      remoteStream: null,
      peerConnection: null,
    });
  },

  handleCallSignal: async (data: any) => {
    const { callType: currentCallType, callStatus: currentCallStatus, peerConnection: existingPc, myId } = get();

    switch (data.action) {
      case 'offer':
        if (currentCallStatus === 'idle') {
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          set({ peerConnection: pc, callType: data.callType, callStatus: 'ringing' });

          pc.ontrack = (event) => {
            set({ remoteStream: event.streams[0] });
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              signalChannel.send('call', {
                callType: data.callType,
                action: 'ice-candidate',
                candidate: event.candidate,
              }, myId);
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
              set({ callStatus: 'connected' });
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              get()._cleanupCall();
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        }
        break;

      case 'answer':
        if (existingPc && currentCallStatus === 'calling') {
          await existingPc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        break;

      case 'ice-candidate':
        if (existingPc && data.candidate) {
          try {
            await existingPc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('Failed to add ICE candidate:', e);
          }
        }
        break;

      case 'reject':
      case 'end':
        get()._cleanupCall();
        break;
    }
  },
}));
