import { describe, expect, it } from "vitest";
import { formatBuildTime, migrateBetaUpdatesChoice, nightlyBuildNumber, releaseChannelOf, resolveUpdateChannel } from "./appVersion";

describe("resolveUpdateChannel", () => {
  it("follows the installed version's channel by default", () => {
    expect(resolveUpdateChannel(null, "stable")).toBe("stable");
    expect(resolveUpdateChannel(null, "beta")).toBe("beta");
    expect(resolveUpdateChannel(null, "nightly")).toBe("nightly");
  });

  it("keeps an explicit choice made on the same installed channel", () => {
    expect(resolveUpdateChannel({ channel: "nightly", installedChannel: "stable" }, "stable")).toBe("nightly");
    expect(resolveUpdateChannel({ channel: "stable", installedChannel: "beta" }, "beta")).toBe("stable");
  });

  it("falls back to the new installed channel after switching", () => {
    expect(resolveUpdateChannel({ channel: "stable", installedChannel: "stable" }, "beta")).toBe("beta");
  });
});

describe("migrateBetaUpdatesChoice", () => {
  it("maps the old beta checkbox to a channel", () => {
    expect(migrateBetaUpdatesChoice({ enabled: true, channel: "stable" })).toEqual({ channel: "beta", installedChannel: "stable" });
    expect(migrateBetaUpdatesChoice({ enabled: false, channel: "beta" })).toEqual({ channel: "stable", installedChannel: "beta" });
  });
});

describe("releaseChannelOf", () => {
  it("detects the channel from the version", () => {
    expect(releaseChannelOf("1.0.0-nightly.12")).toBe("nightly");
    expect(releaseChannelOf("1.0.0-beta.5")).toBe("beta");
    expect(releaseChannelOf("1.0.0")).toBe("stable");
  });
});

describe("nightly build info", () => {
  it("reads the build number of a nightly only", () => {
    expect(nightlyBuildNumber("1.2.0-nightly.42")).toBe(42);
    expect(nightlyBuildNumber("1.2.0-beta.3")).toBeNull();
  });

  it("formats the build time as MM/DD/YYYY @ HH:MM:SS", () => {
    expect(formatBuildTime(new Date(2026, 10, 3, 7, 5, 9).getTime())).toBe("11/03/2026 @ 07:05:09");
  });
});
