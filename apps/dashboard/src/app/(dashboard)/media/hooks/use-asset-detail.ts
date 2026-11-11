"use client";

import { useEffect, useState } from "react";
import {
  toMediaError,
  type MediaAssetDetail,
  type MediaClient,
} from "@suite/media/react";

export type AssetDetailState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly error: Error }
  | { readonly kind: "ready"; readonly detail: MediaAssetDetail };

const IDLE_DETAIL_STATE: AssetDetailState = { kind: "idle" };

export function useAssetDetail(
  client: MediaClient,
  assetId: string | null,
  canRead: boolean
): AssetDetailState {
  const [state, setState] = useState<AssetDetailState>(IDLE_DETAIL_STATE);

  useEffect(() => {
    if (assetId === null || !canRead) {
      setState(IDLE_DETAIL_STATE);
      return;
    }
    let active = true;
    setState({ kind: "loading" });
    void client
      .getAsset(assetId)
      .then((detail) => {
        if (active) setState({ kind: "ready", detail });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "error", error: toMediaError(error) });
      });
    return () => {
      active = false;
    };
  }, [assetId, canRead, client]);

  return state;
}
