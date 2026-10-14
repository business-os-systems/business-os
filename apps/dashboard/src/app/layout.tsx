import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Business OS Dashboard",
  description: "Universal Composable Business Operating System Admin Portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-on-surface antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
