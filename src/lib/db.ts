import { openDB } from 'idb';

const DB_NAME = 'BrandableDB';
const DB_VERSION = 1;

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('mutations')) {
        db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
};

export const getFiles = async () => {
  const db = await initDB();
  return db.getAll('files');
};

export const saveFiles = async (files: any[]) => {
  const db = await initDB();
  const tx = db.transaction('files', 'readwrite');
  await Promise.all([
    ...files.map(f => tx.store.put(f)),
    tx.done
  ]);
};

export const enqueueMutation = async (type: string, payload: any) => {
  const db = await initDB();
  await db.add('mutations', { type, payload, timestamp: Date.now() });
};

export const getMutations = async () => {
  const db = await initDB();
  return db.getAll('mutations');
};

export const clearMutations = async (ids: number[]) => {
  const db = await initDB();
  const tx = db.transaction('mutations', 'readwrite');
  await Promise.all([
    ...ids.map(id => tx.store.delete(id)),
    tx.done
  ]);
};
