"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPlatformHealth,
  fetchQueueMetrics,
} from "@/lib/system-api";
import {
  createTelemetryController,
  type TelemetryController,
  type TelemetryControllerState,
  type TelemetrySnapshot,
  type TelemetryView,
} from "./telemetry-controller";
import { SYSTEM_REFRESH_INTERVAL_MS } from "./system.config";

export type { TelemetryView } from "./telemetry-controller";

export interface SystemTelemetry {
  readonly view: TelemetryView;
  readonly isRefreshing: boolean;
  readonly refresh: () => void;
}

export interface UseSystemTelemetryOptions {
  /** False when the operator lacks platform:telemetry:read (the shell denies the screen). */
  readonly enabled: boolean;
}

const INITIAL_STATE: TelemetryControllerState = {
  view: { kind: "loading" },
  isRefreshing: false,
};

async function readSnapshot(signal: AbortSignal): Promise<TelemetrySnapshot> {
  const [health, queues] = await Promise.all([
    fetchPlatformHealth(signal),
    fetchQueueMetrics(signal),
  ]);
  return { health, queues };
}

/** React adapter over the framework-free telemetry controller (FR-037). */
export function useSystemTelemetry({
  enabled,
}: UseSystemTelemetryOptions): SystemTelemetry {
  const [state, setState] = useState<TelemetryControllerState>(INITIAL_STATE);
  const controllerRef = useRef<TelemetryController | null>(null);

  controllerRef.current ??= createTelemetryController<
    ReturnType<typeof setInterval>
  >({
    load: readSnapshot,
    intervalMs: SYSTEM_REFRESH_INTERVAL_MS,
    onChange: setState,
    now: () => new Date().toISOString(),
    setTimer: (handler, intervalMs) => setInterval(handler, intervalMs),
    clearTimer: (handle) => clearInterval(handle),
  });
  const controller = controllerRef.current;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    controller.start();
    return () => controller.stop();
  }, [controller, enabled]);

  const refresh = useCallback(() => controller.refresh(), [controller]);

  return { view: state.view, isRefreshing: state.isRefreshing, refresh };
}
