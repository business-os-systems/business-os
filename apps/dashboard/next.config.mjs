/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@suite/website-builder", "@suite/ui", "@suite/auth"],
  serverExternalPackages: ["@node-rs/argon2", "@node-rs/argon2-linux-x64-gnu"],
  typescript: {
    ignoreBuildErrors: false,
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
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
