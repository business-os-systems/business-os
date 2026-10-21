import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  transpilePackages: [
    "@suite/website-builder",
    "@suite/ui",
    "@suite/auth",
    "@suite/core",
    "@suite/db",
    "@suite/logger",
    "@suite/redis",
  ],
  serverExternalPackages: [
    "@node-rs/argon2",
    "@node-rs/argon2-linux-x64-gnu",
    "@prisma/client",
    "ioredis",
    "bullmq",
  ],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "../../node_modules/.pnpm/@node-rs+argon2*/**/*",
      "../../node_modules/.pnpm/@prisma+client*/**/*",
      "../../node_modules/.pnpm/ioredis*/**/*",
      "../../node_modules/.pnpm/bullmq*/**/*",
    ],
  },
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
      config.externals.push(
        "@node-rs/argon2",
        "@node-rs/argon2-linux-x64-gnu",
        "@prisma/client",
        "ioredis",
        "bullmq",
      );
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
