"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import type { AuthCredentialsData } from "@/components/auth/shared/credentials";
import { LoginCardFooter } from "@/components/auth/login/login-card-footer";
import { LoginFormBody } from "@/components/auth/login/login-form-body";
import { mapLoginNotice } from "@/components/auth/login/login-notice";
import { useLoginSubmit } from "@/components/auth/login/use-login-submit";

export { sanitizeRedirect } from "@/components/auth/login/login-redirect";

function LoginFormContent() {
  const searchParams = useSearchParams();
  const [initialMessage] = useState(() => mapLoginNotice(searchParams));
  const login = useLoginSubmit(initialMessage);

  const handleSubmit = (credentials: AuthCredentialsData): void => {
    void login.submit(credentials);
  };

  return (
    <AuthCard title="Sign In to Workspace" footer={<LoginCardFooter />}>
      <LoginFormBody
        errorMessage={login.errorMessage}
        isLoading={login.isLoading}
        onClearError={login.clearError}
        onSubmit={handleSubmit}
      />
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginFormContent />
    </Suspense>
  );
}