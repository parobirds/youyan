import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/curves/utils.js';
import type { AesKey, EncryptedMessage, Message, MessageType } from '@/types';
import { bytesToBase64, base64ToBytes, generateId } from '@/utils';

export async function encryptText(plaintext: string, aesKey: AesKey): Promise<EncryptedMessage> {
  const iv = randomBytes(12);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = gcm(aesKey.raw, iv).encrypt(encoded);

  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(encrypted, 12);

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
    id: generateId(),
    type: parsed.type as MessageType,
    content: parsed.content,
    timestamp: encrypted.timestamp,
    senderId: encrypted.senderId,
    senderName: encrypted.senderName,
  };
}
