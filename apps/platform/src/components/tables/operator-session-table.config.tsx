import { Button, cn, type TableConfig } from "@suite/ui";
import { formatDateTime } from "@/lib/format";
import type { OperatorSession } from "@/lib/operators-api";

type SessionState = "revoked" | "not-revoked";

const SESSION_STATE_TEXT: Record<
  SessionState,
  { readonly className: string; readonly label: string }
> = {
  revoked: { className: "text-danger", label: "Revoked" },
  "not-revoked": { className: "text-text-secondary", label: "Not revoked" },
};

/** The API owns expiry; the UI only states the recorded revocation fact (FR-093). */
function sessionState(session: OperatorSession): SessionState {
  return session.revokedAt === null ? "not-revoked" : "revoked";
}

export interface OperatorSessionTableActions {
  readonly onRevoke: (session: OperatorSession) => void;
}

function sessionIdentityCell(session: OperatorSession) {
  return <span className="font-mono text-xs text-text">{session.id}</span>;
}

function timestampCell(value: string) {
  return (
    <span className="text-xs text-text-secondary">{formatDateTime(value)}</span>
  );
}

function sessionStateCell(
  session: OperatorSession,
  actions: OperatorSessionTableActions,
) {
  const stateId = sessionState(session);
  const state = SESSION_STATE_TEXT[stateId];
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          "whitespace-nowrap text-xs font-semibold",
          state.className,
        )}
      >
        {state.label}
      </span>
      {stateId === "not-revoked" ? (
        <Button size="sm" variant="ghost" onClick={() => actions.onRevoke(session)}>
          Revoke
        </Button>
      ) : null}
    </div>
  );
}

export function createOperatorSessionTableConfig(
  actions: OperatorSessionTableActions,
): TableConfig<OperatorSession> {
  return {
    id: "platform-operator-session-table",
    emptyState: {
      title: "No control sessions",
      description:
        "This operator has no recorded control-plane session. Sessions appear after a passkey sign-in.",
    },
    columns: [
      {
        key: "id",
        header: "Session",
        width: "30%",
        render: (_value, row) => sessionIdentityCell(row),
      },
      {
        key: "issuedAt",
        header: "Issued",
        width: "18%",
        render: (_value, row) => timestampCell(row.issuedAt),
      },
      {
        key: "expiresAt",
        header: "Expires",
        width: "18%",
        render: (_value, row) => timestampCell(row.expiresAt),
      },
      {
        key: "revokedAt",
        header: "State",
        width: "34%",
        render: (_value, row) => sessionStateCell(row, actions),
      },
    ],
  };
}
