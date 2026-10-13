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

  const fillDemoCredentials = () => {
    setEmail("admin@business-os.com");
    setPassword("password123");
    setError(null);
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/25 mb-2">
          <LayersIcon className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Business OS
        </h1>
        <p className="text-xs text-slate-400">
          Composable Operating System &amp; Modular App Suite
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-950/90 text-white shadow-2xl backdrop-blur-sm">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-white">
              Sign In to Workspace
            </CardTitle>
            <Badge variant="secondary" className="bg-slate-800 text-slate-300 text-[10px]">
              Enterprise SSO
            </Badge>
          </div>
          <p className="text-xs text-slate-400">
            Enter your employee credentials to access your installed apps.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-200 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-300"
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
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 text-sm h-10"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-300"
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
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 text-sm h-10"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium h-10 text-sm mt-2 transition-colors"
            >
              {isLoading ? "Authenticating..." : "Sign In to Workspace"}
            </Button>

            <div className="pt-2 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-medium underline underline-offset-4 cursor-pointer"
              >
                Auto-fill demo credentials
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 text-center">
        <LockIcon className="w-3 h-3" />
        <span>TLS Encrypted &bull; Tenant Kernel Isolated &bull; Zero-Trust Gate</span>
      </div>
    </div>
  );
}
