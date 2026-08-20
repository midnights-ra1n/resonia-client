import { describe, expect, it } from "vitest";
import { makeFakeAudioBuffer } from "../testUtils/webAudioMocks";
import { detectEdgeSilence, logicalDuration } from "./silenceTrim";

describe("detectEdgeSilence", () => {
  it("ne rogne rien quand il n'y a aucun silence de bord", () => {
    const buffer = makeFakeAudioBuffer(1, 44100, 1, () => 0.5);
    const trim = detectEdgeSilence(buffer);
    expect(trim.start).toBe(0);
    expect(trim.end).toBe(0);
  });

  it("rogne un silence en début et en fin, avec des durées différentes", () => {
    const sampleRate = 44100;
    const startSilenceSamples = 200;
    const endSilenceSamples = 500;
    const buffer = makeFakeAudioBuffer(1, sampleRate, 1, (i) => {
      if (i < startSilenceSamples) return 0;
      if (i >= sampleRate - endSilenceSamples) return 0;
      return 0.5;
    });

    const trim = detectEdgeSilence(buffer);
    expect(trim.start).toBeCloseTo(startSilenceSamples / sampleRate, 5);
    expect(trim.end).toBeCloseTo(endSilenceSamples / sampleRate, 5);
  });

  it("ne confond jamais un contenu réel mais calme avec du silence", () => {
    // Amplitude constante juste au-dessus du seuil de silence, sur tout le buffer.
    const buffer = makeFakeAudioBuffer(1, 44100, 1, () => 0.01);
    const trim = detectEdgeSilence(buffer);
    expect(trim.start).toBe(0);
    expect(trim.end).toBe(0);
  });

  it("plafonne le rognage à MAX_TRIM_SECONDS même si le silence dure plus longtemps", () => {
    const buffer = makeFakeAudioBuffer(2, 44100, 1, () => 0);
    const trim = detectEdgeSilence(buffer);
    expect(trim.start).toBeCloseTo(0.3, 5);
    expect(trim.end).toBeCloseTo(0.3, 5);
  });
});

describe("logicalDuration", () => {
  it("soustrait le rognage de bord de la durée brute", () => {
    const buffer = makeFakeAudioBuffer(10, 44100, 1);
    expect(logicalDuration(buffer, { start: 0.5, end: 0.2 })).toBeCloseTo(9.3, 5);
  });

  it("ne descend jamais sous zéro", () => {
    const buffer = makeFakeAudioBuffer(1, 44100, 1);
    expect(logicalDuration(buffer, { start: 0.8, end: 0.8 })).toBe(0);
  });
});
