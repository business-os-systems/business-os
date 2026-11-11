import type { Metadata } from "next";
import "@suite/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Website",
  description: "Published website",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-text antialiased">{children}</body>
    </html>
  );
}
