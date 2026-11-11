import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { CmsApiError, type CmsProblem } from "@/lib/api/cms-http";
import {
  getReview,
  markReviewPageOpened,
  openReview,
  publishReview,
  type PublishResult,
  type ReviewDto,
  type ReviewPageDto,
  type ReviewResult,
} from "@/lib/api/review-client";
import type { ReviewDeviceId, ReviewViewMode } from "./review.config";

export interface ReviewState {
  readonly result: ReviewResult | null;
  readonly review: ReviewDto | null;
  readonly selectedPage: ReviewPageDto | null;
  readonly selectedPageId: string | null;
  readonly isLoading: boolean;
  readonly isPublishing: boolean;
  readonly problem: CmsProblem | null;
  readonly errorMessage: string | null;
  readonly published: PublishResult | null;
  readonly viewMode: ReviewViewMode;
  readonly device: ReviewDeviceId;
  readonly changeNote: string;
  readonly selectPage: (pageId: string) => void;
  readonly setViewMode: (mode: ReviewViewMode) => void;
  readonly setDevice: (device: ReviewDeviceId) => void;
  readonly setChangeNote: (note: string) => void;
  readonly publish: () => Promise<void>;
}

type SetResult = Dispatch<SetStateAction<ReviewResult | null>>;

interface LoadState {
  readonly result: ReviewResult | null;
  readonly selectedPageId: string | null;
  readonly isLoading: boolean;
  readonly problem: CmsProblem | null;
  readonly errorMessage: string | null;
  readonly setResult: SetResult;
  readonly setSelectedPageId: Dispatch<SetStateAction<string | null>>;
  readonly setProblem: Dispatch<SetStateAction<CmsProblem | null>>;
  readonly setErrorMessage: Dispatch<SetStateAction<string | null>>;
}

function problemFrom(error: unknown): CmsProblem | null {
  return error instanceof CmsApiError ? error.problem : null;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultPageId(review: ReviewDto): string | null {
  const changed = review.pages.find((page) => page.changed);
  return changed?.pageId ?? review.pages[0]?.pageId ?? null;
}

function useReviewLoad(siteId: string): LoadState {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [problem, setProblem] = useState<CmsProblem | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    openReview(siteId)
      .then((loaded) => {
        if (cancelled) return;
        setResult(loaded);
        setSelectedPageId(defaultPageId(loaded.review));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProblem(problemFrom(error));
        setErrorMessage(messageFrom(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return {
    result,
    selectedPageId,
    isLoading,
    problem,
    errorMessage,
    setResult,
    setSelectedPageId,
    setProblem,
    setErrorMessage,
  };
}

function useSelectPage(input: {
  readonly siteId: string;
  readonly reviewId: string | null;
  readonly setResult: SetResult;
  readonly setSelectedPageId: Dispatch<SetStateAction<string | null>>;
  readonly setProblem: Dispatch<SetStateAction<CmsProblem | null>>;
  readonly setErrorMessage: Dispatch<SetStateAction<string | null>>;
}): (pageId: string) => void {
  const { siteId, reviewId, setResult, setSelectedPageId, setProblem, setErrorMessage } = input;
  return useCallback(
    (pageId: string) => {
      setSelectedPageId(pageId);
      if (reviewId === null) return;
      void markReviewPageOpened(siteId, reviewId, pageId)
        .then((opened) => {
          if (!opened.reviewed) return;
          setResult((current) => {
            if (current === null) return current;
            const pages = current.review.pages.map((page) =>
              page.pageId === pageId ? { ...page, reviewed: true } : page
            );
            return { ...current, review: { ...current.review, pages } };
          });
        })
        .catch((error: unknown) => {
          setProblem(problemFrom(error));
          setErrorMessage(messageFrom(error));
        });
    },
    [reviewId, setErrorMessage, setProblem, setResult, setSelectedPageId, siteId]
  );
}

interface PublishState {
  readonly isPublishing: boolean;
  readonly published: PublishResult | null;
  readonly publish: () => Promise<void>;
}

function usePublishAction(input: {
  readonly siteId: string;
  readonly reviewId: string | null;
  readonly changeNote: string;
  readonly setResult: SetResult;
  readonly setProblem: Dispatch<SetStateAction<CmsProblem | null>>;
  readonly setErrorMessage: Dispatch<SetStateAction<string | null>>;
}): PublishState {
  const [isPublishing, setIsPublishing] = useState(false);
  const [published, setPublished] = useState<PublishResult | null>(null);
  const idempotencyKey = useRef(globalThis.crypto.randomUUID());

  const publish = useCallback(async () => {
    if (input.reviewId === null || isPublishing) return;
    setIsPublishing(true);
    input.setProblem(null);
    input.setErrorMessage(null);
    try {
      const release = await publishReview(
        input.siteId,
        {
          reviewId: input.reviewId,
          ...(input.changeNote.trim().length === 0 ? {} : { changeNote: input.changeNote.trim() }),
        },
        idempotencyKey.current
      );
      idempotencyKey.current = globalThis.crypto.randomUUID();
      setPublished(release);
      input.setResult(await getReview(input.siteId, input.reviewId));
    } catch (error: unknown) {
      input.setProblem(problemFrom(error));
      input.setErrorMessage(messageFrom(error));
    } finally {
      setIsPublishing(false);
    }
  }, [input, isPublishing]);

  return { isPublishing, published, publish };
}

export function useReview(siteId: string): ReviewState {
  const loaded = useReviewLoad(siteId);
  const [viewMode, setViewMode] = useState<ReviewViewMode>("pending");
  const [device, setDevice] = useState<ReviewDeviceId>("desktop");
  const [changeNote, setChangeNote] = useState("");
  const review = loaded.result?.review ?? null;
  const selectPage = useSelectPage({
    siteId,
    reviewId: review?.reviewId ?? null,
    setResult: loaded.setResult,
    setSelectedPageId: loaded.setSelectedPageId,
    setProblem: loaded.setProblem,
    setErrorMessage: loaded.setErrorMessage,
  });
  const publishing = usePublishAction({
    siteId,
    reviewId: review?.reviewId ?? null,
    changeNote,
    setResult: loaded.setResult,
    setProblem: loaded.setProblem,
    setErrorMessage: loaded.setErrorMessage,
  });
  const selectedPage = review?.pages.find((page) => page.pageId === loaded.selectedPageId) ?? null;

  return {
    result: loaded.result,
    review,
    selectedPage,
    selectedPageId: loaded.selectedPageId,
    isLoading: loaded.isLoading,
    isPublishing: publishing.isPublishing,
    problem: loaded.problem,
    errorMessage: loaded.errorMessage,
    published: publishing.published,
    viewMode,
    device,
    changeNote,
    selectPage,
    setViewMode,
    setDevice,
    setChangeNote,
    publish: publishing.publish,
  };
}
