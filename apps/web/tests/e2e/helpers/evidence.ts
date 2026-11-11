import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Machine-readable release evidence, consumed by the checklist artifact. */
export const EVIDENCE_DIR = resolve(process.cwd(), "test-results/release-evidence");

interface EvidenceRecord {
  readonly kind: string;
  readonly surface: string;
  readonly url: string;
  readonly capturedAt: string;
  readonly [key: string]: unknown;
}

function evidencePath(kind: string): string {
  return join(EVIDENCE_DIR, kind + ".json");
}

export function recordEvidence(kind: string, record: EvidenceRecord): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = evidencePath(kind);
  let existing: EvidenceRecord[] = [];
  try {
    existing = JSON.parse(readFileSync(path, "utf8")) as EvidenceRecord[];
  } catch {
    existing = [];
  }
  existing.push(record);
  writeFileSync(path, JSON.stringify(existing, null, 2) + "\n");
}

export function writePerfResults(results: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, "perf-results.json"), JSON.stringify(results, null, 2) + "\n");
}
