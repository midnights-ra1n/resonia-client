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

describe("detectEdgeSilence — creux de bord (AAC)", () => {
  const sampleRate = 44100;
  // Musique régulière (sinus 220 Hz) avec un creux de 6 ms à -30 dB au début et à la fin.
  const withDropouts = (i: number, length: number) => {
    const music = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sampleRate);
    const dip = Math.round(0.006 * sampleRate);
    return i < dip || i >= length - dip ? music * 0.03 : music;
  };

  it("retire le creux de reconstruction en début et en fin de piste", () => {
    const length = 3 * sampleRate;
    const buffer = makeFakeAudioBuffer(3, sampleRate, 1, (i) => withDropouts(i, length));
    const trim = detectEdgeSilence(buffer);
    expect(trim.start).toBeGreaterThanOrEqual(0.006);
    expect(trim.end).toBeGreaterThanOrEqual(0.006);
    expect(trim.start).toBeLessThanOrEqual(0.021);
    expect(trim.end).toBeLessThanOrEqual(0.021);
  });

  it.each([40, 55, 110, 220, 880])("ne rogne rien sur une musique sans creux, même grave (%i Hz)", (hz) => {
    const buffer = makeFakeAudioBuffer(3, sampleRate, 1, (i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / sampleRate + 1));
    const trim = detectEdgeSilence(buffer);
    expect(trim.start).toBe(0);
    expect(trim.end).toBe(0);
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
