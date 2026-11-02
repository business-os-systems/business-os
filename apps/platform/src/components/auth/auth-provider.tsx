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
} from "@/lib/api";
import type { PlatformSession } from "@/lib/auth-types";

interface AuthContextValue {
  readonly session: PlatformSession | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<PlatformSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          platformSessionViewSchema
        )
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load the session"
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await platformFetch(PLATFORM_API_PATHS.logout, { method: "POST" });
    setSession(null);
    router.replace("/sign-in");
  }, [router]);

  const value = useMemo(
    () => ({ session, loading, error, refresh, signOut }),
    [session, loading, error, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePlatformAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new InternalServerError("usePlatformAuth must be used inside AuthProvider");
  }
  return value;
}
