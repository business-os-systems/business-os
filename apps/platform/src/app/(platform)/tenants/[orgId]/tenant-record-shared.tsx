import { UNAVAILABLE } from "@/lib/format";

export const definitionRowClass =
  "flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0";

export function unavailable(value: string): string {
  return value.trim() === "" ? UNAVAILABLE : value;
}
