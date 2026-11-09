"use client";

import React, { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import {
  LinkAccountChallengeFooter,
  LinkAccountLoadingCard,
  LinkAccountMissingCard,
} from "@/components/auth/link-account/link-account-cards";
import { LinkAccountForm } from "@/components/auth/link-account/link-account-form";
import {
  formatCollisionBadge,
  formatProviderName,
} from "@/components/auth/link-account/provider-name";
import { useLinkAccount } from "@/components/auth/link-account/use-link-account";

function LinkAccountChallenge() {
  const controller = useLinkAccount();

  if (controller.ticket.length === 0) {
    return <LinkAccountMissingCard />;
  }

  const providerName = formatProviderName(controller.ticketDetails?.providerId);
  const subtitle =
    "An account with this email already exists. Enter your existing password to link your " +
    providerName +
    " account.";

  return (
    <AuthCard
      title="Link your account"
      subtitle={subtitle}
      badge={formatCollisionBadge(controller.ticketDetails?.providerId)}
      footer={<LinkAccountChallengeFooter />}
    >
      <LinkAccountForm controller={controller} />
    </AuthCard>
  );
}

export default function LinkAccountPage() {
  return (
    <Suspense fallback={<LinkAccountLoadingCard />}>
      <LinkAccountChallenge />
    </Suspense>
  );
}