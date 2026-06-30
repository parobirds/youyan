import { p256 } from '@noble/curves/nist.js';
import { randomBytes } from '@noble/curves/utils.js';
import type { KeyPair, AesKey } from '@/types';
import { bytesToBase64, base64ToBytes } from '@/utils';

export async function generateKeyPair(): Promise<KeyPair> {
  const privateKey = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(privateKey, false);
  return { privateKey, publicKey };
}

export async function deriveSharedKey(
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<AesKey> {
  const sharedPoint = p256.getSharedSecret(myPrivateKey, peerPublicKey, false);
  const aesRaw = sharedPoint.slice(1, 33);
  return { raw: aesRaw };
}

export function publicKeyToBase64(publicKey: Uint8Array): string {
  return bytesToBase64(publicKey);
}

export function base64ToPublicKey(base64: string): Uint8Array {
  return base64ToBytes(base64);
}

export function getKeyFingerprint(publicKey: Uint8Array): string {
  let h = 0;
  for (let i = 0; i < publicKey.length; i++) {
    h = (h << 5) - h + publicKey[i];
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0').toUpperCase();
}
