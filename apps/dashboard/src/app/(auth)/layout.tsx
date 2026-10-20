import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen min-h-dvh w-full flex items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}
