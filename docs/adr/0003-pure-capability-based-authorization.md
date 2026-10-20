# ADR-0003: Pure Capability-Based Authorization over Static Role Slugs

## Context and Problem Statement
Traditional RBAC implementations often rely on hardcoded role string checks (e.g., `role === "admin"`, `user.role === "owner"`). In a multi-tenant business operating system with customizable roles, dynamic permissions, and granular multi-branch hierarchies, static role checks create brittle security holes, prevent custom role authoring, and fail when organizational titles change.

## Decision Drivers
- Roles are human-readable, mutable organizational titles, not security capabilities.
- Organizations require custom roles with custom permission subsets.
- Authorization decisions must be deterministic, auditable, and fail-closed.

## Considered Options
1. Static role-based checks (`role === "owner" || role === "admin"`).
2. Pure capability-based access control where actors possess permission codes (e.g. `settings:members:create`), and roles dynamically map to permissions.
3. Complex ABAC (Attribute-Based Access Control) engine with runtime policy scripts.

## Decision Outcome
Chosen Option: **Option 2 (Pure Capability-Based Access Control)**.
- Engineers and AI agents are **STRICTLY PROHIBITED** from hardcoding role names in route handlers, middleware, services, or UI components.
- All authorization gates MUST evaluate capability claims via `hasPermission(claims, requiredPermission)` from `@suite/core`.
- Permissions are canonical strings defined in `@suite/core` (`PERMISSIONS` constant registry).
- Wildcard permissions (`*`, `settings:*`, `apps:*`) are supported and evaluated hierarchically.
- Missing or empty permission contexts strictly fail-closed.

### Consequences
- **Positive:** Tenants can create, customize, rename, and delete roles freely without breaking runtime security or requiring code deployments.
- **Negative:** Requires resolving effective permission arrays on authentication and session updates.
