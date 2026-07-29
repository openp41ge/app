/**
 * IntervalAutoScrollController — fires repeated scroll increments via setInterval.
 *
 * Implements IAutoScrollController using a fixed-interval timer. When
 * `start()` is called, it begins incrementing `target.scrollTop` by `speed`
 * pixels every `interval` milliseconds until `stop()` is called or until
 * the target reaches the bottom of its scrollable content.
 *
 * Open/Closed: New scroll strategies (e.g., requestAnimationFrame-based,
 * easing, smooth) can be added as new implementations of IAutoScrollController
 * without modifying this class.
 */

import type { IAutoScrollController } from "../interfaces/scroll-controllers";

export class IntervalAutoScrollController implements IAutoScrollController {
  private _intervalId: number | null = null;
  private _target: HTMLElement | null = null;
  private _isScrolling: boolean = false;

  start(config: { target: HTMLElement; speed?: number; interval?: number }): void {
    this.stop();

    this._target = config.target;
    const speed = config.speed ?? 20;
    const intervalMs = config.interval ?? 30;
    this._isScrolling = true;

    this._intervalId = window.setInterval(() => {
      if (!this._target) return;

      // Stop if we've reached the bottom
      const el = this._target;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (atBottom) {
        this.stop();
        return;
      }

      el.scrollTop += speed;
    }, intervalMs);
  }

  stop(): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._isScrolling = false;
    this._target = null;
  }

  get isScrolling(): boolean {
    return this._isScrolling;
  }
}
