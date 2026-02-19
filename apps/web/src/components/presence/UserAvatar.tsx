/**
 * components/presence/UserAvatar.tsx
 *
 * Small circular avatar showing a user's initials and presence colour.
 * Used in PresenceBar.
 */
import type { UserPresence } from '@/types';

interface UserAvatarProps {
  user:  UserPresence;
  size?: 'sm' | 'md';
}

function initials(displayName: string): string {
  return displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function UserAvatar({ user, size = 'md' }: UserAvatarProps) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-xs';

  return (
    <div
      title={user.displayName}
      className={`
        ${dim} rounded-full flex items-center justify-center font-semibold
        text-white ring-2 ring-[var(--color-bg-primary)] select-none flex-shrink-0
        transition-transform hover:scale-110
      `}
      style={{ backgroundColor: user.color }}
    >
      {initials(user.displayName)}
    </div>
  );
}
