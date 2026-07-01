import type { EncryptedMessage, Room } from '@/types';

const MESSAGES_KEY_PREFIX = 'e2ee_messages_';
const ROOMS_KEY = 'e2ee_rooms';

// 使用 IndexedDB 存储大数据，不限制消息数量
let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('YouYanDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // 消息存储
      if (!database.objectStoreNames.contains('messages')) {
        database.createObjectStore('messages', { keyPath: ['roomId', 'timestamp'] });
      }
      
      // 房间存储
      if (!database.objectStoreNames.contains('rooms')) {
        database.createObjectStore('rooms', { keyPath: 'id' });
      }
      
      // 本地文件存储（接收的加密文件解密后存储在本地）
      if (!database.objectStoreNames.contains('localFiles')) {
        const fileStore = database.createObjectStore('localFiles', { keyPath: 'id' });
        fileStore.createIndex('roomId', 'roomId', { unique: false });
      }
    };
  });
}

export function saveMessages(roomId: string, messages: EncryptedMessage[]): void {
  // 小数据用 localStorage（快速读写）
  const smallMessages = messages.map(msg => {
    if (msg.ciphertext.length > 100000) {
      return { ...msg, ciphertext: 'INDEXEDDB_REF', largeData: true };
    }
    return msg;
  });
  
  try {
    localStorage.setItem(MESSAGES_KEY_PREFIX + roomId, JSON.stringify(smallMessages));
  } catch (e) {
    console.error('localStorage save failed:', e);
  }
  
  // 大消息存 IndexedDB
  messages.forEach(async (msg) => {
    if (msg.ciphertext.length > 100000) {
      try {
        const database = await openDB();
        const tx = database.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        store.put({ roomId, ...msg });
      } catch (e) {
        console.error('IndexedDB save failed:', e);
      }
    }
  });
}

export async function loadMessages(roomId: string): Promise<EncryptedMessage[]> {
  let messages: EncryptedMessage[] = [];
  try {
    const data = localStorage.getItem(MESSAGES_KEY_PREFIX + roomId);
    if (data) {
      messages = JSON.parse(data);
    }
  } catch (e) {
    console.error('localStorage load failed:', e);
  }
  
  try {
    const database = await openDB();
    const tx = database.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const range = IDBKeyRange.bound([roomId, 0], [roomId, Date.now()]);
    const bigMessages = await new Promise<EncryptedMessage[]>((resolve, reject) => {
      const request = store.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    messages = messages.map(msg => {
      if (msg.largeData) {
        const bigMsg = bigMessages.find(b => b.timestamp === msg.timestamp);
        return bigMsg || msg;
      }
      return msg;
    });
    
    bigMessages.forEach(bigMsg => {
      if (!messages.find(m => m.timestamp === bigMsg.timestamp)) {
        messages.push(bigMsg);
      }
    });
  } catch (e) {
    console.error('IndexedDB load failed:', e);
  }
  
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export function clearMessages(roomId: string): void {
  try {
    localStorage.removeItem(MESSAGES_KEY_PREFIX + roomId);
  } catch (e) {
    console.error('localStorage clear failed:', e);
  }
  
  openDB().then(database => {
    const tx = database.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const range = IDBKeyRange.bound([roomId, 0], [roomId, Date.now()]);
    store.delete(range);
  }).catch(e => console.error('IndexedDB clear failed:', e));
}

export function saveRooms(rooms: Room[]): void {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  } catch (e) {
    console.error('Failed to save rooms:', e);
  }
}

export function loadRooms(): Room[] {
  try {
    const data = localStorage.getItem(ROOMS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load rooms:', e);
    return [];
  }
}

export function clearAllData(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('e2ee_'));
    keys.forEach((k) => localStorage.removeItem(k));
    
    openDB().then(database => {
      database.transaction('messages', 'readwrite').objectStore('messages').clear();
      database.transaction('rooms', 'readwrite').objectStore('rooms').clear();
      database.transaction('localFiles', 'readwrite').objectStore('localFiles').clear();
    }).catch(e => console.error('IndexedDB clear failed:', e));
  } catch (e) {
    console.error('Failed to clear data:', e);
  }
}

// 本地文件存储（接收的文件解密后存储在 IndexedDB）
export interface LocalFile {
  id: string;
  roomId: string;
  name: string;
  size: number;
  type: string;
  data: ArrayBuffer;
  receivedAt: number;
}

export async function saveLocalFile(file: LocalFile): Promise<void> {
  try {
    const database = await openDB();
    const tx = database.transaction('localFiles', 'readwrite');
    const store = tx.objectStore('localFiles');
    store.put(file);
  } catch (e) {
    console.error('Failed to save local file:', e);
  }
}

export async function loadLocalFile(id: string): Promise<LocalFile | null> {
  try {
    const database = await openDB();
    const tx = database.transaction('localFiles', 'readonly');
    const store = tx.objectStore('localFiles');
    return await new Promise<LocalFile | null>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to load local file:', e);
    return null;
  }
}

export async function loadLocalFilesByRoom(roomId: string): Promise<LocalFile[]> {
  try {
    const database = await openDB();
    const tx = database.transaction('localFiles', 'readonly');
    const store = tx.objectStore('localFiles');
    const index = store.index('roomId');
    return await new Promise<LocalFile[]>((resolve, reject) => {
      const request = index.getAll(roomId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Failed to load local files:', e);
    return [];
  }
}