import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIO_TOKEN_KEY = "sw_bio_token";
const BIO_USER_KEY = "sw_bio_user";
const BIO_ENABLED_KEY = "sw_bio_enabled";
// Records whether the vault entries were written with the OS-level
// `requireAuthentication` keychain access control. Reads must use the
// matching options or SecureStore will throw "item not found"-style errors,
// so we persist this alongside the data.
const BIO_SECURED_KEY = "sw_bio_secured";

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
    // Force biometrics-only. With device fallback enabled iOS happily routes
    // straight to a passcode prompt (e.g. after a single failed face match,
    // or whenever it thinks the biometric pipeline is busy), which the user
    // experiences as "it's asking for my passcode instead of Face ID". The
    // user can still use their passcode by signing in with email + password.
    disableDeviceFallback: true,
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
 *
 * Not all environments support this — Expo Go, iOS simulators without
 * enrolled biometrics, and Android devices without a screen-lock will
 * reject `requireAuthentication: true`. In those cases we transparently
 * fall back to plain SecureStore (still gated by our app-level
 * `authenticateAsync` prompt). `canSecure()` reports which mode applies.
 */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: "Unlock Splitix",
};
const PLAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function canSecure(): boolean {
  if (Platform.OS === "web") return false;
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

async function readSecuredFlag(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return (await SecureStore.getItemAsync(BIO_SECURED_KEY)) === "1";
}

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
  // Prefer OS-bound storage. Fall back to plain SecureStore if the runtime
  // can't keep the auth-protected variant (Expo Go, simulator without
  // enrolled biometrics, Android with no screen-lock).
  const userJson = JSON.stringify(user);
  let secured = canSecure();
  if (secured) {
    try {
      await SecureStore.setItemAsync(BIO_TOKEN_KEY, token, SECURE_OPTIONS);
      await SecureStore.setItemAsync(BIO_USER_KEY, userJson, SECURE_OPTIONS);
    } catch {
      secured = false;
    }
  }
  if (!secured) {
    await SecureStore.setItemAsync(BIO_TOKEN_KEY, token, PLAIN_OPTIONS);
    await SecureStore.setItemAsync(BIO_USER_KEY, userJson, PLAIN_OPTIONS);
  }
  await SecureStore.setItemAsync(BIO_SECURED_KEY, secured ? "1" : "0");
  // Enabled flag is non-sensitive: read on every cold start to decide
  // whether to render the biometric button — keep it free of OS auth gates.
  await SecureStore.setItemAsync(BIO_ENABLED_KEY, "1");
}

export async function disableBiometric(): Promise<void> {
  if (Platform.OS === "web") return;
  const secured = await readSecuredFlag();
  const opts = secured ? SECURE_OPTIONS : PLAIN_OPTIONS;
  // The protected items can't be deleted without auth on some platforms;
  // swallow errors so we always clear the flags and best-effort the rest.
  await SecureStore.deleteItemAsync(BIO_TOKEN_KEY, opts).catch(() => {});
  await SecureStore.deleteItemAsync(BIO_USER_KEY, opts).catch(() => {});
  await SecureStore.deleteItemAsync(BIO_TOKEN_KEY, PLAIN_OPTIONS).catch(() => {});
  await SecureStore.deleteItemAsync(BIO_USER_KEY, PLAIN_OPTIONS).catch(() => {});
  await SecureStore.deleteItemAsync(BIO_ENABLED_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(BIO_SECURED_KEY).catch(() => {});
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
  const secured = await readSecuredFlag();
  const opts = secured ? SECURE_OPTIONS : PLAIN_OPTIONS;
  try {
    token = await SecureStore.getItemAsync(BIO_TOKEN_KEY, opts);
    userStr = await SecureStore.getItemAsync(BIO_USER_KEY, opts);
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
 *  already enabled, so the next biometric unlock uses the newest token).
 *
 *  IMPORTANT: If the freshly-signed-in user differs from the user the vault
 *  was bound to, we tear the vault down rather than rebinding it. Otherwise
 *  signing in as user B would either (a) leak user A's token if we did
 *  nothing, or (b) silently transfer the device's biometric login to user B
 *  without their consent. Wiping forces user B to opt in explicitly via the
 *  post-login prompt. */
export async function refreshStoredBiometricToken(token: string, user: unknown): Promise<void> {
  if (Platform.OS === "web") return;
  if (!(await isBiometricEnabled())) return;
  // Compare against the previously-bound user. We don't need biometric auth
  // to read the user record for this check on the plain-options branch; on
  // the secured branch we can't read it without a prompt, so we conservatively
  // wipe whenever the IDs don't match (or we can't verify the match).
  const newUserId = (user as { id?: string } | null)?.id ?? null;
  let storedUserId: string | null = null;
  try {
    const secured = await readSecuredFlag();
    if (!secured) {
      const stored = await SecureStore.getItemAsync(BIO_USER_KEY, PLAIN_OPTIONS);
      if (stored) {
        try {
          storedUserId = (JSON.parse(stored) as { id?: string } | null)?.id ?? null;
        } catch {
          storedUserId = null;
        }
      }
    }
  } catch {
    storedUserId = null;
  }
  if (storedUserId && newUserId && storedUserId !== newUserId) {
    // Different user — clear the vault entirely; the new user must opt in.
    await disableBiometric();
    return;
  }
  const secured = await readSecuredFlag();
  if (secured && !storedUserId) {
    // OS-secured vault: we can't peek the bound user without prompting. To
    // avoid silently rebinding to a different account, wipe and require the
    // signed-in user to opt in fresh from the post-login prompt or Profile.
    await disableBiometric();
    return;
  }
  const opts = secured ? SECURE_OPTIONS : PLAIN_OPTIONS;
  try {
    await SecureStore.setItemAsync(BIO_TOKEN_KEY, token, opts);
    await SecureStore.setItemAsync(BIO_USER_KEY, JSON.stringify(user), opts);
  } catch {
    // Best-effort: if a refresh fails (e.g. user removed biometrics),
    // tear the vault down so the next sign-in re-establishes it cleanly.
    await disableBiometric();
  }
}

/** Returns the user-id the biometric vault is currently bound to, or null
 *  if there is no vault, the vault is OS-secured (can't peek without a
 *  prompt), or it is unreadable. Used by the auth layer to decide whether
 *  the saved biometric session belongs to a different user than the one
 *  signing in now. */
export async function getBoundBiometricUserId(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!(await isBiometricEnabled())) return null;
  try {
    const secured = await readSecuredFlag();
    if (secured) return null; // Can't peek without an OS auth prompt.
    const stored = await SecureStore.getItemAsync(BIO_USER_KEY, PLAIN_OPTIONS);
    if (!stored) return null;
    return (JSON.parse(stored) as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}
