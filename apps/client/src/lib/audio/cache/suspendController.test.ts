import { describe, expect, it, vi } from "vitest";
import { SuspendController, whenNotSuspended } from "./suspendController";

describe("whenNotSuspended", () => {
  it("avec maxWaitMs, se résout au bout du délai même si la pause continue (entretien de la connexion)", async () => {
    vi.useFakeTimers();
    const suspension = new SuspendController();
    suspension.set(true);
    let resolved = false;
    void whenNotSuspended(suspension, new AbortController().signal, 15_000).then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(14_999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });

  it("sans maxWaitMs, attend la fin de la pause", async () => {
    vi.useFakeTimers();
    const suspension = new SuspendController();
    suspension.set(true);
    let resolved = false;
    void whenNotSuspended(suspension, new AbortController().signal).then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolved).toBe(false);
    suspension.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });
});
