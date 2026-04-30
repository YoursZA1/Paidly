/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createSessionInactivitySyncChannel } from "@/lib/sessionInactivitySync";

class FakeBroadcastChannel {
  static channels = new Map();
  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    const group = FakeBroadcastChannel.channels.get(name) || new Set();
    group.add(this);
    FakeBroadcastChannel.channels.set(name, group);
  }
  addEventListener(_type, fn) {
    this.listeners.add(fn);
  }
  removeEventListener(_type, fn) {
    this.listeners.delete(fn);
  }
  postMessage(data) {
    const group = FakeBroadcastChannel.channels.get(this.name) || new Set();
    for (const instance of group) {
      if (instance === this) continue;
      for (const fn of instance.listeners) fn({ data });
    }
  }
  close() {
    const group = FakeBroadcastChannel.channels.get(this.name) || new Set();
    group.delete(this);
  }
}

describe("session inactivity sync", () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(() => {
    globalThis.BroadcastChannel = FakeBroadcastChannel;
  });

  afterEach(() => {
    globalThis.BroadcastChannel = originalBroadcastChannel;
    FakeBroadcastChannel.channels.clear();
  });

  it("broadcasts activity across tabs", async () => {
    const a = createSessionInactivitySyncChannel();
    const b = createSessionInactivitySyncChannel();
    const received = [];
    const unsubscribe = b.subscribe((message) => received.push(message));

    a.publish("SESSION_ACTIVITY", { at: 123 });
    await Promise.resolve();

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("SESSION_ACTIVITY");
    expect(received[0].payload.at).toBe(123);

    unsubscribe();
    a.close();
    b.close();
  });
});
