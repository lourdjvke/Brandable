import { getMutations, clearMutations } from './db';
import { rtdb } from './firebase';
import { ref, update } from 'firebase/database';

export const syncQueue = async () => {
  const mutations = await getMutations();
  if (mutations.length === 0) return;

  const successfulIds: number[] = [];

  for (const mutation of mutations) {
    try {
      if (mutation.type === 'updateFile') {
         const { id, updates } = mutation.payload;
         await update(ref(rtdb, `files/${id}`), { ...updates, updatedAt: Date.now() });
         successfulIds.push(mutation.id);
      }
      // Add other mutation types as needed
    } catch (err) {
      console.error('Failed to sync mutation:', mutation, err);
      // Stop or continue? Continue allows other mutations to try.
    }
  }

  if (successfulIds.length > 0) {
    await clearMutations(successfulIds);
  }
};
