import { getControlWebauthnRpId } from "../../src/lib/platform-env.js";

/**
 * The relying-party identity the test process is configured with. Session
 * fixtures must use the same value the control-session guard verifies (T182).
 */
export function platformTestRpId(): string {
  return getControlWebauthnRpId();
}
