import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/curves/utils.js';
import type { AesKey } from '@/types';
import { bytesToBase64, base64ToBytes, generateId } from '@/utils';
import { signalChannel } from '@/signal/channel';
import { saveLocalFile, type LocalFile } from '@/storage';

// 分块大小：32KB（WebSocket 安全传输大小）
const CHUNK_SIZE = 32 * 1024;
// 最大文件大小：50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export interface FileTransferProgress {
  fileId: string;
  fileName: string;
  fileSize: number;
  transferred: number;
  status: 'pending' | 'sending' | 'receiving' | 'completed' | 'cancelled' | 'error';
  error?: string;
}

export interface FileTransferMeta {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
}

// 加密一个数据块
function encryptChunk(data: Uint8Array, aesKey: AesKey): { iv: string; ciphertext: string } {
  const iv = randomBytes(12);
  const encrypted = gcm(aesKey.raw, iv).encrypt(data);
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(encrypted),
  };
}

// 解密一个数据块
function decryptChunk(iv: string, ciphertext: string, aesKey: AesKey): Uint8Array {
  const ivBytes = base64ToBytes(iv);
  const ciphertextBytes = base64ToBytes(ciphertext);
  return gcm(aesKey.raw, ivBytes).decrypt(ciphertextBytes);
}

// 发送文件（分块加密传输）
export async function sendEncryptedFile(
  file: File,
  aesKey: AesKey,
  roomId: string,
  senderId: string,
  senderName: string,
  onProgress?: (progress: FileTransferProgress) => void
): Promise<void> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大，最大支持 ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const fileId = generateId();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  const meta: FileTransferMeta = {
    fileId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    totalChunks,
  };

  // 发送文件开始信令
  signalChannel.send('file_start', meta, senderId, senderName);

  // 读取文件并分块发送
  const reader = new FileReader();
  let chunkIndex = 0;

  const sendNextChunk = async (arrayBuffer: ArrayBuffer) => {
    const totalSent = chunkIndex * CHUNK_SIZE;
    const remaining = file.size - totalSent;
    const chunkSize = Math.min(CHUNK_SIZE, remaining);
    const start = totalSent;
    const end = start + chunkSize;

    if (start >= file.size) {
      // 发送完成
      signalChannel.send('file_end', { fileId, totalChunks }, senderId, senderName);
      onProgress?.({
        fileId,
        fileName: file.name,
        fileSize: file.size,
        transferred: file.size,
        status: 'completed',
      });
      return;
    }

    const chunkData = new Uint8Array(arrayBuffer, start, chunkSize);
    const encrypted = encryptChunk(chunkData, aesKey);

    signalChannel.send('file_chunk', {
      fileId,
      chunkIndex,
      totalChunks,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
    }, senderId, senderName);

    onProgress?.({
      fileId,
      fileName: file.name,
      fileSize: file.size,
      transferred: end,
      status: 'sending',
    });

    chunkIndex++;
    
    // 延迟发送下一块，避免 WebSocket 缓冲区溢出
    setTimeout(() => sendNextChunk(arrayBuffer), 10);
  };

  reader.onload = async (event) => {
    const arrayBuffer = event.target?.result as ArrayBuffer;
    await sendNextChunk(arrayBuffer);
  };

  reader.onerror = () => {
    signalChannel.send('file_cancel', { fileId }, senderId, senderName);
    onProgress?.({
      fileId,
      fileName: file.name,
      fileSize: file.size,
      transferred: 0,
      status: 'error',
      error: '文件读取失败',
    });
  };

  reader.readAsArrayBuffer(file);
}

// 接收文件（分块解密）
export class FileReceiver {
  private aesKey: AesKey;
  private roomId: string;
  private chunks: Map<number, Uint8Array> = new Map();
  private meta: FileTransferMeta | null = null;
  private onProgress?: (progress: FileTransferProgress) => void;
  private onComplete?: (file: LocalFile) => void;

  constructor(
    aesKey: AesKey,
    roomId: string,
    onProgress?: (progress: FileTransferProgress) => void,
    onComplete?: (file: LocalFile) => void
  ) {
    this.aesKey = aesKey;
    this.roomId = roomId;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
  }

  handleSignal(type: string, payload: any) {
    switch (type) {
      case 'file_start':
        this.handleFileStart(payload);
        break;
      case 'file_chunk':
        this.handleFileChunk(payload);
        break;
      case 'file_end':
        this.handleFileEnd(payload);
        break;
      case 'file_cancel':
        this.handleFileCancel(payload);
        break;
    }
  }

  private handleFileStart(meta: FileTransferMeta) {
    this.meta = meta;
    this.chunks.clear();
    this.onProgress?.({
      fileId: meta.fileId,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      transferred: 0,
      status: 'receiving',
    });
  }

  private handleFileChunk(payload: { fileId: string; chunkIndex: number; iv: string; ciphertext: string }) {
    if (!this.meta || payload.fileId !== this.meta.fileId) return;

    try {
      const decrypted = decryptChunk(payload.iv, payload.ciphertext, this.aesKey);
      this.chunks.set(payload.chunkIndex, decrypted);

      const transferred = (payload.chunkIndex + 1) * CHUNK_SIZE;
      this.onProgress?.({
        fileId: this.meta.fileId,
        fileName: this.meta.fileName,
        fileSize: this.meta.fileSize,
        transferred: Math.min(transferred, this.meta.fileSize),
        status: 'receiving',
      });
    } catch (e) {
      console.error('Failed to decrypt chunk:', e);
      this.onProgress?.({
        fileId: this.meta.fileId,
        fileName: this.meta.fileName,
        fileSize: this.meta.fileSize,
        transferred: 0,
        status: 'error',
        error: '解密失败',
      });
    }
  }

  private async handleFileEnd(payload: { fileId: string }) {
    if (!this.meta || payload.fileId !== this.meta.fileId) return;

    // 合并所有块
    const totalSize = this.meta.fileSize;
    const result = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < this.meta.totalChunks; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) {
        console.error(`Missing chunk ${i}`);
        this.onProgress?.({
          fileId: this.meta.fileId,
          fileName: this.meta.fileName,
          fileSize: this.meta.fileSize,
          transferred: 0,
          status: 'error',
          error: `缺少数据块 ${i}`,
        });
        return;
      }
      result.set(chunk, offset);
      offset += chunk.length;
    }

    // 保存到本地 IndexedDB
    const localFile: LocalFile = {
      id: this.meta.fileId,
      roomId: this.roomId,
      name: this.meta.fileName,
      size: this.meta.fileSize,
      type: this.meta.fileType,
      data: result.buffer,
      receivedAt: Date.now(),
    };

    await saveLocalFile(localFile);

    this.onProgress?.({
      fileId: this.meta.fileId,
      fileName: this.meta.fileName,
      fileSize: this.meta.fileSize,
      transferred: this.meta.fileSize,
      status: 'completed',
    });

    this.onComplete?.(localFile);

    // 清理
    this.chunks.clear();
    this.meta = null;
  }

  private handleFileCancel(payload: { fileId: string }) {
    if (this.meta && payload.fileId === this.meta.fileId) {
      this.chunks.clear();
      this.meta = null;
      this.onProgress?.({
        fileId: payload.fileId,
        fileName: '',
        fileSize: 0,
        transferred: 0,
        status: 'cancelled',
      });
    }
  }
}

// 创建下载 URL（从 IndexedDB 文件）
export function createDownloadUrl(file: LocalFile): string {
  const blob = new Blob([file.data], { type: file.type });
  return URL.createObjectURL(blob);
}

// 下载文件
export function downloadFile(file: LocalFile): void {
  const url = createDownloadUrl(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // URL.revokeObjectURL(url); // 不立即释放，以便后续使用
}