import type { Platform } from "../platform";

export interface AudioQuality {
  id: string;
  label: string;
  format: "aac" | "mp3" | "opus" | "raw";
  maxBitRate: number; // 0 is no limit, used with lossless/raw format
  platforms: Platform[];
}

export const AUDIO_QUALITIES: AudioQuality[] = [
  {
    id: "aac-256",
    label: "AAC 256 kbps",
    format: "aac",
    maxBitRate: 256,
    platforms: ["web", "desktop"],
  },
  {
    id: "opus-192",
    label: "Opus 192 kbps",
    format: "opus",
    maxBitRate: 192,
    platforms: ["desktop"],
  },
  {
    id: "mp3-320",
    label: "MP3 320 kbps",
    format: "mp3",
    maxBitRate: 320,
    platforms: ["desktop"],
  },
  {
    id: "lossless",
    label: "Lossless (source originale)",
    format: "raw",
    maxBitRate: 0,
    platforms: ["desktop"],
  },
];

export const DEFAULT_QUALITY_ID = "aac-256";

export function getAvailableQualities(platform: Platform): AudioQuality[] {
  return AUDIO_QUALITIES.filter((q) => q.platforms.includes(platform));
}

export function getQualityById(id: string): AudioQuality | undefined {
  return AUDIO_QUALITIES.find((q) => q.id === id);
}
