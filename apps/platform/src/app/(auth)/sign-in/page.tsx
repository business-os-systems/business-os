"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, ThemeToggle } from "@suite/ui";
import { LayersIcon } from "@suite/ui/icons";
import {
  platformBootstrapOptionsSchema,
  platformSignInOptionsSchema,
  type PlatformBootstrapOptions,
  type PlatformSignInOptions,
} from "@suite/core";
import {
  parseCreationOptions,
  parseRequestOptions,
} from "@/lib/webauthn-options";
import {
  PLATFORM_API_PATHS,
  platformFetch,
  readProblem,
  readSuccessData,
} from "@/lib/api";

function SignInContent() {
  const router = useRouter();
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setBootstrapToken(params.get("bootstrap"));
  }, []);

  if (supported === false) {
    return (
      <Alert
        variant="error"
        title="Passkeys are not supported"
        message="Use a browser and device that supports passkeys to sign in."
      />
    );
  }

  if (supported === null) {
    return null;
  }

  async function verify(path: string, body: Record<string, unknown>) {
    const response = await platformFetch(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setError(await readProblem(response));
      return;
    }
    window.history.replaceState({}, "", "/");
    router.replace("/");
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const optionsResponse = await platformFetch(
        PLATFORM_API_PATHS.signInOptions,
        { method: "POST" }
      );
      if (!optionsResponse.ok) {
        setError(await readProblem(optionsResponse));
        return;
      }
      const { flowId, options } = await readSuccessData<PlatformSignInOptions>(
        optionsResponse,
        platformSignInOptionsSchema
      );
      const assertion = await startAuthentication({
        optionsJSON: parseRequestOptions(options),
      });
      await verify(PLATFORM_API_PATHS.signInVerify, {
        flowId,
        response: assertion,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!bootstrapToken) return;
    setBusy(true);
    setError(null);
    try {
      const optionsResponse = await platformFetch(
        PLATFORM_API_PATHS.bootstrapOptions,
        {
          method: "POST",
          body: JSON.stringify({ token: bootstrapToken }),
        }
      );
      if (!optionsResponse.ok) {
        setError(await readProblem(optionsResponse));
        return;
      }
      const { flowId, options } = await readSuccessData<PlatformBootstrapOptions>(
        optionsResponse,
        platformBootstrapOptionsSchema
      );
      const credential = await startRegistration({
        optionsJSON: parseCreationOptions(options),
      });
      await verify(PLATFORM_API_PATHS.bootstrapVerify, {
        token: bootstrapToken,
        flowId,
        response: credential,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-tint text-brand shadow-2xs">
              <LayersIcon className="h-4 w-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-tight text-text">
                Business OS
              </span>
              <span className="text-[10px] font-medium text-text-muted">
                Platform Control
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <div>
          <CardTitle className="text-xl">
            {bootstrapToken ? "Create the first operator passkey" : "Operator sign-in"}
          </CardTitle>
          <p className="mt-1 text-sm text-text-secondary">
            {bootstrapToken
              ? "This link can be used once. Register a passkey to activate the first operator."
              : "Use the passkey registered for your operator account."}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert variant="error" title="Unable to continue" message={error} /> : null}
        <Button
          fullWidth
          size="lg"
          isLoading={busy}
          onClick={() => void (bootstrapToken ? register() : signIn())}
        >
          {bootstrapToken ? "Register passkey" : "Sign in with passkey"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={null}>
        <SignInContent />
      </Suspense>
    </main>
  );
}
