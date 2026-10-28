import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { refreshAsync } from 'expo-auth-session';
import { auth } from '@/firebaseConfig';
import { clearGoogleTokens, readGoogleTokens, writeGoogleTokens } from '@/lib/googleTokenStorage';
import { useAuthSession } from './AuthSessionContext';
import {
  getGoogleOAuthClientId,
  GOOGLE_TOKEN_ENDPOINT,
} from './googleOAuthConfig';

export type GoogleConnectionStatus = {
  isConnected: boolean;
  isActive: boolean;
  accessToken: string | null;
  refreshToken: string | null;
};

export type GoogleConnectionState = 'disconnected' | 'connected' | 'needsReconnect';

const isLikelyNetworkError = (err: any) => {
  const msg = String((err && (err.message || err.toString())) || '');
  return (
    msg.includes('Network request failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    (msg.includes('fetch') && msg.includes('TypeError'))
  );
};

const isRefreshTokenInvalid = (err: any) => {
  const msg = String((err && (err.message || err.toString())) || '').toLowerCase();
  return (
    msg.includes('invalid_grant') ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('token has been expired or revoked')
  );
};

const getGoogleConnectionState = ({ isConnected, isActive }: GoogleConnectionStatus): GoogleConnectionState => {
  if (isActive) {
    return 'connected';
  }

  return isConnected ? 'needsReconnect' : 'disconnected';
};

async function validateGoogleAccessToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
    return response.ok;
  } catch (error) {
    if (isLikelyNetworkError(error)) {
      return true;
    }
    return false;
  }
}

async function refreshStoredGoogleAccessToken(
  userId: string,
  refreshToken: string | null
): Promise<string | null> {
  if (!refreshToken) {
    return null;
  }

  try {
    const tokenResult = await refreshAsync(
      {
        clientId: getGoogleOAuthClientId(),
        refreshToken,
      },
      { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT }
    );

    if (!tokenResult?.accessToken) {
      return null;
    }

    if (auth.currentUser?.uid !== userId) {
      return null;
    }

    await writeGoogleTokens(userId, tokenResult.accessToken, refreshToken);
    return tokenResult.accessToken;
  } catch (error) {
    if (isRefreshTokenInvalid(error)) {
      await clearGoogleTokens(userId);
    }
    return null;
  }
}

interface TokenContextType {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (accessToken: string | null, refreshToken: string | null) => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  isLoading: boolean;
  hasTokens: boolean;
  googleConnectionState: GoogleConnectionState;
  isGoogleConnectionLoading: boolean;
  refreshGoogleConnectionStatus: () => Promise<void>;
}

const TokenContext = createContext<TokenContextType | undefined>(undefined);

export const TokenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [googleConnectionState, setGoogleConnectionState] = useState<GoogleConnectionState>('disconnected');
  const [isGoogleConnectionLoading, setIsGoogleConnectionLoading] = useState(true);
  const warnedMissingRefreshRef = useRef(false);
  const googleConnectionRefreshPromiseRef = useRef<{
    userId: string;
    stateVersion: number;
    promise: Promise<void>;
  } | null>(null);
  const googleTokenCleanupPromiseRef = useRef<Promise<void> | null>(null);
  const googleTokenStateVersionRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);

  const applyGoogleConnectionStatus = useCallback((status: GoogleConnectionStatus) => {
    setAccessToken(status.accessToken);
    setRefreshToken(status.refreshToken);
    setGoogleConnectionState(getGoogleConnectionState(status));
  }, []);

  const refreshGoogleConnectionStatus = useCallback(async () => {
    const userId = user?.uid;
    if (!userId) {
      applyGoogleConnectionStatus({
        isConnected: false,
        isActive: false,
        accessToken: null,
        refreshToken: null,
      });
      setIsGoogleConnectionLoading(false);
      setIsLoading(false);
      return;
    }

    const stateVersion = googleTokenStateVersionRef.current;
    if (
      googleConnectionRefreshPromiseRef.current?.userId === userId &&
      googleConnectionRefreshPromiseRef.current.stateVersion === stateVersion
    ) {
      return googleConnectionRefreshPromiseRef.current.promise;
    }

    setIsGoogleConnectionLoading(true);

    const refreshPromise = (async () => {
      try {
        const status = await getGoogleConnectionStatusStatic(userId);
        if (
          activeUserIdRef.current === userId &&
          googleTokenStateVersionRef.current === stateVersion
        ) {
          applyGoogleConnectionStatus(status);
        }
      } catch (error) {
        console.error('Error loading Google connection status:', error);
        if (
          activeUserIdRef.current === userId &&
          googleTokenStateVersionRef.current === stateVersion
        ) {
          setAccessToken(null);
          setRefreshToken(null);
          setGoogleConnectionState('disconnected');
        }
      } finally {
        if (
          activeUserIdRef.current === userId &&
          googleTokenStateVersionRef.current === stateVersion
        ) {
          setIsGoogleConnectionLoading(false);
          setIsLoading(false);
        }
      }
    })();

    googleConnectionRefreshPromiseRef.current = { userId, stateVersion, promise: refreshPromise };

    try {
      await refreshPromise;
    } finally {
      if (googleConnectionRefreshPromiseRef.current?.promise === refreshPromise) {
        googleConnectionRefreshPromiseRef.current = null;
      }
    }
  }, [applyGoogleConnectionStatus, user?.uid]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const previousUserId = activeUserIdRef.current;
    const currentUserId = user?.uid || null;
    if (previousUserId !== currentUserId) {
      googleTokenStateVersionRef.current += 1;
    }
    activeUserIdRef.current = currentUserId;

    if (!user) {
      setIsLoading(true);
      setIsGoogleConnectionLoading(true);

      const previousCleanupPromise = googleTokenCleanupPromiseRef.current;
      const cleanupPromise = (async () => {
        await previousCleanupPromise;
        await clearGoogleTokens(previousUserId);
      })()
        .catch((error) => {
          console.error('Error clearing Google tokens after logout:', error);
        });
      googleTokenCleanupPromiseRef.current = cleanupPromise;

      void cleanupPromise.finally(() => {
          if (googleTokenCleanupPromiseRef.current === cleanupPromise) {
            googleTokenCleanupPromiseRef.current = null;
          }
          if (activeUserIdRef.current !== null) {
            return;
          }

          warnedMissingRefreshRef.current = false;
          setAccessToken(null);
          setRefreshToken(null);
          setGoogleConnectionState('disconnected');
          setIsGoogleConnectionLoading(false);
          setIsLoading(false);
        });

      return;
    }

    setIsLoading(true);
    warnedMissingRefreshRef.current = false;
    const previousCleanupPromise = googleTokenCleanupPromiseRef.current;
    const cleanupPromise = (async () => {
      await previousCleanupPromise;
      if (previousUserId && previousUserId !== currentUserId) {
        await clearGoogleTokens(previousUserId);
      }
    })();
    googleTokenCleanupPromiseRef.current = cleanupPromise;

    void (async () => {
      try {
        await cleanupPromise;
        await refreshGoogleConnectionStatus();
      } finally {
        if (googleTokenCleanupPromiseRef.current === cleanupPromise) {
          googleTokenCleanupPromiseRef.current = null;
        }
      }
    })().catch((error) => {
      console.error('Error switching Google token storage to the active account:', error);
      if (activeUserIdRef.current === currentUserId) {
        setAccessToken(null);
        setRefreshToken(null);
        setGoogleConnectionState('disconnected');
        setIsGoogleConnectionLoading(false);
        setIsLoading(false);
      }
    });
  }, [isAuthLoading, refreshGoogleConnectionStatus, user]);

  const setTokens = useCallback(async (newAccessToken: string | null, newRefreshToken: string | null) => {
    const hasNewTokens = !!(newAccessToken || newRefreshToken);
    try {
      await googleTokenCleanupPromiseRef.current;
      if (hasNewTokens && !user?.uid) {
        throw new Error('Cannot save Google tokens without an authenticated account');
      }

      if (user?.uid) {
        await writeGoogleTokens(user.uid, newAccessToken, newRefreshToken);
      } else {
        await clearGoogleTokens();
      }
    } catch (error) {
      console.error('Error saving tokens:', error);
      if (hasNewTokens) {
        throw error;
      }
    }

    googleTokenStateVersionRef.current += 1;
    setAccessToken(newAccessToken);
    setRefreshToken(newRefreshToken);
    setGoogleConnectionState(
      newAccessToken ? 'connected' : newRefreshToken ? 'needsReconnect' : 'disconnected'
    );
    setIsGoogleConnectionLoading(false);
    setIsLoading(false);
  }, [user?.uid]);

  const refreshAccessToken = useCallback(async () => {
    if (!user) {
      return null;
    }

    if (!refreshToken) {
      if (!accessToken) {
        return null;
      }

      if (!warnedMissingRefreshRef.current) {
        console.warn('Refresh token missing while access token exists - unexpected state');
        warnedMissingRefreshRef.current = true;
      }

      return null;
    }

    const nextAccessToken = await refreshStoredGoogleAccessToken(user.uid, refreshToken);

    if (!nextAccessToken) {
      await refreshGoogleConnectionStatus();
      return null;
    }

    await setTokens(nextAccessToken, refreshToken);
    return nextAccessToken;
  }, [accessToken, refreshGoogleConnectionStatus, refreshToken, setTokens, user]);

  const getAccessToken = useCallback(async () => {
    if (!user) {
      return null;
    }

    if (isLoading) {
      await refreshGoogleConnectionStatus();
    }

    if (!accessToken) {
      return refreshAccessToken();
    }

    try {
      const isValid = await validateGoogleAccessToken(accessToken);
      if (!isValid) {
        return refreshAccessToken();
      }
    } catch (error) {
      console.error('Error checking token validity:', error);
      if (isLikelyNetworkError(error)) {
        return accessToken;
      }

      return refreshAccessToken();
    }

    return accessToken;
  }, [accessToken, isLoading, refreshAccessToken, refreshGoogleConnectionStatus, user]);

  const value = useMemo(
    () => ({
      accessToken,
      refreshToken,
      setTokens,
      getAccessToken,
      isLoading,
      hasTokens: !!(accessToken || refreshToken),
      googleConnectionState,
      isGoogleConnectionLoading,
      refreshGoogleConnectionStatus,
    }),
    [
      accessToken,
      getAccessToken,
      googleConnectionState,
      isGoogleConnectionLoading,
      isLoading,
      refreshGoogleConnectionStatus,
      refreshToken,
      setTokens,
    ]
  );

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
};

export const useTokens = () => {
  const context = useContext(TokenContext);
  if (context === undefined) {
    throw new Error('useTokens must be used within a TokenProvider');
  }
  return context;
};

export async function getGoogleConnectionStatusStatic(
  userId: string | undefined = auth.currentUser?.uid
): Promise<GoogleConnectionStatus> {
  try {
    if (!userId) {
      return {
        isConnected: false,
        isActive: false,
        accessToken: null,
        refreshToken: null,
      };
    }

    const {
      accessToken: storedAccessToken,
      refreshToken: storedRefreshToken,
    } = await readGoogleTokens(userId);
    const hadStoredTokens = !!(storedAccessToken || storedRefreshToken);

    if (storedAccessToken) {
      const isValid = await validateGoogleAccessToken(storedAccessToken);
      if (isValid) {
        return {
          isConnected: true,
          isActive: true,
          accessToken: storedAccessToken,
          refreshToken: storedRefreshToken,
        };
      }

      if (!storedRefreshToken) {
        await writeGoogleTokens(userId, null, null);
        return {
          isConnected: hadStoredTokens,
          isActive: false,
          accessToken: null,
          refreshToken: null,
        };
      }
    }

    const refreshedAccessToken = await refreshStoredGoogleAccessToken(userId, storedRefreshToken);
    if (refreshedAccessToken) {
      return {
        isConnected: true,
        isActive: true,
        accessToken: refreshedAccessToken,
        refreshToken: storedRefreshToken,
      };
    }

    const {
      accessToken: latestAccessToken,
      refreshToken: latestRefreshToken,
    } = await readGoogleTokens(userId);
    return {
      isConnected: hadStoredTokens || !!(latestAccessToken || latestRefreshToken),
      isActive: false,
      accessToken: latestAccessToken,
      refreshToken: latestRefreshToken,
    };
  } catch {
    return {
      isConnected: false,
      isActive: false,
      accessToken: null,
      refreshToken: null,
    };
  }
}

export async function getAccessTokenStatic(): Promise<string | null> {
  try {
    const status = await getGoogleConnectionStatusStatic();
    return status.isActive ? status.accessToken : null;
  } catch {
    return null;
  }
}
