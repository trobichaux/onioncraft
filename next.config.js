/** @type {import('next').NextConfig} */

const { execSync } = require('child_process');

function getGitCommitSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXT_PUBLIC_GIT_COMMIT_SHA: getGitCommitSha(),
  },
};

module.exports = nextConfig;
