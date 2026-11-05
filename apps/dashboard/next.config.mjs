import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
  experimental: {
    optimizePackageImports: ["lucide-react", "@suite/ui"],
    serverActions: {
      allowedOrigins: [
        "localhost:3001",
        "app.rohitbahuguna.online",
        "*.rohitbahuguna.online",
        ...(process.env.DOMAIN_ROOT
          ? [`app.${process.env.DOMAIN_ROOT}`, `*.${process.env.DOMAIN_ROOT}`]
          : []),
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.rohitbahuguna.online",
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Lint is a dedicated CI gate with the eslint-suppressions.json ratchet;
  // Next's build-time lint cannot read that baseline, so it would fail on
  // legacy findings that the ratchet already tracks.
  eslint: {
    ignoreDuringBuilds: true,
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
    } else {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        async_hooks: false,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
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

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
