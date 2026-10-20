"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Input, Label, Spinner } from "@suite/ui";
import { EyeIcon, EyeOffIcon, AlertTriangleIcon, CheckIcon } from "@suite/ui/icons";
import { AuthCard } from "@/components/auth/auth-card";

interface InvitationDetails {
  isValid: boolean;
  token: string;
  email: string;
  name: string | null;
  organizationName: string;
  roleName: string;
  branchName: string;
  hasPassword: boolean;
  expiresAt: string;
}

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";

  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isAlreadyAccepted, setIsAlreadyAccepted] = useState(false);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  useEffect(() => {
    if (!token) {
      setIsLoadingDetails(false);
      setFetchError("Missing or invalid invitation token.");
      return;
    }

    let isMounted = true;
    async function loadInvitation() {
      try {
        const res = await fetch(`/api/v1/auth/invitation/accept?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => null);

        if (!isMounted) return;

        if (!res.ok) {
          if (data?.code === "INVITATION_ACCEPTED") {
            setIsAlreadyAccepted(true);
          }
          setFetchError(data?.detail || "This invitation link is invalid or has expired.");
          setIsLoadingDetails(false);
          return;
        }

        setDetails(data);
        if (data.name) {
          setName(data.name);
        }
        setIsLoadingDetails(false);
      } catch {
        if (isMounted) {
          setFetchError("Unable to verify invitation details. Please check your connection.");
          setIsLoadingDetails(false);
        }
      }
    }

    loadInvitation();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage("Missing invitation token.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter a password.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 12 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/v1/auth/invitation/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            password,
            name: name.trim() || undefined,
          }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          if (data?.code === "INVITATION_ACCEPTED") {
            setIsAlreadyAccepted(true);
          }
          setErrorMessage(data?.detail || "Failed to accept workspace invitation.");
          return;
        }

        // Successfully created credentials and enrolled session
        router.push(data.redirectUrl || "/dashboard");
        router.refresh();
      } catch {
        setErrorMessage("A network error occurred. Please try again.");
      }
    });
  };

  // 1. Loading State
  if (isLoadingDetails) {
    return (
      <AuthCard
        size="xl"
        title="Workspace Invitation"
        subtitle="Verifying invitation details..."
      >
        <div className="py-10 flex flex-col items-center justify-center gap-3">
          <Spinner size="lg" color="action" />
          <p className="text-xs text-text-secondary">Loading invitation...</p>
        </div>
      </AuthCard>
    );
  }

  // 2. Already Accepted State
  if (isAlreadyAccepted) {
    return (
      <AuthCard
        size="xl"
        title="Invitation Already Accepted"
        subtitle="Your membership in this workspace has already been activated."
        footer={
          <p className="text-center text-xs text-text-muted">
            Need help? Contact your workspace administrator or{" "}
            <Link href="/login" className="font-semibold text-action hover:underline">
              Sign In
            </Link>
          </p>
        }
      >
        <div className="space-y-4 py-2">
          <div className="p-3.5 bg-brand-tint border border-brand/30 text-text rounded-xl text-xs flex items-start gap-3">
            <CheckIcon size={20} className="shrink-0 text-brand mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-text">Account Ready</p>
              <p className="text-text-secondary leading-relaxed">
                This invitation link has already been used. You can log into your workspace directly using your email and password.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={() => router.push(details?.email ? `/login?email=${encodeURIComponent(details.email)}` : "/login")}
          >
            Go to Sign In →
          </Button>
        </div>
      </AuthCard>
    );
  }

  // 3. Fetch / Verification Error State
  if (fetchError || !details) {
    return (
      <AuthCard
        size="xl"
        title="Invitation Notice"
        subtitle="There was an issue with this invitation link."
        footer={
          <p className="text-center text-xs text-text-muted">
            <Link href="/login" className="font-semibold text-action hover:underline">
              Return to Sign In
            </Link>
          </p>
        }
      >
        <div className="p-3.5 bg-danger/10 border border-danger/30 text-danger rounded-xl text-xs flex items-start gap-2.5">
          <AlertTriangleIcon size={18} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">Unable to Join Workspace</p>
            <p className="text-text-secondary">{fetchError || "Invitation is invalid or has expired."}</p>
          </div>
        </div>
      </AuthCard>
    );
  }

  // 4. Standard Wide-Rectangle Form State (Zero Screen-Edge Touching)
  return (
    <AuthCard
      size="xl"
      title={`Join ${details.organizationName}`}
      subtitle={`You have been invited to join as ${details.roleName}`}
      footer={
        <p className="text-center text-xs text-text-muted">
          Already set up your credentials?{" "}
          <Link href="/login" className="font-semibold text-action hover:underline">
            Sign in directly
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {errorMessage && (
          <div className="p-2.5 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {/* Horizontal Workspace Context Strip (4 columns across) */}
        <div className="p-3 bg-surface-muted border border-border rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-semibold text-text-muted tracking-wider block">
              Workspace
            </span>
            <span className="font-semibold text-text truncate block">{details.organizationName}</span>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-semibold text-text-muted tracking-wider block">
              Role
            </span>
            <span className="font-medium text-text truncate block">{details.roleName}</span>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-semibold text-text-muted tracking-wider block">
              Branch Scope
            </span>
            <span className="font-medium text-text truncate block">{details.branchName || "All Branches"}</span>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-semibold text-text-muted tracking-wider block">
              Invited Email
            </span>
            <span className="font-mono text-[11px] text-text font-medium truncate block">
              {details.email}
            </span>
          </div>
        </div>

        {/* Full Name */}
        <div className="space-y-1">
          <Label size="sm" htmlFor="invitee-name">
            Full Name
          </Label>
          <Input
            id="invitee-name"
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            fullWidth
          />
        </div>

        {/* 2-Column Responsive Password Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <Label size="sm" htmlFor="invitee-password" required>
              Create Password
            </Label>
            <Input
              id="invitee-password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 12 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              fullWidth
              endIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="text-text-muted hover:text-text transition-colors p-0.5"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              }
            />
          </div>

          <div className="space-y-1">
            <Label size="sm" htmlFor="invitee-confirm-password" required>
              Confirm Password
            </Label>
            <Input
              id="invitee-confirm-password"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
              fullWidth
              endIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="text-text-muted hover:text-text transition-colors p-0.5"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              }
            />
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          isLoading={isSubmitting}
          disabled={isSubmitting}
          className="mt-1"
        >
          {isSubmitting ? "Joining workspace..." : "Set Password & Join Workspace →"}
        </Button>
      </form>
    </AuthCard>
  );
}
