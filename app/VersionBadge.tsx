'use client';

const commitSha = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ?? 'dev';
const commitUrl = `https://github.com/trobichaux/onioncraft/commit/${commitSha}`;

export default function VersionBadge() {
  return (
    <a
      href={commitUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="version-badge"
      aria-label={`Version: commit ${commitSha}`}
    >
      {commitSha}
    </a>
  );
}
