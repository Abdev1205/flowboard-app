import { useState, useEffect } from 'react';

// Helper for relative time
export function getRelativeTime(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

/**
 * Hook to return a relative time string that updates automatically.
 * @param dateStr ISO date string
 * @param refreshMs Refresh interval (default 60s)
 */
export function useRelativeTime(dateStr: string, refreshMs = 60000) {
  const [timeString, setTimeString] = useState(() => getRelativeTime(dateStr));

  useEffect(() => {
    // Initial set in case dateStr changed
    setTimeString(getRelativeTime(dateStr));

    const interval = setInterval(() => {
      setTimeString(getRelativeTime(dateStr));
    }, refreshMs);

    return () => clearInterval(interval);
  }, [dateStr, refreshMs]);

  return timeString;
}
