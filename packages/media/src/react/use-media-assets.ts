import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MediaAssetView } from "../contracts.js";
import type { MediaClient, MediaListQuery } from "./media-client.js";

export interface MediaAssetsState {
  readonly assets: readonly MediaAssetView[];
  readonly nextCursor: string | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly hasMore: boolean;
  readonly reload: () => Promise<void>;
  readonly loadMore: () => Promise<void>;
}

interface MediaAssetsSnapshot {
  readonly assets: readonly MediaAssetView[];
  readonly nextCursor: string | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

const INITIAL_SNAPSHOT: MediaAssetsSnapshot = {
  assets: [],
  nextCursor: null,
  isLoading: true,
  error: null,
};

export function toMediaError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function appendUnique(
  existing: readonly MediaAssetView[],
  incoming: readonly MediaAssetView[]
): MediaAssetView[] {
  const knownIds = new Set(existing.map((asset) => asset.id));
  return [...existing, ...incoming.filter((asset) => !knownIds.has(asset.id))];
}

async function readPage(
  client: MediaClient,
  query: MediaListQuery,
  cursor: string | null
): Promise<{ items: MediaAssetView[]; nextCursor: string | null }> {
  const page = await client.listAssets(
    cursor === null ? query : { ...query, cursor }
  );
  return { items: page.items, nextCursor: page.nextCursor };
}

function useAssetLoaders(
  client: MediaClient,
  query: MediaListQuery,
  snapshot: MediaAssetsSnapshot,
  setSnapshot: Dispatch<SetStateAction<MediaAssetsSnapshot>>
) {
  const requestToken = useRef(0);

  const replace = useCallback(async () => {
    const token = requestToken.current + 1;
    requestToken.current = token;
    setSnapshot((previous) => ({ ...previous, isLoading: true, error: null }));
    try {
      const page = await readPage(client, query, null);
      if (requestToken.current !== token) return;
      setSnapshot({
        assets: page.items,
        nextCursor: page.nextCursor,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      if (requestToken.current !== token) return;
      setSnapshot((previous) => ({
        ...previous,
        isLoading: false,
        error: toMediaError(error),
      }));
    }
  }, [client, query, setSnapshot]);

  const loadMore = useCallback(async () => {
    const cursor = snapshot.nextCursor;
    if (cursor === null || snapshot.isLoading) return;
    const token = requestToken.current + 1;
    requestToken.current = token;
    setSnapshot((previous) => ({ ...previous, isLoading: true, error: null }));
    try {
      const page = await readPage(client, query, cursor);
      if (requestToken.current !== token) return;
      setSnapshot((previous) => ({
        assets: appendUnique(previous.assets, page.items),
        nextCursor: page.nextCursor,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      if (requestToken.current !== token) return;
      setSnapshot((previous) => ({
        ...previous,
        isLoading: false,
        error: toMediaError(error),
      }));
    }
  }, [client, query, snapshot.nextCursor, snapshot.isLoading, setSnapshot]);

  return { replace, loadMore };
}

/**
 * One list engine for the workspace library and every application picker.
 * A stale response from a previous filter can never overwrite a newer one.
 */
export function useMediaAssets(
  client: MediaClient,
  query: MediaListQuery
): MediaAssetsState {
  const [snapshot, setSnapshot] = useState<MediaAssetsSnapshot>(INITIAL_SNAPSHOT);
  const { replace, loadMore } = useAssetLoaders(
    client,
    query,
    snapshot,
    setSnapshot
  );

  useEffect(() => {
    void replace();
  }, [replace]);

  return {
    assets: snapshot.assets,
    nextCursor: snapshot.nextCursor,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    hasMore: snapshot.nextCursor !== null,
    reload: replace,
    loadMore,
  };
}
