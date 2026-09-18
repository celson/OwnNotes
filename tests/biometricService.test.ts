import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { biometricService } from '../src/services/biometricService.js';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock('@capgo/capacitor-native-biometric', () => ({
  NativeBiometric: {
    isAvailable: vi.fn(),
    verifyIdentity: vi.fn(),
    setCredentials: vi.fn(),
    getCredentials: vi.fn(),
    deleteCredentials: vi.fn(),
  },
}));

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

describe('BiometricService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Non-native (Web / Desktop)', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it('returns isAvailable: false on non-native platform', async () => {
      const res = await biometricService.isAvailable();
      expect(res.isAvailable).toBe(false);
      expect(res.reason).toContain('native mobile');
    });

    it('returns isEnabled: false on non-native platform', async () => {
      localStorage.setItem('ownnotes_biometric_enabled', 'true');
      const enabled = await biometricService.isEnabled();
      expect(enabled).toBe(false);
    });

    it('fails enableBiometrics on non-native platform', async () => {
      const res = await biometricService.enableBiometrics('abandon abandon ...');
      expect(res.success).toBe(false);
      expect(res.error).toContain('apenas em dispositivos móveis');
    });

    it('fails unlockWithBiometrics on non-native platform', async () => {
      const res = await biometricService.unlockWithBiometrics();
      expect(res.success).toBe(false);
      expect(res.error).toContain('apenas em dispositivos móveis');
    });

    it('handles disableBiometrics gracefully on non-native platform', async () => {
      localStorage.setItem('ownnotes_biometric_enabled', 'true');
      await biometricService.disableBiometrics();
      expect(localStorage.getItem('ownnotes_biometric_enabled')).toBeNull();
    });
  });

  describe('Native Platform (Android / iOS)', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    });

    it('returns availability and biometry type when native hardware is present', async () => {
      vi.mocked(NativeBiometric.isAvailable).mockResolvedValue({
        isAvailable: true,
        biometryType: 1 as unknown as never,
        authenticationStrength: 15 as unknown as never,
        deviceIsSecure: true,
        strongBiometryIsAvailable: true,
      });

      const res = await biometricService.isAvailable();
      expect(res.isAvailable).toBe(true);
      expect(NativeBiometric.isAvailable).toHaveBeenCalled();
    });

    it('handles native isAvailable error gracefully', async () => {
      vi.mocked(NativeBiometric.isAvailable).mockRejectedValue(new Error('Hardware missing'));

      const res = await biometricService.isAvailable();
      expect(res.isAvailable).toBe(false);
      expect(res.reason).toBe('Hardware missing');
    });

    it('enables biometrics by verifying identity and storing phrase in Keystore', async () => {
      vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(undefined as unknown as never);
      vi.mocked(NativeBiometric.setCredentials).mockResolvedValue(undefined as unknown as never);

      const phrase = 'test phrase twelve words recovery key';
      const res = await biometricService.enableBiometrics(phrase);

      expect(res.success).toBe(true);
      expect(NativeBiometric.verifyIdentity).toHaveBeenCalled();
      expect(NativeBiometric.setCredentials).toHaveBeenCalledWith({
        server: 'com.ownnotes.app',
        username: 'vault_owner',
        password: phrase,
      });
      expect(localStorage.getItem('ownnotes_biometric_enabled')).toBe('true');
    });

    it('returns error if user cancels or fails identity verification', async () => {
      vi.mocked(NativeBiometric.verifyIdentity).mockRejectedValue(new Error('User canceled'));

      const res = await biometricService.enableBiometrics('test phrase');
      expect(res.success).toBe(false);
      expect(res.error).toBe('User canceled');
      expect(NativeBiometric.setCredentials).not.toHaveBeenCalled();
      expect(localStorage.getItem('ownnotes_biometric_enabled')).toBeNull();
    });

    it('disables biometrics and purges Keystore credentials', async () => {
      localStorage.setItem('ownnotes_biometric_enabled', 'true');
      vi.mocked(NativeBiometric.deleteCredentials).mockResolvedValue(undefined as unknown as never);

      await biometricService.disableBiometrics();

      expect(NativeBiometric.deleteCredentials).toHaveBeenCalledWith({
        server: 'com.ownnotes.app',
      });
      expect(localStorage.getItem('ownnotes_biometric_enabled')).toBeNull();
    });

    it('unlocks with biometrics and returns stored phrase from Keystore', async () => {
      vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(undefined as unknown as never);
      vi.mocked(NativeBiometric.getCredentials).mockResolvedValue({
        username: 'vault_owner',
        password: 'my-restored-phrase-twelve-words',
      });

      const res = await biometricService.unlockWithBiometrics();

      expect(res.success).toBe(true);
      expect(res.phrase).toBe('my-restored-phrase-twelve-words');
    });

    it('returns error if no credentials stored in Keystore', async () => {
      vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(undefined as unknown as never);
      vi.mocked(NativeBiometric.getCredentials).mockResolvedValue({
        username: '',
        password: '',
      });

      const res = await biometricService.unlockWithBiometrics();

      expect(res.success).toBe(false);
      expect(res.error).toContain('não encontrada');
    });
  });
});
