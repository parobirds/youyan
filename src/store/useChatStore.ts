import { create } from 'zustand';
import type { Message, EncryptedMessage, Room, Member, KeyPair, AesKey, ConnectionStatus } from '@/types';
import { generateKeyPair, deriveSharedKey, publicKeyToBase64, base64ToPublicKey } from '@/crypto/ecdh';
import { encryptMessage, decryptMessage } from '@/crypto/aes';
import { signalChannel } from '@/signal/channel';
import { generateId, generateRoomId } from '@/utils';
import { saveMessages, loadMessages } from '@/storage';

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

  setMyName: (name: string) => void;
  createRoom: (maxMembers?: number) => Promise<string>;
  joinRoom: (roomId: string) => Promise<void>;
  sendMessage: (content: string, type?: 'text' | 'image' | 'file') => Promise<void>;
  handleKeyExchange: (peerPublicKey: string, peerId: string, peerName: string) => Promise<void>;
  handleIncomingMessage: (encrypted: EncryptedMessage) => Promise<void>;
  leaveRoom: () => void;
  loadHistory: (roomId: string) => Promise<void>;
}

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

  sendMessage: async (content: string, type: 'text' | 'image' | 'file' = 'text') => {
    const { sharedKey, myId, myName, room, encryptedMessages } = get();
    if (!sharedKey || !room) return;

    const message = {
      type,
      content,
      timestamp: Date.now(),
      senderId: myId,
      senderName: myName,
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
}));
