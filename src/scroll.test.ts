import { test } from "node:test";
import assert from "node:assert/strict";
import { ContinuousScroller } from "./scroll.ts";
import type { FrameClock, ScrollSurface } from "./scroll.ts";

class Clock implements FrameClock {
  time = 0;
  nextId = 0;
  callbacks = new Map<number, (time: number) => void>();
  now(): number {
    return this.time;
  }
  request(callback: (time: number) => void): number {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    return id;
  }
  cancel(id: number): void {
    this.callbacks.delete(id);
  }
  advance(duration: number, frame = 10): void {
    const end = this.time + duration;
    while (this.time < end) {
      this.time = Math.min(end, this.time + frame);
      const callbacks = [...this.callbacks.values()];
      this.callbacks.clear();
      for (const callback of callbacks) callback(this.time);
    }
  }
}

function fixture(limit = 10000) {
  const clock = new Clock();
  const surface: ScrollSurface = {
    scrollLeft: 0,
    scrollTop: 0,
    clientHeight: 600,
    scrollHeight: limit + 600,
    isConnected: true,
    scrollBy({ left = 0, top = 0 }) {
      this.scrollTo({ left: this.scrollLeft + left, top: this.scrollTop + top });
    },
    scrollTo({ left, top }) {
      this.scrollLeft = Math.min(limit, Math.max(0, left ?? this.scrollLeft));
      this.scrollTop = Math.min(limit, Math.max(0, top ?? this.scrollTop));
    },
  };
  const scroller = new ContinuousScroller(clock);
  const press = () => scroller.press("j", surface, 0, 1, 900, 72);
  return { clock, surface, scroller, press };
}

test("a hold scrolls through the OS repeat delay without any repeated keydown", () => {
  const { clock, surface, scroller, press } = fixture();
  press();
  clock.advance(500);
  assert.equal(surface.scrollTop, 450);
  scroller.release("j");
  clock.advance(500);
  assert.equal(surface.scrollTop, 450, "a long hold must stop exactly on keyup");
  assert.equal(clock.callbacks.size, 0);
});

test("a quick tap completes its configured distance", () => {
  const { clock, surface, scroller, press } = fixture();
  press();
  clock.advance(10);
  scroller.release("j");
  clock.advance(200);
  assert.equal(surface.scrollTop, 72);
});

test("quick consecutive taps accumulate instead of cancelling each other", () => {
  const { clock, surface, scroller, press } = fixture();
  press();
  clock.advance(10);
  scroller.release("j");
  press();
  clock.advance(10);
  scroller.release("j");
  clock.advance(300);
  assert.equal(surface.scrollTop, 144);
});

test("repeat keydowns cannot create extra animators or increase the speed", () => {
  const { clock, surface, press } = fixture();
  press();
  for (let index = 0; index < 20; index += 1) {
    clock.advance(20);
    press();
  }
  assert.equal(surface.scrollTop, 360);
  assert.equal(clock.callbacks.size, 1);
});

test("equal elapsed time produces equal movement at different frame rates", () => {
  const positions = [5, 10, 20].map((frame) => {
    const { clock, surface, press } = fixture();
    press();
    clock.advance(600, frame);
    return surface.scrollTop;
  });
  assert.deepEqual(positions, [540, 540, 540]);
});

test("unrelated keyup does not stop the current direction", () => {
  const { clock, surface, scroller, press } = fixture();
  press();
  clock.advance(100);
  scroller.release("q");
  clock.advance(100);
  assert.equal(surface.scrollTop, 180);
});

test("changing direction cancels the old animator", () => {
  const { clock, surface, scroller, press } = fixture();
  press();
  clock.advance(200);
  scroller.press("k", surface, 0, -1, 900, 72);
  clock.advance(100);
  scroller.release("k");
  assert.equal(surface.scrollTop, 90);
  assert.equal(clock.callbacks.size, 0);
});

test("stop cancels even an unfinished tap", () => {
  const { clock, surface, scroller, press } = fixture();
  press();
  clock.advance(10);
  scroller.stop();
  clock.advance(500);
  assert.equal(surface.scrollTop, 9);
  assert.equal(clock.callbacks.size, 0);
});

test("a background suspension cannot cause a large jump", () => {
  const { clock, surface, press } = fixture();
  press();
  clock.advance(3000, 3000);
  assert.equal(surface.scrollTop, 36);
});

test("detached and boundary surfaces release their animator", () => {
  const first = fixture(30);
  first.press();
  first.clock.advance(500);
  assert.equal(first.surface.scrollTop, 30);
  assert.equal(first.clock.callbacks.size, 0);
  const second = fixture();
  second.press();
  second.surface.isConnected = false;
  second.clock.advance(20);
  assert.equal(second.clock.callbacks.size, 0);
});

test("a half page eases in and out and lands at the same place across refresh rates", () => {
  const intermediate = [5, 10, 20].map((frame) => {
    const { clock, surface, scroller } = fixture();
    scroller.halfPage(surface, 1);
    scroller.release("KeyD");
    assert.equal(surface.scrollTop, 0);
    clock.advance(20, frame);
    const first = surface.scrollTop;
    clock.advance(20, frame);
    const second = surface.scrollTop - first;
    assert.ok(first > 0 && second > first, "the page accelerates from rest");
    clock.advance(80, frame);
    const nearEnd = surface.scrollTop;
    clock.advance(20, frame);
    assert.ok(surface.scrollTop > nearEnd && surface.scrollTop - nearEnd < second);
    clock.advance(400, frame);
    assert.equal(surface.scrollTop, 300);
    assert.equal(clock.callbacks.size, 0);
    return nearEnd;
  });
  assert.ok(Math.max(...intermediate) - Math.min(...intermediate) < 0.001);
});

test("same-direction taps extend the destination and carry the current velocity", () => {
  const { clock, surface, scroller } = fixture();
  scroller.halfPage(surface, 1);
  clock.advance(30);
  const before = surface.scrollTop;
  clock.advance(10);
  const atTap = surface.scrollTop;
  scroller.halfPage(surface, 1);
  clock.advance(10);
  assert.ok(surface.scrollTop - atTap >= atTap - before);
  clock.advance(500);
  assert.equal(surface.scrollTop, 600);
  assert.equal(clock.callbacks.size, 0);
});

test("opposite turns start at the visible position and clamp at either edge", () => {
  const { clock, surface, scroller } = fixture(800);
  surface.scrollTop = 500;
  scroller.halfPage(surface, 1);
  clock.advance(40);
  const atTurn = surface.scrollTop;
  scroller.halfPage(surface, -1);
  clock.advance(10);
  assert.ok(surface.scrollTop < atTurn);
  clock.advance(500);
  assert.equal(surface.scrollTop, atTurn - 300);
  for (const direction of [-1, 1] as const) {
    for (let tap = 0; tap < 4; tap++) scroller.halfPage(surface, direction);
    clock.advance(500);
    assert.equal(surface.scrollTop, direction === -1 ? 0 : 800);
    scroller.halfPage(surface, direction);
    assert.equal(clock.callbacks.size, 0);
  }
});

test("OS repeats can start another half page after landing without building a backlog", () => {
  const { clock, surface, scroller } = fixture();
  scroller.halfPage(surface, 1);
  for (let repeat = 0; repeat < 8; repeat++) {
    clock.advance(20);
    scroller.halfPage(surface, 1, { repeat: true });
  }
  clock.advance(500);
  assert.equal(surface.scrollTop, 300);
  scroller.halfPage(surface, 1, { repeat: true });
  clock.advance(500);
  assert.equal(surface.scrollTop, 600);
});

test("a directional key takes over a half page and stop cancels a pending turn", () => {
  const { clock, surface, scroller, press } = fixture();
  scroller.halfPage(surface, 1);
  clock.advance(50);
  const origin = surface.scrollTop;
  press();
  scroller.release("j");
  clock.advance(500);
  assert.equal(surface.scrollTop, origin + 72);
  scroller.halfPage(surface, -1);
  scroller.stop();
  clock.advance(500);
  assert.equal(surface.scrollTop, origin + 72);
  assert.equal(clock.callbacks.size, 0);
});
