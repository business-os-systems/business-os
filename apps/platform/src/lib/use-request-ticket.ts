"use client";

import { useCallback, useMemo, useRef } from "react";

/**
 * One monotonic ticket per request sequence. A slow earlier response compares
 * its ticket with the current one and is discarded when a newer request began.
 */
export function useRequestTicket() {
  const ticket = useRef(0);

  const begin = useCallback(() => {
    ticket.current += 1;
    return ticket.current;
  }, []);

  const isCurrent = useCallback(
    (value: number) => ticket.current === value,
    []
  );

  const current = useCallback(() => ticket.current, []);

  return useMemo(
    () => ({ begin, isCurrent, current }),
    [begin, isCurrent, current]
  );
}
