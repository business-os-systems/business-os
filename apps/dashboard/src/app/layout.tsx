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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Accepted static theme-script exception (P17): this inline script runs before
          hydration to prevent a light/dark flash, and its body is a fixed literal with
          no interpolated request or user data. It must not be replaced by a dynamic
          value; if a Content-Security-Policy is introduced, give this script a nonce
          instead of loosening script-src.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem("business-os-theme");
                if (t === "dark" || t === "light") {
                  document.documentElement.setAttribute("data-theme", t);
                } else {
                  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen min-h-dvh bg-background text-text antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
