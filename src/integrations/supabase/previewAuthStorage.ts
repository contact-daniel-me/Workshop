/**
 * Standard browser localStorage implementation for Supabase Auth session persistence.
 */
export interface PreviewAuthStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

export function brokeredPreviewStorage(): PreviewAuthStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}
