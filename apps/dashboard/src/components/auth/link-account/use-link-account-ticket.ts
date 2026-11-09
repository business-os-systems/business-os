"use client";

import { useEffect, useState } from "react";
import {
  loadLinkAccountTicket,
  type LinkAccountTicketDetails,
} from "./link-account-service";

export interface LinkAccountTicketState {
  ticket: string;
  ticketDetails: LinkAccountTicketDetails | null;
  ticketError: string | null;
}

/** Loads the collision-challenge ticket details behind a cancellable effect. */
export function useLinkAccountTicket(ticket: string): LinkAccountTicketState {
  const [ticketDetails, setTicketDetails] =
    useState<LinkAccountTicketDetails | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);

  useEffect(() => {
    if (ticket.length === 0) return;

    let isActive = true;
    async function load(): Promise<void> {
      const outcome = await loadLinkAccountTicket(ticket);
      if (!isActive) return;
      if (outcome.kind === "loaded") {
        setTicketDetails(outcome.ticket);
      } else if (outcome.kind === "invalid") {
        setTicketError(outcome.message);
      }
    }

    void load();
    return () => {
      isActive = false;
    };
  }, [ticket]);

  return { ticket, ticketDetails, ticketError };
}
