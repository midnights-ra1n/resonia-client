import { describe, expect, it } from "vitest";
import { isBetaVersion, resolveBetaUpdatesEnabled } from "./appVersion";

describe("resolveBetaUpdatesEnabled", () => {
  it("enables beta updates by default on a beta version", () => {
    expect(resolveBetaUpdatesEnabled(null, "beta")).toBe(true);
  });

  it("disables beta updates by default on a stable version", () => {
    expect(resolveBetaUpdatesEnabled(null, "stable")).toBe(false);
  });

  it("keeps an explicit choice made on the same channel", () => {
    expect(resolveBetaUpdatesEnabled({ enabled: false, channel: "beta" }, "beta")).toBe(false);
    expect(resolveBetaUpdatesEnabled({ enabled: true, channel: "stable" }, "stable")).toBe(true);
  });

  it("falls back to the new channel's default after switching channel", () => {
    // Stable avec la bêta désactivée, puis passage à une bêta : activée.
    expect(resolveBetaUpdatesEnabled({ enabled: false, channel: "stable" }, "beta")).toBe(true);
    // Bêta, puis passage à une stable : désactivée.
    expect(resolveBetaUpdatesEnabled({ enabled: true, channel: "beta" }, "stable")).toBe(false);
  });
});

describe("isBetaVersion", () => {
  it("detects pre-releases", () => {
    expect(isBetaVersion("1.0.0-beta.5")).toBe(true);
    expect(isBetaVersion("1.0.0")).toBe(false);
  });
});
