"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge } from "@suite/ui";
import { LayersIcon, LockIcon } from "@suite/ui/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? data.detail ?? "Authentication failed");
      }

      // Successful login -> Redirect to Workspace App Launcher
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setIsLoading(false);
    }
  };


  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-brand-tint text-brand shadow-sm mb-2">
          <LayersIcon className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-text">
          Business OS
        </h1>
        <p className="text-xs text-text-muted">
          Composable Operating System &amp; Modular App Suite
        </p>
      </div>

      <Card className="border-border bg-surface text-text shadow-xl">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-text">
              Sign In to Workspace
            </CardTitle>
            <Badge variant="secondary" className="bg-surface-muted text-text-secondary text-[10px]">
              Enterprise SSO
            </Badge>
          </div>
          <p className="text-xs text-text-muted">
            Enter your employee credentials to access your installed apps.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium text-text"
              >
                Work Email
              </label>
              <Input
                id="email"
                type="email"
                required
                placeholder="operator@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-text"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={isLoading}
              className="w-full font-medium h-10 text-sm mt-2 transition-colors"
            >
              {isLoading ? "Authenticating..." : "Sign In to Workspace"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted text-center">
        <LockIcon className="w-3 h-3" />
        <span>TLS Encrypted &bull; Tenant Kernel Isolated &bull; Zero-Trust Gate</span>
      </div>
    </div>
  );
}
