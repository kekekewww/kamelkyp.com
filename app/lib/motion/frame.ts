/**
 * Shared rAF scheduler (docs/motion-system.md §2.0): reads are batched before
 * writes in one frame. No hook calls requestAnimationFrame directly.
 * SSR-safe: requestAnimationFrame is touched lazily on first call.
 */

type Task = () => void;

const reads: Task[] = [];
const writes: Task[] = [];
let scheduled = false;

function flush() {
  scheduled = false;
  const readBatch = reads.splice(0);
  const writeBatch = writes.splice(0);
  for (const task of readBatch) task();
  for (const task of writeBatch) task();
}

function request() {
  if (scheduled || typeof requestAnimationFrame !== "function") return;
  scheduled = true;
  requestAnimationFrame(flush);
}

export function scheduleRead(task: Task): void {
  reads.push(task);
  request();
}

export function scheduleWrite(task: Task): void {
  writes.push(task);
  request();
}

/**
 * Runs `tick(now, dtMs)` every frame until the returned stop function is
 * called or `tick` returns `false`. Auto-pauses while the tab is hidden.
 */
export function loop(
  tick: (now: number, dtMs: number) => boolean | undefined,
): () => void {
  if (typeof requestAnimationFrame !== "function") return () => {};

  let handle = 0;
  let last = 0;
  let stopped = false;

  function stop() {
    stopped = true;
    cancelAnimationFrame(handle);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function frame(now: number) {
    if (stopped) return;
    const dt = last === 0 ? 16.667 : Math.min(now - last, 64);
    last = now;
    if (tick(now, dt) === false) {
      stop();
      return;
    }
    handle = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (stopped) return;
    if (document.visibilityState === "hidden") {
      cancelAnimationFrame(handle);
      handle = 0;
    } else if (handle === 0) {
      last = 0;
      handle = requestAnimationFrame(frame);
    }
  }

  document.addEventListener("visibilitychange", onVisibility);
  handle = requestAnimationFrame(frame);
  return stop;
}
