export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface AesKey {
  raw: Uint8Array;
}

export type MessageType = 'text' | 'image' | 'file' | 'voice';

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface VoiceMetadata {
  duration: number;
}

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
}

export interface EncryptedMessage {
  iv: string;
  ciphertext: string;
  timestamp: number;
  senderId: string;
  senderName: string;
  type: MessageType;
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
}

export type SignalType = 'join' | 'key_exchange' | 'message' | 'leave' | 'ready' | 'call';

export interface SignalMessage {
  type: SignalType;
  roomId: string;
  senderId: string;
  senderName?: string;
  payload: any;
  timestamp: number;
}

export type ConnectionStatus = 'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected';
