import { useCallback, useEffect, useState } from 'react';

export type ServerData<T> = {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  reload: () => void;
};

/**
 * Loads data from the Eazee server for a screen, again whenever `key` changes
 * or `reload` is called. A response that arrives after the screen moved on (a
 * newer key, or unmount) is dropped.
 */
export function useServerData<T>(load: () => Promise<T>, key: string): ServerData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  // Fetching on mount and on change has to happen in an effect; nothing else triggers it.
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setError(null);
    load()
      .then((next) => {
        if (isCurrent) setData(next);
      })
      .catch((reason) => {
        if (isCurrent) setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
    // `load` is recreated every render; `key` says when it asks for something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { data, error, isLoading, reload };
}
