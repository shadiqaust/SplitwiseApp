import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIO_TOKEN_KEY = "sw_bio_token";
const BIO_USER_KEY = "sw_bio_user";
const BIO_ENABLED_KEY = "sw_bio_enabled";

export type BiometricKind = "face" | "fingerprint" | "iris" | "generic";

export interface BiometricCapability {
  available: boolean;
  enrolled: boolean;
  kinds: BiometricKind[];
  label: string;
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (Platform.OS === "web") {
    return { available: false, enrolled: false, kinds: [], label: "Biometrics" };
  }
  const [hasHardware, isEnrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const kinds: BiometricKind[] = types
    .map((t): BiometricKind | null => {
      switch (t) {
        case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
          return "face";
        case LocalAuthentication.AuthenticationType.FINGERPRINT:
          return "fingerprint";
        case LocalAuthentication.AuthenticationType.IRIS:
          return "iris";
        default:
          return null;
      }
    })
    .filter((k): k is BiometricKind => k !== null);

  // Friendly label, prefering Face ID/Touch ID terminology on iOS.
  let label = "Biometrics";
  if (kinds.includes("face")) {
    label = Platform.OS === "ios" ? "Face ID" : "Face Unlock";
  } else if (kinds.includes("fingerprint")) {
    label = Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
  } else if (kinds.includes("iris")) {
    label = "Iris";
  }
  return { available: hasHardware, enrolled: isEnrolled, kinds, label };
}

export async function promptBiometricAuth(reason: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
    fallbackLabel: "Use device passcode",
    // Reject weak Android biometrics (face unlock on devices without Class 3
    // hardware) for credential unlock — only Class 3 / Strong sensors are
    // acceptable for releasing a session token.
    biometricsSecurityLevel: "strong",
  });
  return res.success;
}

/**
 * Options that bind a SecureStore item to the device biometric/passcode
 * policy at the OS level. On iOS this maps to Keychain access controls
 * (the item can only be decrypted after a successful biometric/passcode
 * prompt); on Android it requires the user to authenticate against the
 * Keystore-backed key. Combined with our app-level prompt, this means
 * the stored JWT cannot be lifted off the device by simply reading
 * SecureStore — the OS gates decryption too.
 */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: "Unlock Splitix",
};

/** True if the user previously opted in to biometric login on this device. */
export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const flag = await SecureStore.getItemAsync(BIO_ENABLED_KEY);
  return flag === "1";
}

/**
 * Stash credentials for biometric-gated sign-in. We persist the JWT and a
 * snapshot of the user object — on the next launch we'll prompt for
 * biometrics, then hydrate the auth context directly without needing a
 * password round-trip. The JWT lives 7 days; if it expires the user falls
 * back to a password sign-in (which can re-arm biometrics).
 */
export async function enableBiometric(token: string, user: unknown): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(BIO_TOKEN_KEY, token, SECURE_OPTIONS);
  await SecureStore.setItemAsync(BIO_USER_KEY, JSON.stringify(user), SECURE_OPTIONS);
  // Enabled flag is non-sensitive: read on every cold start to decide
  // whether to render the biometric button — keep it free of OS auth gates.
  await SecureStore.setItemAsync(BIO_ENABLED_KEY, "1");
}

export async function disableBiometric(): Promise<void> {
  if (Platform.OS === "web") return;
  // The protected items can't be deleted without auth on some platforms;
  // swallow errors so we always clear the flag and best-effort the rest.
  await SecureStore.deleteItemAsync(BIO_TOKEN_KEY, SECURE_OPTIONS).catch(() => {});
  await SecureStore.deleteItemAsync(BIO_USER_KEY, SECURE_OPTIONS).catch(() => {});
  await SecureStore.deleteItemAsync(BIO_ENABLED_KEY).catch(() => {});
}

export interface BiometricSession {
  token: string;
  user: unknown;
}

/**
 * Prompt the device biometric and, on success, return the stored session.
 * Returns null if biometrics fail, are cancelled, or no session is stored.
 */
export async function unlockBiometricSession(reason: string): Promise<BiometricSession | null> {
  if (Platform.OS === "web") return null;
  const enabled = await isBiometricEnabled();
  if (!enabled) return null;
  // The OS will show its own auth UI when reading items written with
  // requireAuthentication. We still call authenticateAsync first so we get
  // a clear, branded prompt (and so that a cancel here doesn't trigger a
  // second OS dialog from the SecureStore reads). On success, retrieve the
  // session — if it's missing/corrupt, self-heal so we don't keep prompting
  // a user who has nothing to unlock.
  const ok = await promptBiometricAuth(reason);
  if (!ok) return null;
  let token: string | null = null;
  let userStr: string | null = null;
  try {
    token = await SecureStore.getItemAsync(BIO_TOKEN_KEY, SECURE_OPTIONS);
    userStr = await SecureStore.getItemAsync(BIO_USER_KEY, SECURE_OPTIONS);
  } catch {
    await disableBiometric();
    return null;
  }
  if (!token || !userStr) {
    await disableBiometric();
    return null;
  }
  try {
    return { token, user: JSON.parse(userStr) };
  } catch {
    await disableBiometric();
    return null;
  }
}

/** Refresh just the cached JWT (e.g. when a fresh login happens with bio
 *  already enabled, so the next biometric unlock uses the newest token). */
export async function refreshStoredBiometricToken(token: string, user: unknown): Promise<void> {
  if (Platform.OS === "web") return;
  if (!(await isBiometricEnabled())) return;
  await SecureStore.setItemAsync(BIO_TOKEN_KEY, token, SECURE_OPTIONS);
  await SecureStore.setItemAsync(BIO_USER_KEY, JSON.stringify(user), SECURE_OPTIONS);
}
