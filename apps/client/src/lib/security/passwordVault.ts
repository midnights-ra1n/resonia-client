import { storage } from "../storage";

const VAULT_KEY_STORAGE = "resonia:vaultKey";

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await storage.get<string>(VAULT_KEY_STORAGE);

  if (existing) {
    const raw = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
  }

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const exported = await crypto.subtle.exportKey("raw", key);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  await storage.set(VAULT_KEY_STORAGE, base64);
  return key;
}

export interface EncryptedPassword {
  iv: string; // base64
  data: string; // base64
}

export async function encryptPassword(password: string): Promise<EncryptedPassword> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(password);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

export async function decryptPassword(encrypted: EncryptedPassword): Promise<string> {
  const key = await getOrCreateKey();
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(encrypted.data), (c) => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
