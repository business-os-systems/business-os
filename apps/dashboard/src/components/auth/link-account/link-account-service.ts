import { z } from "zod";
import { firstNonEmpty } from "@/components/auth/shared/first-non-empty";
import { readProblemMessage } from "@/components/auth/shared/problem-details";
import { readJsonBody } from "@/components/auth/shared/read-json-body";

/**
 * Typed boundary for the account-collision challenge. The page previously
 * chained .then/.catch and read untyped JSON fields (P3/P10/P12).
 */

const LINK_ACCOUNT_ENDPOINT = "/api/auth/link-account";
const INVALID_TICKET_MESSAGE =
  "This account linking challenge is invalid or has expired. Please sign in again.";
const SUBMIT_FAILURE_MESSAGE =
  "Failed to link account. Please check your password.";
const NETWORK_FAILURE_MESSAGE = "Failed to link account.";
const DEFAULT_REDIRECT = "/dashboard";

const ticketSchema = z.object({
  valid: z.boolean(),
  email: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

const successSchema = z.object({
  redirectUrl: z.string().min(1).optional(),
});

export interface LinkAccountTicketDetails {
  email: string | null;
  providerId: string | null;
  name: string | null;
}

export type LinkAccountTicketOutcome =
  | { readonly kind: "loaded"; readonly ticket: LinkAccountTicketDetails }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "ignored" };

export type LinkAccountSubmitOutcome =
  | { readonly kind: "linked"; readonly redirectUrl: string }
  | { readonly kind: "failed"; readonly message: string };

export async function loadLinkAccountTicket(
  ticket: string
): Promise<LinkAccountTicketOutcome> {
  try {
    const response = await fetch(
      LINK_ACCOUNT_ENDPOINT + "?ticket=" + encodeURIComponent(ticket)
    );
    const body = await readJsonBody(response);

    if (!response.ok) {
      return { kind: "invalid", message: INVALID_TICKET_MESSAGE };
    }
    const parsed = ticketSchema.safeParse(body);
    if (!parsed.success) {
      return { kind: "invalid", message: INVALID_TICKET_MESSAGE };
    }
    if (!parsed.data.valid) {
      return { kind: "ignored" };
    }
    return {
      kind: "loaded",
      ticket: {
        email: parsed.data.email ?? null,
        providerId: parsed.data.providerId ?? null,
        name: parsed.data.name ?? null,
      },
    };
  } catch {
    return { kind: "invalid", message: INVALID_TICKET_MESSAGE };
  }
}

export function mapLinkAccountResponse(
  response: Pick<Response, "ok" | "status">,
  body: unknown
): LinkAccountSubmitOutcome {
  if (!response.ok) {
    return {
      kind: "failed",
      message: readProblemMessage(body) ?? SUBMIT_FAILURE_MESSAGE,
    };
  }

  const parsed = successSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: "failed", message: SUBMIT_FAILURE_MESSAGE };
  }
  return {
    kind: "linked",
    redirectUrl:
      firstNonEmpty(parsed.data.redirectUrl ?? null, DEFAULT_REDIRECT) ??
      DEFAULT_REDIRECT,
  };
}

export interface LinkAccountCredentials {
  ticket: string;
  password: string;
}

export async function submitLinkAccount(
  credentials: LinkAccountCredentials
): Promise<LinkAccountSubmitOutcome> {
  try {
    const response = await fetch(LINK_ACCOUNT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket: credentials.ticket,
        password: credentials.password,
      }),
    });
    const body = await readJsonBody(response);
    return mapLinkAccountResponse(response, body);
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof Error ? error.message : NETWORK_FAILURE_MESSAGE,
    };
  }
}
