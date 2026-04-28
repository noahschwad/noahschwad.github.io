/**
 * Strip Mux: load in list order (lower index = higher on the page) first.
 *
 * - `true`: at most `MAX_CONCURRENT` in flight until each releases (manifest ready).
 * - `false`: no cap; all tiles still start in **order** (batched in one microtask, sorted
 *   by `order` so the queue works even if components mount out of order).
 */
export const STRIP_MUX_LOAD_LIMIT_ENABLED = false;

const MAX_CONCURRENT = 6;

let active = 0;

/** @type {{ order: number; onGrant: (release: () => void) => void }[]} */
const waiting = [];

/** @type {{ order: number; onGrant: (release: () => void) => void; cancelled: boolean }[]} */
const unlimitedBatch = [];
let unlimitedFlushScheduled = false;

function flushUnlimitedBatch() {
  unlimitedFlushScheduled = false;
  const items = unlimitedBatch.splice(0, unlimitedBatch.length);
  items.sort((a, b) => a.order - b.order);
  for (const e of items) {
    if (e.cancelled) continue;
    e.onGrant(() => {});
  }
}

function pump() {
  waiting.sort((a, b) => a.order - b.order);
  while (active < MAX_CONCURRENT && waiting.length) {
    const w = waiting.shift();
    if (!w) break;
    active += 1;
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      active -= 1;
      pump();
    };
    w.onGrant(release);
  }
}

/**
 * @param {number} order
 * @param {(release: () => void) => void} onGrant
 * @returns {() => void} cancel
 */
export function requestStripMuxLoad(order, onGrant) {
  if (!STRIP_MUX_LOAD_LIMIT_ENABLED) {
    const entry = { order, onGrant, cancelled: false };
    unlimitedBatch.push(entry);
    if (!unlimitedFlushScheduled) {
      unlimitedFlushScheduled = true;
      queueMicrotask(flushUnlimitedBatch);
    }
    return () => {
      entry.cancelled = true;
      const i = unlimitedBatch.indexOf(entry);
      if (i >= 0) {
        unlimitedBatch.splice(i, 1);
      }
    };
  }
  const entry = { order, onGrant };
  waiting.push(entry);
  pump();
  return () => {
    const i = waiting.indexOf(entry);
    if (i >= 0) {
      waiting.splice(i, 1);
    }
  };
}
