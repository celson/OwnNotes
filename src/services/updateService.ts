/**
 * Update Service: In-App Version Checking via GitHub Releases API.
 */

export const APP_VERSION = '0.5.8';

const GITHUB_REPO = 'celson/OwnNotes';
const GITHUB_TOKEN_STORAGE_KEY = 'ownnotes_github_token';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  error?: string;
}

/**
 * Parses semantic version string (e.g., "v0.5.6", "0.5.6-beta" -> [0, 5, 6]).
 */
export function parseSemver(v: string): [number, number, number] {
  const clean = v.replace(/^v/, '').trim();
  const mainPart = clean.split('-')[0] || '0.0.0';
  const parts = mainPart.split('.').map((p) => parseInt(p, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Returns true if remoteVersion is strictly newer than currentVersion.
 */
export function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  const [rMaj, rMin, rPat] = parseSemver(remoteVersion);
  const [cMaj, cMin, cPat] = parseSemver(currentVersion);

  if (rMaj !== cMaj) return rMaj > cMaj;
  if (rMin !== cMin) return rMin > cMin;
  return rPat > cPat;
}

export function getStoredGitHubToken(): string {
  try {
    return localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredGitHubToken(token: string): void {
  try {
    if (token.trim()) {
      localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, token.trim());
    } else {
      localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Checks GitHub Releases API for the latest release.
 */
export async function checkForUpdates(customToken?: string): Promise<UpdateInfo> {
  const token = customToken !== undefined ? customToken.trim() : getStoredGitHubToken();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      method: 'GET',
      headers,
    });

    if (res.status === 404) {
      return {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: null,
        releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
        releaseNotes: null,
        publishedAt: null,
        error: token
          ? 'Nenhuma release encontrada ou token sem permissão de leitura.'
          : 'Repositório privado ou nenhuma release pública encontrada. Você pode configurar um token do GitHub nas configurações para checar repositórios privados.',
      };
    }

    if (!res.ok) {
      return {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: null,
        releaseUrl: null,
        releaseNotes: null,
        publishedAt: null,
        error: `Erro ao consultar GitHub API (${res.status} ${res.statusText}).`,
      };
    }

    const data = await res.json();
    const latestVersion = (data.tag_name || '').replace(/^v/, '');
    const hasUpdate = isNewerVersion(latestVersion, APP_VERSION);

    return {
      hasUpdate,
      currentVersion: APP_VERSION,
      latestVersion,
      releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/v${latestVersion}`,
      releaseNotes: data.body || null,
      publishedAt: data.published_at || null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      hasUpdate: false,
      currentVersion: APP_VERSION,
      latestVersion: null,
      releaseUrl: null,
      releaseNotes: null,
      publishedAt: null,
      error: `Não foi possível verificar no momento (${msg}).`,
    };
  }
}
