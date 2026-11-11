"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { readProblemMessage } from "@/lib/problem-details";
import { inquiryDetailSchema, type InquiryDetail } from "./inquiries.contract";

export type InquiryDetailState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly inquiry: InquiryDetail };

type DetailSetter = Dispatch<SetStateAction<InquiryDetailState>>;

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readInquiryFromBody(body: unknown): InquiryDetail {
  const parsed = inquiryDetailSchema.safeParse(
    typeof body === "object" && body !== null && "inquiry" in body ? body.inquiry : null
  );
  if (!parsed.success) {
    throw new Error("The inquiry response did not match the expected contract.");
  }
  return parsed.data;
}

async function readDetail(inquiryId: string, revealPii: boolean): Promise<InquiryDetail> {
  const url = "/api/cms/inquiries/" + encodeURIComponent(inquiryId) +
    (revealPii ? "?revealPii=true" : "");
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      readProblemMessage(body) ?? "Reading the inquiry failed with status " + response.status + "."
    );
  }
  return readInquiryFromBody(body);
}

interface InquiryMutation {
  readonly inquiryId: string;
  readonly method: "PATCH" | "DELETE";
  readonly body?: unknown;
}

async function mutateInquiry(input: InquiryMutation): Promise<void> {
  const response = await fetch("/api/cms/inquiries/" + encodeURIComponent(input.inquiryId), {
    method: input.method,
    headers: { "content-type": "application/json", accept: "application/json" },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
  if (response.ok) {
    return;
  }
  const problem: unknown = await response.json().catch(() => null);
  throw new Error(
    readProblemMessage(problem) ?? "The inquiry update failed with status " + response.status + "."
  );
}

function useInquiryRecord(inquiryId: string | null) {
  const [state, setState] = useState<InquiryDetailState>({ kind: "idle" });

  useEffect(() => {
    if (inquiryId === null) {
      setState({ kind: "idle" });
      return;
    }
    let isActive = true;
    setState({ kind: "loading" });
    readDetail(inquiryId, false)
      .then((inquiry) => {
        if (isActive) {
          setState({ kind: "ready", inquiry });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setState({ kind: "error", message: toMessage(error) });
        }
      });
    return () => {
      isActive = false;
    };
  }, [inquiryId]);

  return { state, setState };
}

function useInquiryActions(input: {
  readonly inquiryId: string | null;
  readonly setState: DetailSetter;
  readonly onChanged: () => void;
  readonly onErased: () => void;
}) {
  const { inquiryId, setState, onChanged, onErased } = input;
  const [isRevealing, setIsRevealing] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isErasing, setIsErasing] = useState(false);

  const reveal = useCallback(async () => {
    if (inquiryId === null) {
      return;
    }
    setIsRevealing(true);
    try {
      setState({ kind: "ready", inquiry: await readDetail(inquiryId, true) });
    } catch (error: unknown) {
      setState({ kind: "error", message: toMessage(error) });
    } finally {
      setIsRevealing(false);
    }
  }, [inquiryId, setState]);

  const changeStatus = useCallback(
    async (status: "READ" | "ARCHIVED" | "SPAM") => {
      if (inquiryId === null) {
        return;
      }
      setIsChangingStatus(true);
      try {
        await mutateInquiry({ inquiryId, method: "PATCH", body: { status } });
        setState({ kind: "ready", inquiry: await readDetail(inquiryId, false) });
        onChanged();
      } catch (error: unknown) {
        setState({ kind: "error", message: toMessage(error) });
      } finally {
        setIsChangingStatus(false);
      }
    },
    [inquiryId, onChanged, setState]
  );

  const erase = useCallback(async () => {
    if (inquiryId === null) {
      return;
    }
    setIsErasing(true);
    try {
      await mutateInquiry({ inquiryId, method: "DELETE" });
      onErased();
    } catch (error: unknown) {
      setState({ kind: "error", message: toMessage(error) });
    } finally {
      setIsErasing(false);
    }
  }, [inquiryId, onErased, setState]);

  return { isRevealing, isChangingStatus, isErasing, reveal, changeStatus, erase };
}

export interface InquiryDetailController {
  readonly state: InquiryDetailState;
  readonly isRevealing: boolean;
  readonly isChangingStatus: boolean;
  readonly isErasing: boolean;
  readonly reveal: () => Promise<void>;
  readonly changeStatus: (status: "READ" | "ARCHIVED" | "SPAM") => Promise<void>;
  readonly erase: () => Promise<void>;
}

export function useInquiryDetail(input: {
  readonly inquiryId: string | null;
  readonly onChanged: () => void;
  readonly onErased: () => void;
}): InquiryDetailController {
  const record = useInquiryRecord(input.inquiryId);
  const actions = useInquiryActions({
    inquiryId: input.inquiryId,
    setState: record.setState,
    onChanged: input.onChanged,
    onErased: input.onErased,
  });
  return { state: record.state, ...actions };
}
