import type { EncryptedMessage, Room } from '@/types';

const MESSAGES_KEY = 'e2ee_messages_';
const ROOMS_KEY = 'e2ee_rooms';
// 限制每间房最多保存 100 条消息，防止 localStorage 溢出
const MAX_MESSAGES_PER_ROOM = 100;

export function saveMessages(roomId: string, messages: EncryptedMessage[]): void {
  try {
    // 只保留最近的消息，防止超大 base64 数据撑爆 localStorage
    const trimmed = messages.slice(-MAX_MESSAGES_PER_ROOM);
    const data = JSON.stringify(trimmed);
    // 如果数据超过 4MB，进一步削减
    if (data.length > 4 * 1024 * 1024) {
      const half = trimmed.slice(-Math.floor(trimmed.length / 2));
      localStorage.setItem(MESSAGES_KEY + roomId, JSON.stringify(half));
    } else {
      localStorage.setItem(MESSAGES_KEY + roomId, data);
    }
  } catch (e) {
    console.error('Failed to save messages:', e);
    // 存储失败时尝试清除旧数据后重试
    try {
      const half = messages.slice(-20);
      localStorage.setItem(MESSAGES_KEY + roomId, JSON.stringify(half));
    } catch (e2) {
      console.error('Still failed to save:', e2);
    }
  }
}

export function loadMessages(roomId: string): EncryptedMessage[] {
  try {
    const data = localStorage.getItem(MESSAGES_KEY + roomId);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load messages:', e);
    return [];
  }
}

export function clearMessages(roomId: string): void {
  try {
    localStorage.removeItem(MESSAGES_KEY + roomId);
  } catch (e) {
    console.error('Failed to clear messages:', e);
  }
}

export function saveRooms(rooms: Room[]): void {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms.slice(-20)));
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
  } catch (e) {
    console.error('Failed to clear data:', e);
  }
}
