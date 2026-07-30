import { create } from "zustand";
import { DEFAULT_QUALITY_ID, getAvailableQualities, getQualityById } from "../lib/audio/qualityOptions";
import { getPlatform } from "../lib/platform";
import { storage } from "../lib/storage";

interface SettingsState {
  audioQualityId: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAudioQuality: (id: string) => Promise<void>;
}

const STORAGE_KEY = "resonia:settings:audioQuality";

export const useSettingsStore = create<SettingsState>((set) => ({
  audioQualityId: DEFAULT_QUALITY_ID,
  hydrated: false,

  hydrate: async () => {
    const stored = await storage.get<string>(STORAGE_KEY);
    const platform = getPlatform();
    const available = getAvailableQualities(platform);
    // If the stored quality is no longer available on this platform
    // (e.g., desktop profile -> opened one day on the web), we fall back to the default.
    const isValid = stored && available.some((q) => q.id === stored);

    set({ audioQualityId: isValid ? stored! : DEFAULT_QUALITY_ID, hydrated: true });
  },

  setAudioQuality: async (id) => {
    if (!getQualityById(id)) return;
    await storage.set(STORAGE_KEY, id);
    set({ audioQualityId: id });
  },
}));
