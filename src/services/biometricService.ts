/**
 * Biometric Authentication Service.
 *
 * Security Invariants:
 * 1. The BIP-39 mnemonic phrase is stored strictly inside the device's
 *    hardware-backed secure storage (Android KeyStore / iOS Keychain).
 * 2. Biometric prompts (BiometricPrompt) guard access to retrieving the phrase.
 * 3. Once retrieved to unlock the vault, memory is handled through VaultKeyManager
 *    and wiped with zeroes (`fill(0)`) after key derivation.
 * 4. Disabling biometrics immediately deletes the stored credentials from KeyStore.
 */

import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const BIOMETRIC_SERVER_ID = 'com.ownnotes.app';
const BIOMETRIC_USERNAME = 'vault_owner';
const BIOMETRIC_STORAGE_KEY = 'ownnotes_biometric_enabled';

export interface BiometricAvailability {
  isAvailable: boolean;
  biometryType?: string;
  reason?: string;
}

class BiometricService {
  /**
   * Checks whether biometric hardware is present, enrolled, and supported on this platform.
   */
  public async isAvailable(): Promise<BiometricAvailability> {
    if (!Capacitor.isNativePlatform()) {
      return { isAvailable: false, reason: 'Biometrics only supported on native mobile devices' };
    }

    try {
      const result = await NativeBiometric.isAvailable();
      return {
        isAvailable: Boolean(result.isAvailable),
        biometryType: result.biometryType != null ? String(result.biometryType) : undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isAvailable: false, reason: msg };
    }
  }

  /**
   * Checks whether the user has previously enabled biometric unlock for this vault.
   */
  public async isEnabled(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    return localStorage.getItem(BIOMETRIC_STORAGE_KEY) === 'true';
  }

  /**
   * Enables biometric unlock by verifying identity and securely storing the
   * mnemonic phrase in the hardware-backed keystore.
   */
  public async enableBiometrics(phrase: string): Promise<{ success: boolean; error?: string }> {
    if (!Capacitor.isNativePlatform()) {
      return { success: false, error: 'Disponível apenas em dispositivos móveis.' };
    }

    try {
      // 1. Verify user identity via BiometricPrompt before storing
      await NativeBiometric.verifyIdentity({
        reason: 'Confirme sua impressão digital para ativar o desbloqueio por biometria',
        title: 'Ativar Biometria',
        subtitle: 'OwnNotes Zero-Knowledge Vault',
        description: 'Toque no sensor biométrico para habilitar.',
      });

      // 2. Persist phrase in Android KeyStore / iOS Keychain
      await NativeBiometric.setCredentials({
        server: BIOMETRIC_SERVER_ID,
        username: BIOMETRIC_USERNAME,
        password: phrase.trim(),
      });

      localStorage.setItem(BIOMETRIC_STORAGE_KEY, 'true');
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Disables biometric unlock and purges the stored credentials from hardware KeyStore.
   */
  public async disableBiometrics(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await NativeBiometric.deleteCredentials({
          server: BIOMETRIC_SERVER_ID,
        });
      }
    } catch (err) {
      console.warn('Could not purge biometric credentials from KeyStore:', err);
    } finally {
      localStorage.removeItem(BIOMETRIC_STORAGE_KEY);
    }
  }

  /**
   * Prompts the user for biometric verification and retrieves the stored phrase.
   */
  public async unlockWithBiometrics(): Promise<{ success: boolean; phrase?: string; error?: string }> {
    if (!Capacitor.isNativePlatform()) {
      return { success: false, error: 'Disponível apenas em dispositivos móveis.' };
    }

    try {
      // 1. Request biometric verification from user
      await NativeBiometric.verifyIdentity({
        reason: 'Desbloquear cofre com sua impressão digital',
        title: 'Desbloquear OwnNotes',
        subtitle: 'Autenticação Biométrica',
        description: 'Toque no sensor de impressão digital para continuar.',
      });

      // 2. Retrieve credentials from secure KeyStore
      const credentials = await NativeBiometric.getCredentials({
        server: BIOMETRIC_SERVER_ID,
      });

      if (!credentials || !credentials.password) {
        return { success: false, error: 'Chave biométrica não encontrada no dispositivo.' };
      }

      return { success: true, phrase: credentials.password };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}

export const biometricService = new BiometricService();
