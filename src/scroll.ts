export interface FrameClock {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}

export interface ScrollSurface {
  scrollLeft: number;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  isConnected: boolean;
  scrollBy(options: ScrollToOptions): void;
  scrollTo(options: ScrollToOptions): void;
}

interface KeyMotion {
  kind: "key";
  target: ScrollSurface;
  key: string;
  dx: number;
  dy: number;
  speed: number;
  held: boolean;
  travelled: number;
  minimum: number;
}

interface PageMotion {
  kind: "page";
  target: ScrollSurface;
  direction: 1 | -1;
  destination: number;
  position: number;
  velocity: number;
}

// A half page covers about 95% of its distance in 140 ms, then settles at its destination.
const PAGE_TIME_CONSTANT_MS = 30;

/** Direction keys and half-page commands share one cancellable frame loop per window. */
export class ContinuousScroller {
  private clock: FrameClock;
  private motion?: KeyMotion | PageMotion;
  private frame?: number;
  private previousTime = 0;

  constructor(clock: FrameClock) {
    this.clock = clock;
  }

  press(
    key: string,
    target: ScrollSurface,
    dx: number,
    dy: number,
    speed: number,
    tapDistance: number,
  ): void {
    const current = this.motion;
    if (current?.kind === "key" && current.key === key && current.target === target) {
      if (current.held) return;
      current.held = true;
      current.minimum += tapDistance;
      return;
    }
    this.start({
      kind: "key",
      key,
      target,
      dx,
      dy,
      speed,
      held: true,
      travelled: 0,
      minimum: tapDistance,
    });
  }

  halfPage(
    target: ScrollSurface,
    direction: 1 | -1,
    { repeat, reducedMotion }: { repeat?: boolean; reducedMotion?: boolean } = {},
  ): void {
    const step = (direction * target.clientHeight) / 2;
    if (reducedMotion) {
      this.stop();
      target.scrollBy({ top: step, behavior: "instant" });
      return;
    }

    const current = this.motion;
    const page =
      current?.kind === "page" && current.target === target && current.direction === direction
        ? current
        : undefined;
    // Manual taps add half pages. A held key starts the next page once this one lands.
    if (page && repeat) return;
    const position = target.scrollTop;
    const requested = (page?.destination ?? position) + step;
    const destination = Math.max(0, Math.min(target.scrollHeight - target.clientHeight, requested));
    if (page) {
      page.destination = destination;
      return;
    }
    if (position === destination) {
      this.stop();
      return;
    }
    this.start({ kind: "page", target, direction, destination, position, velocity: 0 });
  }

  release(key: string): void {
    const motion = this.motion;
    if (motion?.kind !== "key" || key !== motion.key) return;
    motion.held = false;
    // A quick tap completes its distance; a long hold stops on keyup without coasting.
    if (motion.travelled >= motion.minimum) this.stop();
  }

  stop(): void {
    if (this.frame !== undefined) this.clock.cancel(this.frame);
    this.frame = undefined;
    this.motion = undefined;
  }

  private start(motion: KeyMotion | PageMotion): void {
    this.stop();
    this.motion = motion;
    this.previousTime = this.clock.now();
    this.frame = this.clock.request(this.tick);
  }

  private tick = (time: number): void => {
    this.frame = undefined;
    const motion = this.motion;
    if (!motion || !motion.target.isConnected) {
      this.stop();
      return;
    }
    // A resumed/suspended renderer must not turn elapsed background time into a jump.
    const elapsed = Math.max(0, Math.min(40, time - this.previousTime));
    this.previousTime = time;
    const moving =
      motion.kind === "page" ? this.advancePage(motion, elapsed) : this.advanceKey(motion, elapsed);
    if (moving) this.frame = this.clock.request(this.tick);
    else this.stop();
  };

  private advancePage(motion: PageMotion, elapsed: number): boolean {
    // A critically damped spring carries velocity through same-direction taps without overshoot.
    const offset = motion.position - motion.destination;
    const slope = motion.velocity + offset / PAGE_TIME_CONSTANT_MS;
    const decay = Math.exp(-elapsed / PAGE_TIME_CONSTANT_MS);
    motion.position = motion.destination + (offset + slope * elapsed) * decay;
    motion.velocity = (motion.velocity - (slope * elapsed) / PAGE_TIME_CONSTANT_MS) * decay;
    const settled = Math.abs(motion.destination - motion.position) < 0.5;
    motion.target.scrollTo({
      top: settled ? motion.destination : motion.position,
      behavior: "instant",
    });
    return !settled;
  }

  private advanceKey(motion: KeyMotion, elapsed: number): boolean {
    let distance = (motion.speed * elapsed) / 1000;
    if (!motion.held) distance = Math.min(distance, motion.minimum - motion.travelled);
    if (distance > 0) {
      const { target, dx, dy } = motion;
      const before = dx ? target.scrollLeft : target.scrollTop;
      // Animation belongs to this loop, so CSS scroll-behavior must not start another animation.
      target.scrollBy({ left: dx * distance, top: dy * distance, behavior: "instant" });
      motion.travelled += distance;
      const after = dx ? target.scrollLeft : target.scrollTop;
      if (before === after) return false;
    }
    return motion.held || motion.travelled < motion.minimum;
  }
}
