// supabase-js storage backed by the iOS Keychain (ios/App/App/KeychainPlugin.swift): the session
// (access + refresh token) lives in the encrypted Keychain, this device only — not localStorage.
import { registerPlugin } from "@capacitor/core";

type KeychainPlugin = {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
};
const Keychain = registerPlugin<KeychainPlugin>("Keychain");

export const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return (await Keychain.get({ key })).value ?? null;
    } catch {
      return null; // unreadable → signed out, never a crash
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    await Keychain.set({ key, value });
  },
  async removeItem(key: string): Promise<void> {
    await Keychain.remove({ key }).catch(() => undefined);
  },
};
