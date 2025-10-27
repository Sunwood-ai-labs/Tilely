/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb'
    }
  }
};

export default nextConfig;
