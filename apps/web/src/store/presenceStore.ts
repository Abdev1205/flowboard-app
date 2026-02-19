/**
 * store/presenceStore.ts
 *
 * Zustand store for all connected user presence state.
 * Kept separate from boardStore to avoid re-rendering board on every
 * cursor/editing-status update.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { UserPresence } from '@/types';

export interface PresenceState {
  /** All currently connected users, keyed by userId (= socketId) */
  users: Record<string, UserPresence>;

  /** This client's own presence entry (null until server sends BOARD_SNAPSHOT) */
  myUserId: string | null;
}

export interface PresenceActions {
  setMyUserId:     (id: string) => void;
  loadUsers:       (users: UserPresence[]) => void;
  updatePresence:  (user: UserPresence) => void;
  removeUser:      (userId: string) => void;
  getUser:         (userId: string) => UserPresence | undefined;
  getActiveUsers:  () => UserPresence[];
}

export const usePresenceStore = create<PresenceState & PresenceActions>()(
  immer((set, get) => ({
    users:      {},
    myUserId:   null,

    setMyUserId: (id) =>
      set((s) => { s.myUserId = id; }),

    loadUsers: (users) =>
      set((s) => {
        s.users = {};
        for (const u of users) s.users[u.userId] = u;
      }),

    updatePresence: (user) =>
      set((s) => { s.users[user.userId] = user; }),

    removeUser: (userId) =>
      set((s) => { delete s.users[userId]; }),

    getUser:        (userId) => get().users[userId],
    getActiveUsers: ()       => Object.values(get().users),
  })),
);
