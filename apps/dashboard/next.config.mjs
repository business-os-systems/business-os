/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@suite/website-builder", "@suite/ui", "@suite/auth"],
  serverExternalPackages: ["@node-rs/argon2", "@node-rs/argon2-linux-x64-gnu"],
  experimental: {
    optimizePackageImports: ["lucide-react", "@suite/ui"],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("@node-rs/argon2", "@node-rs/argon2-linux-x64-gnu");
    }
    return config;
  },
  async rewrites() {
    const apiUrl = process.env.API_URL;
    if (!apiUrl) {
      return [];
    }
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/api/v1/:path*",
          destination: `${apiUrl}/api/v1/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
