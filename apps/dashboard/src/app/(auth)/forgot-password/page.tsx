"use client";

import React from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordCardFooter } from "@/components/auth/forgot-password/forgot-password-card-footer";
import { ForgotPasswordFormBody } from "@/components/auth/forgot-password/forgot-password-form-body";
import { useForgotPassword } from "@/components/auth/forgot-password/use-forgot-password";

export default function ForgotPasswordPage() {
  const controller = useForgotPassword();

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email address to reset your password."
      footer={<ForgotPasswordCardFooter />}
    >
      <ForgotPasswordFormBody controller={controller} />
    </AuthCard>
  );
}
