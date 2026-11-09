"use client";

import React from "react";
import { InvitationAlreadyAcceptedCard } from "./invitation-already-accepted-card";
import { InvitationErrorCard } from "./invitation-error-card";
import { InvitationFormCard } from "./invitation-form-card";
import { InvitationLoadingCard } from "./invitation-loading-card";
import { useInvitationAccept } from "./use-invitation-accept";

/**
 * Route-level orchestrator for the invitation accept page: one hook, one
 * exhaustive view switch, four leaf cards (P1/P2/P7).
 */
export function InvitationAcceptView() {
  const controller = useInvitationAccept();
  const view = controller.view;

  switch (view.kind) {
    case "loading":
      return <InvitationLoadingCard />;
    case "already-accepted":
      return <InvitationAlreadyAcceptedCard email={view.email} />;
    case "error":
      return <InvitationErrorCard message={view.message} />;
    case "form":
      return (
        <InvitationFormCard details={view.details} controller={controller} />
      );
  }
}
