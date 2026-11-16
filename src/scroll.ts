export interface FrameClock {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}

export interface ScrollSurface {
  scrollLeft: number;
  scrollTop: number;
  isConnected: boolean;
  scrollBy(options: ScrollToOptions): void;
}

interface Motion {
  target: ScrollSurface;
  key: string;
  dx: number;
  dy: number;
  speed: number;
  held: boolean;
  travelled: number;
  minimum: number;
  previousTime: number;
}

/** One animator per window; OS keyboard-repeat events never drive the motion. */
export class ContinuousScroller {
  private clock: FrameClock;
  private motion?: Motion;
  private frame?: number;

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
    if (current?.held && current.key === key && current.target === target) return;
    if (current && current.key === key && current.target === target) {
      current.held = true;
      current.minimum += tapDistance;
      return;
    }
    this.stop();
    this.motion = {
      key,
      target,
      dx,
      dy,
      speed,
      held: true,
      travelled: 0,
      minimum: tapDistance,
      previousTime: this.clock.now(),
    };
    this.frame = this.clock.request(this.tick);
  }

  release(key: string): void {
    const motion = this.motion;
    if (!motion || key !== motion.key) return;
    motion.held = false;
    // A quick tap completes its distance; a long hold stops on keyup without coasting.
    if (motion.travelled >= motion.minimum) this.stop();
  }

  stop(): void {
    if (this.frame !== undefined) this.clock.cancel(this.frame);
    this.frame = undefined;
    this.motion = undefined;
  }

  private tick = (time: number): void => {
    this.frame = undefined;
    const motion = this.motion;
    if (!motion || !motion.target.isConnected) {
      this.stop();
      return;
    }
    // A resumed/suspended renderer must not turn elapsed background time into a jump.
    const elapsed = Math.max(0, Math.min(40, time - motion.previousTime));
    motion.previousTime = time;
    let distance = (motion.speed * elapsed) / 1000;
    if (!motion.held) distance = Math.min(distance, motion.minimum - motion.travelled);
    if (distance > 0) {
      const { target, dx, dy } = motion;
      const before = dx ? target.scrollLeft : target.scrollTop;
      // Animation belongs to this loop, so CSS scroll-behavior must not start another animation.
      target.scrollBy({ left: dx * distance, top: dy * distance, behavior: "instant" });
      motion.travelled += distance;
      const after = dx ? target.scrollLeft : target.scrollTop;
      if (before === after) {
        this.stop();
        return;
      }
    }
    if (!motion.held && motion.travelled >= motion.minimum) {
      this.stop();
      return;
    }
    this.frame = this.clock.request(this.tick);
  };
}
