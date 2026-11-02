import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { PlatformShell } from "@/components/layout/platform-shell";

export default function PlatformLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <AuthProvider>
      <PlatformShell>{children}</PlatformShell>
    </AuthProvider>
  );
}
