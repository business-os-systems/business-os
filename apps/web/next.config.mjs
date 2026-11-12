/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@suite/auth", "@suite/core"],
  // isomorphic-dompurify loads jsdom for server-side sanitising; bundling it
  // breaks jsdom's own asset resolution (browser/default-stylesheet.css) and
  // makes every storefront page 500 in the production server build. Keep both
  // packages external so Node resolves them from node_modules at runtime.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // FR-042: one tenant's response is never served for another host.
          { key: "Vary", value: "Host" },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
