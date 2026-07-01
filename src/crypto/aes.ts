import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/curves/utils.js';
import type { AesKey, EncryptedMessage, Message, MessageType, BurnMode } from '@/types';
import { bytesToBase64, base64ToBytes, generateId } from '@/utils';

export async function encryptText(plaintext: string, aesKey: AesKey): Promise<EncryptedMessage> {
  const iv = randomBytes(12);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = gcm(aesKey.raw, iv).encrypt(encoded);

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(encrypted),
    timestamp: Date.now(),
    senderId: '',
    senderName: '',
    type: 'text',
  };
}

export async function decryptText(encrypted: EncryptedMessage, aesKey: AesKey): Promise<string> {
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const decrypted = gcm(aesKey.raw, iv).decrypt(ciphertext);
  return new TextDecoder().decode(decrypted);
}

export async function encryptMessage(
  message: Omit<Message, 'id'>,
  aesKey: AesKey
): Promise<EncryptedMessage> {
  const iv = randomBytes(12);
  const content = JSON.stringify({
    type: message.type,
    content: message.content,
    fileName: message.fileName,
    fileSize: message.fileSize,
    fileType: message.fileType,
    duration: message.duration,
    burnAfterRead: message.burnAfterRead,
    replyTo: message.replyTo,
    callType: message.callType,
    callDuration: message.callDuration,
    callStatus: message.callStatus,
  });
  const encoded = new TextEncoder().encode(content);
  const encrypted = gcm(aesKey.raw, iv).encrypt(encoded);

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(encrypted),
    timestamp: message.timestamp,
    senderId: message.senderId,
    senderName: message.senderName,
    type: message.type,
    msgId: generateId(),
  };
}

export async function decryptMessage(
  encrypted: EncryptedMessage,
  aesKey: AesKey
): Promise<Message> {
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const decrypted = gcm(aesKey.raw, iv).decrypt(ciphertext);
  const content = new TextDecoder().decode(decrypted);
  const parsed = JSON.parse(content);

  return {
    id: encrypted.msgId || generateId(),
    type: parsed.type as MessageType,
    content: parsed.content,
    timestamp: encrypted.timestamp,
    senderId: encrypted.senderId,
    senderName: encrypted.senderName,
    fileName: parsed.fileName,
    fileSize: parsed.fileSize,
    fileType: parsed.fileType,
    duration: parsed.duration,
    burnAfterRead: parsed.burnAfterRead as BurnMode | undefined,
    replyTo: parsed.replyTo,
    callType: parsed.callType,
    callDuration: parsed.callDuration,
    callStatus: parsed.callStatus,
  };
}
