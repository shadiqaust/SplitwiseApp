import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const TOKEN_KEY = "sw_auth_token";
export const USER_KEY = "sw_auth_user";

export async function storeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}
