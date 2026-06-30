import type { EncryptedMessage, Room } from '@/types';

const MESSAGES_KEY = 'e2ee_messages_';
const ROOMS_KEY = 'e2ee_rooms';

export function saveMessages(roomId: string, messages: EncryptedMessage[]): void {
  try {
    localStorage.setItem(MESSAGES_KEY + roomId, JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save messages:', e);
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
  localStorage.removeItem(MESSAGES_KEY + roomId);
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
  const keys = Object.keys(localStorage).filter((k) => k.startsWith('e2ee_'));
  keys.forEach((k) => localStorage.removeItem(k));
}
