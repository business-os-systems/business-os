"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { InternalServerError } from "@suite/core/errors";
import { platformSessionViewSchema } from "@suite/core";
import {
  PLATFORM_API_PATHS,
  platformFetch,
  readProblem,
  readSuccessData,
  setUnauthorizedHandler,
} from "@/lib/api";
import { requestPlatformSignOut } from "@/lib/logout";
import type { PlatformSession } from "@/lib/auth-types";

interface AuthContextValue {
  readonly session: PlatformSession | null;
  readonly loading: boolean;
  readonly error: string | null;
  /** True when the last sign-out was rejected by the API. */
  readonly signOutFailed: boolean;
  readonly refresh: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** Clears local state only; the server session may still be live. */
  readonly forceSignOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<PlatformSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signOutFailed, setSignOutFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await platformFetch(PLATFORM_API_PATHS.me);
      if (response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok) {
        setError(await readProblem(response));
        return;
      }
      setSession(
        await readSuccessData<PlatformSession>(
          response,
          platformSessionViewSchema,
        ),
      );
      setSignOutFailed(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load the session",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Any screen whose request is refused sends the operator back to sign-in.
  // The ignored request keeps its own error banner until the route changes.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSession(null);
      setSignOutFailed(false);
      setError(null);
      router.replace("/sign-in");
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [router]);

  const signOut = useCallback(async () => {
    const outcome = await requestPlatformSignOut();
    if (!outcome.ok) {
      setSignOutFailed(true);
      setError(outcome.message);
      return;
    }
    setSignOutFailed(false);
    setSession(null);
    router.replace("/sign-in");
  }, [router]);

  const forceSignOut = useCallback(() => {
    setSignOutFailed(false);
    setError(null);
    setSession(null);
    router.replace("/sign-in");
  }, [router]);

  const value = useMemo(
    () => ({
      session,
      loading,
      error,
      signOutFailed,
      refresh,
      signOut,
      forceSignOut,
    }),
    [session, loading, error, signOutFailed, refresh, signOut, forceSignOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePlatformAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new InternalServerError(
      "usePlatformAuth must be used inside AuthProvider",
    );
  }
  return value;
}
