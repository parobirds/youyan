export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface AesKey {
  raw: Uint8Array;
}

export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'system' | 'call_record';

export type BurnMode = 0 | 10 | 30 | 60;

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  senderId: string;
  senderName: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  duration?: number;
  recalled?: boolean;
  read?: boolean;
  burnAfterRead?: BurnMode;
  replyTo?: {
    id: string;
    content: string;
    senderName: string;
    type: MessageType;
  };
  callType?: 'voice' | 'video';
  callDuration?: number;
  callStatus?: 'incoming' | 'outgoing' | 'missed' | 'answered';
}

export interface EncryptedMessage {
  iv: string;
  ciphertext: string;
  timestamp: number;
  senderId: string;
  senderName: string;
  type: MessageType;
  msgId?: string;
}

export interface Member {
  id: string;
  name: string;
  publicKey: string;
}

export interface Room {
  id: string;
  name: string;
  maxMembers: number;
  createdAt: number;
  members: Member[];
  dissolved?: boolean;
}

export type SignalType =
  | 'join'
  | 'key_exchange'
  | 'message'
  | 'leave'
  | 'ready'
  | 'call'
  | 'message_recall'
  | 'message_read'
  | 'burn_trigger'
  | 'room_dissolved'
  | 'screenshot';

export interface SignalMessage {
  type: SignalType;
  roomId: string;
  senderId: string;
  senderName?: string;
  payload: any;
  timestamp: number;
}

export type ConnectionStatus = 'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected';
