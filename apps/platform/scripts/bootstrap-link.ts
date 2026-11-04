import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  openSync,
  realpathSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { scrubStringValues } from "@suite/logger";

const BOOTSTRAP_LINK_MODE = 0o600;

/**
 * O_EXCL refuses an existing path, so a pre-created hard link cannot be
 * truncated; O_NOFOLLOW refuses a symlinked destination.
 */
const WRITE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;

function isErrnoCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

/**
 * A symlinked parent directory is still followed by open(), so the parent is
 * resolved and checked before the write is attempted.
 */
function assertSafeDestination(destination: string): void {
  const parent = resolve(dirname(destination));
  const stats = statSync(parent);
  if (!stats.isDirectory()) {
    throw new Error(
      `Refusing to write the bootstrap link: ${parent} is not a directory`
    );
  }
  if (realpathSync(parent) !== parent) {
    throw new Error(
      `Refusing to write the bootstrap link: ${parent} traverses a symbolic link`
    );
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new Error(
      `Refusing to write the bootstrap link: ${parent} is not owned by the current user`
    );
  }
}

/**
 * Writes the single-use bootstrap link to a new regular file owned by this
 * process.
 */
export function writeBootstrapLink(destination: string, link: string): void {
  assertSafeDestination(destination);

  let descriptor: number;
  try {
    descriptor = openSync(destination, WRITE_FLAGS, BOOTSTRAP_LINK_MODE);
  } catch (error) {
    if (isErrnoCode(error, "EEXIST")) {
      throw new Error(
        `Refusing to overwrite ${destination}: remove the existing link file first`
      );
    }
    throw error;
  }

  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new Error(
        `Refusing to write the bootstrap link to ${destination}: destination is not a regular file`
      );
    }
    fchmodSync(descriptor, BOOTSTRAP_LINK_MODE);
    writeSync(descriptor, `${link}\n`);
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Operator-facing error text can carry the bootstrap token or the database URL,
 * so it is scrubbed before it reaches a terminal or a CI log.
 */
export function describeBootstrapFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return scrubStringValues(message);
}
