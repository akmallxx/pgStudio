// Service to check latest official pgStudio release from GitHub repository
// Identity payload is obfuscated with runtime XOR cipher & anti-tamper checksums (GNU AGPLv3 Section 7e)

export interface GitHubReleaseInfo {
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  isLatest: boolean;
  hasUpdate: boolean;
  body?: string;
  starsCount?: number;
}

// Runtime decoder for software attribution & repository parameters
function _dec(b64: string, k = 0x5a): string {
  try {
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const chars: string[] = [];
    for (let i = 0; i < bin.length; i++) {
      chars.push(String.fromCharCode(bin.charCodeAt(i) ^ (k + (i % 7))));
    }
    return chars.join('');
  } catch {
    return '';
  }
}

// FNV-1a non-cryptographic fast integrity hasher
function _chk(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// Obfuscated author signatures & legal identifiers
const _t1 = 'OzAxPDIzGCI='; // author
const _t2 = 'Mi8oLS1lT3U8NSk2KgJ0ODMwcT4LNzowMSYnTyo8DykrOwk1'; // repo url
const _t3 = 'Mi8oLS1lT3U8NSk2KgJ0ODMwcT4LNzowMSYn'; // author url
const _t4 = 'HRUJfR85Bj8pM30ZOg4/KT0xfg8VODc1Pn4TCTk+Mi47fxZpe3QcGQ8sd2hybXc='; // license full
const _t5 = 'HRUJfR8YMBYtbw=='; // license short
const _t6 = 'LGpybXBu'; // version

const _rawAuthor = _dec(_t1);
const _rawRepo = _dec(_t2);

// Integrity check against expected hashes
const _isTampered = _chk(_rawAuthor) !== 'cc401a53' || _chk(_rawRepo) !== 'dbe19ce9';

export const isTamperedSignature = _isTampered;
export const APP_AUTHOR = _isTampered ? _dec(_t1) : _rawAuthor;
export const APP_REPO = _isTampered ? _dec(_t2) : _rawRepo;
export const APP_AUTHOR_URL = _dec(_t3);
export const APP_LICENSE = _dec(_t4);
export const APP_LICENSE_SHORT = _dec(_t5);
export const APP_VERSION = _dec(_t6);
export const APP_REPO_NAME = `${APP_AUTHOR}/pgStudio`;

const GITHUB_API_URL = `https://api.github.com/repos/${APP_AUTHOR}/pgStudio/releases/latest`;
const GITHUB_REPO_API = `https://api.github.com/repos/${APP_AUTHOR}/pgStudio`;
const CACHE_KEY = 'pgstudio_latest_release_cache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Print official branding and author identity in browser console DevTools
 */
export function printConsoleBranding() {
  if (typeof window === 'undefined') return;

  if (_isTampered) {
    console.error(
      `%c[AGPLv3 VIOLATION] Original software attribution signature has been modified. ` +
      `Under GNU AGPL-3.0 Section 7(e), you are required to preserve original author attribution (@${APP_AUTHOR}).`,
      'color: #ef4444; font-weight: bold; font-size: 12px;'
    );
  }

  const badgeBadge = `%c pgStudio %c ${APP_VERSION} %c by @${APP_AUTHOR} %c ${APP_LICENSE_SHORT} `;
  const styles = [
    'background: #10b981; color: #022c22; font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 4px 0 0 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;',
    'background: #1e293b; color: #34d399; font-weight: 700; font-size: 11px; padding: 2px 7px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;',
    'background: #0f172a; color: #60a5fa; font-weight: 700; font-size: 11px; padding: 2px 7px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;',
    'background: #047857; color: #ecfdf5; font-weight: 600; font-size: 11px; padding: 2px 7px; border-radius: 0 4px 4px 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;',
  ];

  console.log(badgeBadge, ...styles);
  console.log(
    `%cpgStudio Modern PostgreSQL Client & Database Studio\n` +
    `Author: @${APP_AUTHOR} (${APP_AUTHOR_URL})\n` +
    `Official Repo: ${APP_REPO}\n` +
    `License: ${APP_LICENSE}\n` +
    `To inspect or report issues, visit: ${APP_REPO}/issues`,
    'color: #94a3b8; font-size: 11px; line-height: 1.5; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;'
  );
}

/**
 * Check latest release from GitHub API with fallback and caching
 */
export async function checkLatestRelease(): Promise<GitHubReleaseInfo | null> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          return parsed.data;
        }
      } catch {}
    }

    let starsCount: number | undefined;
    try {
      const repoRes = await fetch(GITHUB_REPO_API, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        starsCount = repoData.stargazers_count;
      }
    } catch {}

    const response = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    let info: GitHubReleaseInfo;

    if (!response.ok) {
      info = {
        tagName: APP_VERSION,
        name: `pgStudio ${APP_VERSION}`,
        htmlUrl: `${APP_REPO}/releases`,
        publishedAt: new Date().toISOString(),
        isLatest: true,
        hasUpdate: false,
        body: `Official Initial Release under GNU AGPLv3 by @${APP_AUTHOR}`,
        starsCount,
      };
    } else {
      const data = await response.json();
      const tagName = data.tag_name || APP_VERSION;
      const hasUpdate = tagName !== APP_VERSION && tagName > APP_VERSION;

      info = {
        tagName,
        name: data.name || tagName,
        htmlUrl: data.html_url || `${APP_REPO}/releases`,
        publishedAt: data.published_at || '',
        isLatest: !hasUpdate,
        hasUpdate,
        body: data.body || '',
        starsCount,
      };
    }

    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data: info,
      })
    );

    return info;
  } catch (err) {
    return {
      tagName: APP_VERSION,
      name: `pgStudio ${APP_VERSION}`,
      htmlUrl: `${APP_REPO}/releases`,
      publishedAt: new Date().toISOString(),
      isLatest: true,
      hasUpdate: false,
      body: 'pgStudio Local Environment',
    };
  }
}
