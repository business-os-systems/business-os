"use client";

import { useCallback, useEffect, useState } from "react";
import { toMessage } from "./error-message";
import {
  fetchActiveSupportSessions,
  type PlatformSupportSession,
} from "./support-session-api";

export type ActiveSupportSessionsState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly sessions: readonly PlatformSupportSession[];
    }
  | { readonly kind: "error"; readonly message: string };

export interface ActiveSupportSessionsResource {
  readonly state: ActiveSupportSessionsState;
  readonly reload: () => Promise<void>;
  readonly remove: (ticketId: string) => void;
}

export interface UseActiveSupportSessionsOptions {
  readonly enabled: boolean;
}

/** One read lifecycle for the shell marker and the tenant support panel. */
export function useActiveSupportSessions({
  enabled,
}: UseActiveSupportSessionsOptions): ActiveSupportSessionsResource {
  const [state, setState] = useState<ActiveSupportSessionsState>({
    kind: "loading",
  });

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const sessions = await fetchActiveSupportSessions(signal);
      if (signal?.aborted !== true) {
        setState({ kind: "ready", sessions });
      }
    } catch (error) {
      if (signal?.aborted !== true) {
        setState({ kind: "error", message: toMessage(error) });
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  const remove = useCallback((ticketId: string): void => {
    setState((previous) => {
      if (previous.kind !== "ready") {
        return previous;
      }
      return {
        kind: "ready",
        sessions: previous.sessions.filter(
          (session) => session.ticketId !== ticketId,
        ),
      };
    });
  }, []);

  return { state, reload: () => load(), remove };
}
