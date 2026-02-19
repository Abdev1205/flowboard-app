/**
 * components/presence/PresenceBar.tsx
 *
 * Top-right avatar strip showing all connected users.
 * Collapses to "+N more" when there are more than 5 users.
 * Also shows an online/offline indicator dot.
 */
import { usePresenceStore } from '@/store/presenceStore';
import { useBoardStore }    from '@/store/boardStore';
import { UserAvatar }       from './UserAvatar';
import { Wifi, WifiOff }    from 'lucide-react';

const MAX_VISIBLE = 5;

export function PresenceBar() {
  const usersDict = usePresenceStore((s) => s.users);
  const users     = Object.values(usersDict);
  const isConnected = useBoardStore((s) => s.isConnected);

  const visible  = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - MAX_VISIBLE;

  return (
    <div className="flex items-center gap-3">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        {isConnected ? (
          <Wifi size={14} className="text-[var(--color-success)]" />
        ) : (
          <WifiOff size={14} className="text-[var(--color-danger)]" />
        )}
        <span
          className={`text-xs font-medium ${
            isConnected
              ? 'text-[var(--color-success)]'
              : 'text-[var(--color-danger)]'
          }`}
        >
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>

      {/* Divider */}
      {users.length > 0 && (
        <div className="w-px h-4 bg-[var(--color-border)]" />
      )}

      {/* Avatar stack */}
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <UserAvatar key={user.userId} user={user} size="sm" />
        ))}

        {overflow > 0 && (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold
                       bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]
                       ring-2 ring-[var(--color-bg-primary)]"
            title={`${overflow} more user${overflow > 1 ? 's' : ''}`}
          >
            +{overflow}
          </div>
        )}
      </div>

      {/* User count */}
      {users.length > 0 && (
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {users.length} online
        </span>
      )}
    </div>
  );
}
