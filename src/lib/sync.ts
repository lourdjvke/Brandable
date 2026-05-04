import { getMutations, clearMutations } from './db';
import { rtdb } from './firebase';
import { ref, update, set, remove } from 'firebase/database';

export const syncQueue = async () => {
  const mutations = await getMutations();
  if (mutations.length === 0) return;

  const successfulIds: number[] = [];

  for (const mutation of mutations) {
    try {
      if (mutation.type === 'updateFile') {
         const { id, updates } = mutation.payload;
         await update(ref(rtdb, `files/${id}`), { ...updates, updatedAt: Date.now() });
      } else if (mutation.type === 'createFile') {
         const { id, item } = mutation.payload;
         await set(ref(rtdb, `files/${id}`), { ...item, updatedAt: Date.now() });
      } else if (mutation.type === 'deleteFile') {
         const { id } = mutation.payload;
         await remove(ref(rtdb, `files/${id}`));
      }
      successfulIds.push(mutation.id);
    } catch (err) {
      console.error('Failed to sync mutation:', mutation, err);
    }
  }

  if (successfulIds.length > 0) {
    await clearMutations(successfulIds);
  }
};
