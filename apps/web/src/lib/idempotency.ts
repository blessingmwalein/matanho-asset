'use client';

import { useRef } from 'react';

/**
 * Safe-retry key for a single logical submission (UAT NFR-004).
 * The same key is re-sent if the user retries after an interrupted request or double-click,
 * and the API replays the first result instead of executing twice. Call `reset()` after a
 * successful submit so the next submission gets a fresh key.
 */
export function useIdempotencyKey() {
  const ref = useRef<string | null>(null);
  return {
    get(): string {
      if (!ref.current) ref.current = crypto.randomUUID();
      return ref.current;
    },
    reset() {
      ref.current = null;
    },
  };
}
