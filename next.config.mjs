const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isGitHubPages = Boolean(process.env.GITHUB_ACTIONS) && Boolean(repoName);
const isProjectPage = isGitHubPages && repoName && !repoName.endsWith('.github.io');

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/, '') ?? '';
const basePath = configuredBasePath || (isProjectPage ? `/${repoName}` : '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: basePath || undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
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
