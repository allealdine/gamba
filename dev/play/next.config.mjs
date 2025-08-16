/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: [
    'tone',
    'gamba-react-ui-v2',
    'gamba-react-v2',
    'gamba-core-v2',
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }

    // Handle ESM modules
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.mjs': ['.mjs', '.js', '.ts', '.tsx'],
    };

    // Handle tone.js ESM module specifically
    config.module.rules.push({
      test: /node_modules\/tone/,
      type: 'javascript/auto',
    });

    return config;
  },
};

export default nextConfig;
