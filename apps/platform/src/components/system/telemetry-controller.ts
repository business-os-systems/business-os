import { toMessage } from "@/lib/error-message";
import type { PlatformHealth, QueueMetrics } from "@/lib/system-api";

export type TelemetryView =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly health: PlatformHealth;
      readonly queues: QueueMetrics;
      readonly receivedAt: string;
      readonly refreshError: string | null;
    };

export interface TelemetrySnapshot {
  readonly health: PlatformHealth;
  readonly queues: QueueMetrics;
}

export interface TelemetryControllerState {
  readonly view: TelemetryView;
  readonly isRefreshing: boolean;
}

export interface TelemetryControllerOptions<Handle> {
  readonly load: (signal: AbortSignal) => Promise<TelemetrySnapshot>;
  readonly intervalMs: number;
  readonly onChange: (state: TelemetryControllerState) => void;
  readonly now: () => string;
  readonly setTimer: (handler: () => void, intervalMs: number) => Handle;
  readonly clearTimer: (handle: Handle) => void;
}

export interface TelemetryController {
  start(): void;
  stop(): void;
  refresh(): void;
}

/**
 * The whole refresh mechanism in one framework-free module: the interval, the
 * abort of the previous request, the last-good-reading retention and the error
 * state. The React hook is an adapter over this interface, and the tests drive
 * the same start/stop/refresh a caller uses - so "abort per tick" and "stop
 * clears the in-flight request" are proven, not assumed.
 */
class RefreshLoop<Handle> implements TelemetryController {
  private view: TelemetryView = { kind: "loading" };
  private isRefreshing = false;
  private inFlight: AbortController | null = null;
  private timer: Handle | null = null;
  private stopped = true;

  constructor(private readonly options: TelemetryControllerOptions<Handle>) {}

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    void this.read();
    this.timer = this.options.setTimer(() => {
      void this.read();
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    if (this.timer !== null) {
      this.options.clearTimer(this.timer);
      this.timer = null;
    }
    this.inFlight?.abort();
    this.inFlight = null;
  }

  refresh(): void {
    void this.read();
  }

  private emit(): void {
    this.options.onChange({
      view: this.view,
      isRefreshing: this.isRefreshing,
    });
  }

  private async read(): Promise<void> {
    this.inFlight?.abort();
    const current = new AbortController();
    this.inFlight = current;
    this.isRefreshing = true;
    this.emit();

    try {
      const snapshot = await this.options.load(current.signal);
      if (this.stopped || current.signal.aborted) {
        return;
      }
      this.view = {
        kind: "ready",
        ...snapshot,
        receivedAt: this.options.now(),
        refreshError: null,
      };
    } catch (cause) {
      if (this.stopped || current.signal.aborted) {
        return;
      }
      const message = toMessage(cause);
      this.view =
        this.view.kind === "ready"
          ? { ...this.view, refreshError: message }
          : { kind: "error", message };
    } finally {
      if (!this.stopped && this.inFlight === current) {
        this.isRefreshing = false;
        this.emit();
      }
    }
  }
}

export function createTelemetryController<Handle>(
  options: TelemetryControllerOptions<Handle>
): TelemetryController {
  return new RefreshLoop(options);
}
