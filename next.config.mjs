const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repositoryName = "star-citizen-crafting";
const basePath = isGitHubPages ? `/${repositoryName}` : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  output: "export",
  trailingSlash: true,

  basePath,
  assetPrefix: basePath,

  images: {
    unoptimized: true
  }
};

export default nextConfig;
