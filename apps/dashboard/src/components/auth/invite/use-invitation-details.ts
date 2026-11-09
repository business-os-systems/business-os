"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  InvitationDetails,
  InvitationLoadResult,
} from "@/lib/invitation-client";
import { loadInvitationSafely } from "./invitation-accept-service";

const MISSING_TOKEN_MESSAGE = "Missing or invalid invitation token.";

export interface InvitationDetailsState {
  isLoadingDetails: boolean;
  details: InvitationDetails | null;
  fetchError: string | null;
  isAlreadyAccepted: boolean;
  markAlreadyAccepted: () => void;
}

interface InvitationLoadOptions {
  token: string;
  onResult: (result: InvitationLoadResult) => void;
  onSettled: () => void;
}

function useInvitationLoad(options: InvitationLoadOptions): void {
  const { token, onResult, onSettled } = options;

  useEffect(() => {
    if (token.length === 0) {
      onResult({ kind: "invalid", message: MISSING_TOKEN_MESSAGE });
      onSettled();
      return;
    }

    let isMounted = true;
    async function load(): Promise<void> {
      const result = await loadInvitationSafely(token);
      if (!isMounted) return;
      onResult(result);
      onSettled();
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [token, onResult, onSettled]);
}

/** Verification state for the invitation token: loading, details, error, already-used. */
export function useInvitationDetails(token: string): InvitationDetailsState {
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAlreadyAccepted, setIsAlreadyAccepted] = useState(false);

  const applyResult = useCallback((result: InvitationLoadResult): void => {
    if (result.kind === "loaded") {
      setDetails(result.details);
      return;
    }
    if (result.kind === "already-accepted") {
      setIsAlreadyAccepted(true);
    }
    setFetchError(result.message);
  }, []);
  const settle = useCallback((): void => {
    setIsLoadingDetails(false);
  }, []);
  const markAlreadyAccepted = useCallback((): void => {
    setIsAlreadyAccepted(true);
  }, []);

  useInvitationLoad({ token, onResult: applyResult, onSettled: settle });

  return {
    isLoadingDetails,
    details,
    fetchError,
    isAlreadyAccepted,
    markAlreadyAccepted,
  };
}
