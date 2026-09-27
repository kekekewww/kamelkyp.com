import { describe, expect, it, vi } from "vitest";
import { PlaybackCoordinator } from "../../app/lib/media/playback-coordinator";

describe("PlaybackCoordinator", () => {
  it("pauses the active item before another item starts", () => {
    const coordinator = new PlaybackCoordinator();
    const pauseA = vi.fn();
    const pauseB = vi.fn();

    coordinator.register("a", pauseA);
    coordinator.register("b", pauseB);
    coordinator.markPlaying("a");
    coordinator.markPlaying("b");

    expect(pauseA).toHaveBeenCalledOnce();
    expect(pauseB).not.toHaveBeenCalled();
  });

  it("stops every item on route disposal", () => {
    const coordinator = new PlaybackCoordinator();
    const pauseA = vi.fn();
    const pauseB = vi.fn();

    coordinator.register("a", pauseA);
    coordinator.register("b", pauseB);
    coordinator.stopAll();

    expect(pauseA).toHaveBeenCalledOnce();
    expect(pauseB).toHaveBeenCalledOnce();
  });

  it("unregisters without pausing a replacement callback", () => {
    const coordinator = new PlaybackCoordinator();
    const firstPause = vi.fn();
    const secondPause = vi.fn();
    const unregisterFirst = coordinator.register("same", firstPause);

    coordinator.register("same", secondPause);
    unregisterFirst();
    coordinator.stopAll();

    expect(firstPause).not.toHaveBeenCalled();
    expect(secondPause).toHaveBeenCalledOnce();
  });
});

describe("PlaybackCoordinator level channel", () => {
  it("publishes level sources to subscribers and unsubscribes", () => {
    const coordinator = new PlaybackCoordinator();
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribeLevel(listener);

    expect(listener).toHaveBeenLastCalledWith(null);
    coordinator.setLevelSource("a", { analyser: null, playing: true });
    expect(listener).toHaveBeenLastCalledWith({
      analyser: null,
      playing: true,
    });
    expect(coordinator.getLevelSource()).toEqual({
      analyser: null,
      playing: true,
    });

    unsubscribe();
    coordinator.setLevelSource("a", { analyser: null, playing: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("only lets the owning item clear the channel and clears on stopAll", () => {
    const coordinator = new PlaybackCoordinator();
    coordinator.setLevelSource("a", { analyser: null, playing: true });
    coordinator.setLevelSource("b", { analyser: null, playing: true });
    coordinator.setLevelSource("a", null);
    expect(coordinator.getLevelSource()).not.toBeNull();

    coordinator.stopAll();
    expect(coordinator.getLevelSource()).toBeNull();
  });
});
