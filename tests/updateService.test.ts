import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseSemver,
  isNewerVersion,
  checkForUpdates,
  getStoredGitHubToken,
  setStoredGitHubToken,
  APP_VERSION,
} from '../src/services/updateService.js';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => store.set(key, String(value))),
  removeItem: vi.fn((key: string) => store.delete(key)),
  clear: vi.fn(() => store.clear()),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Update Service & Semver Logic', () => {
  it('parses semver versions correctly', () => {
    expect(parseSemver('0.5.6')).toEqual([0, 5, 6]);
    expect(parseSemver('v0.5.6')).toEqual([0, 5, 6]);
    expect(parseSemver('v1.2.3-beta.1')).toEqual([1, 2, 3]);
    expect(parseSemver('10.20.30')).toEqual([10, 20, 30]);
    expect(parseSemver('')).toEqual([0, 0, 0]);
  });

  it('correctly compares newer and older versions', () => {
    // Newer patch
    expect(isNewerVersion('0.5.7', '0.5.6')).toBe(true);
    // Same version
    expect(isNewerVersion('0.5.6', '0.5.6')).toBe(false);
    // Older patch
    expect(isNewerVersion('0.5.5', '0.5.6')).toBe(false);
    // Newer minor
    expect(isNewerVersion('0.6.0', '0.5.6')).toBe(true);
    // Older minor
    expect(isNewerVersion('0.4.9', '0.5.6')).toBe(false);
    // Newer major
    expect(isNewerVersion('1.0.0', '0.5.6')).toBe(true);
    // Older major
    expect(isNewerVersion('0.5.6', '1.0.0')).toBe(false);
  });

  it('stores and retrieves GitHub token from localStorage', () => {
    setStoredGitHubToken('ghp_testtoken123');
    expect(getStoredGitHubToken()).toBe('ghp_testtoken123');

    setStoredGitHubToken('');
    expect(getStoredGitHubToken()).toBe('');
  });

  describe('checkForUpdates API integration', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('detects a newer version when GitHub returns a newer release', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v0.9.9',
          html_url: 'https://github.com/celson/OwnNotes/releases/tag/v0.9.9',
          body: 'Bug fixes and performance improvements',
          published_at: '2026-09-18T20:00:00Z',
        }),
      });

      const res = await checkForUpdates();
      expect(res.hasUpdate).toBe(true);
      expect(res.currentVersion).toBe(APP_VERSION);
      expect(res.latestVersion).toBe('0.9.9');
      expect(res.releaseUrl).toBe('https://github.com/celson/OwnNotes/releases/tag/v0.9.9');
    });

    it('reports up-to-date when current version matches remote', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: `v${APP_VERSION}`,
          html_url: `https://github.com/celson/OwnNotes/releases/tag/v${APP_VERSION}`,
          body: 'Latest version notes',
          published_at: '2026-09-18T20:00:00Z',
        }),
      });

      const res = await checkForUpdates();
      expect(res.hasUpdate).toBe(false);
      expect(res.latestVersion).toBe(APP_VERSION);
    });

    it('handles 404 response safely with clear explanation', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const res = await checkForUpdates();
      expect(res.hasUpdate).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('handles network error safely without throwing', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

      const res = await checkForUpdates();
      expect(res.hasUpdate).toBe(false);
      expect(res.error).toContain('Network disconnected');
    });
  });
});
