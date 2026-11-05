import { Alert } from "@suite/ui";

/** Both operator routes render this, so the direct-visit denial cannot drift. */
export function OperatorCapabilityDenied() {
  return (
    <Alert
      variant="error"
      title="Capability denied"
      message="Your operator account cannot manage operators."
    />
  );
}
