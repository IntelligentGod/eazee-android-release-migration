import { useCallback, useEffect, useRef, useState } from 'react';

export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * A cursor-paged list from the Eazee server: the first page loads when `key`
 * changes (e.g. a new search or filter), `loadMore` appends the next one. Pages
 * from an older key are dropped.
 */
export function usePagedServerData<T>(loadPage: (cursor: string | null) => Promise<Page<T>>, key: string) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const generation = useRef(0);
  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  const fetchPage = useCallback((cursor: string | null) => {
    const current = generation.current;
    setIsLoading(true);
    setError(null);
    loadPageRef.current(cursor)
      .then((page) => {
        if (current !== generation.current) return;
        setItems((previous) => (cursor ? [...previous, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      })
      .catch((reason) => {
        if (current === generation.current) setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (current === generation.current) setIsLoading(false);
      });
  }, []);

  // A new key or a reload starts over from the first page.
  useEffect(() => {
    generation.current += 1;
    setItems([]);
    setNextCursor(null);
    fetchPage(null);
  }, [fetchPage, key, nonce]);

  return {
    items,
    error,
    isLoading,
    hasMore: !!nextCursor,
    loadMore: () => {
      if (nextCursor && !isLoading) fetchPage(nextCursor);
    },
    reload: () => setNonce((value) => value + 1),
  };
}
