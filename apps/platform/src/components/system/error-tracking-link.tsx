import { isHttpUrl } from "@/lib/system-api";
import { INLINE_LINK_CLASS } from "./system.config";

export interface ErrorTrackingLinkProps {
  readonly href: string | null;
}

/**
 * FR-036: one action from the control plane to the external error console. The
 * destination is validated in the API and re-checked here, because this is the
 * sink that writes it into an anchor href (SCR-002).
 */
export function ErrorTrackingLink({ href }: ErrorTrackingLinkProps) {
  if (href === null || !isHttpUrl(href)) {
    return (
      <p className="text-sm text-text-secondary">
        The external error-tracking console is not configured for this
        deployment. Declare PLATFORM_ERROR_TRACKING_URL to enable the one-click
        link.
      </p>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-md text-sm ${INLINE_LINK_CLASS}`}
    >
      Open error-tracking console
      <span aria-hidden="true">↗</span>
    </a>
  );
}
