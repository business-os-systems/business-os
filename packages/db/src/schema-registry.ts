/**
 * One registry for every database schema and every table-owning application.
 *
 * The guard is intentionally data-driven: a new schema or a new modular app
 * must be declared here before its tables can ship (FR-077, FR-078, DB-3,
 * DB-4). The migration and Prisma schema are the source of truth; this file
 * names the owner and the mandatory table prefix.
 */
export interface SchemaOwner {
  readonly owner: string;
  readonly schema: string;
  /** null means the owner's tables are declared explicitly in its Prisma file. */
  readonly tablePrefix: string | null;
  readonly prismaFile: string;
  readonly description: string;
}

export const SCHEMA_OWNERSHIP = [
  {
    owner: "core",
    schema: "public",
    tablePrefix: null,
    prismaFile: "core.prisma",
    description: "Core platform identity, tenancy and organization tables.",
  },
  {
    owner: "website-builder",
    schema: "cms",
    tablePrefix: "cms_",
    prismaFile: "cms.prisma",
    description:
      "Website Builder / CMS tables, namespaced with the cms_ prefix in the dedicated cms schema.",
  },
  {
    owner: "media",
    schema: "public",
    tablePrefix: "media_",
    prismaFile: "media.prisma",
    description:
      "Shared media library owned by the workspace, namespaced in the public schema.",
  },
  {
    owner: "feature-flags",
    schema: "public",
    tablePrefix: "system_",
    prismaFile: "feature-flags.prisma",
    description: "System feature flags and their audit tables.",
  },
  {
    owner: "platform",
    schema: "platform",
    tablePrefix: null,
    prismaFile: "platform.prisma",
    description: "Operator control plane: identity, sessions, quotas, audit.",
  },
  {
    owner: "reference",
    schema: "reference",
    tablePrefix: null,
    prismaFile: "reference.prisma",
    description: "Shared reference catalogs readable by every application role.",
  },
] as const satisfies readonly SchemaOwner[];

export class SchemaOwnershipViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaOwnershipViolation";
  }
}

export interface TableOwnershipInput {
  readonly schema: string;
  readonly table: string;
  /** owner -> table names declared in that owner's Prisma file. */
  readonly tablesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
}

export function registeredSchemas(): readonly string[] {
  return [...new Set(SCHEMA_OWNERSHIP.map((owner) => owner.schema))];
}

export function assertTableOwnership(input: TableOwnershipInput): void {
  const owners = SCHEMA_OWNERSHIP.filter((owner) => owner.schema === input.schema);
  if (owners.length === 0) {
    throw new SchemaOwnershipViolation(
      `Unregistered schema "${input.schema}" for table "${input.table}". Declare it in SCHEMA_OWNERSHIP.`,
    );
  }

  const owned = owners.some((owner) => {
    if (owner.tablePrefix !== null) {
      return input.table.startsWith(owner.tablePrefix);
    }
    return input.tablesByOwner.get(owner.owner)?.has(input.table) ?? false;
  });

  if (!owned) {
    throw new SchemaOwnershipViolation(
      `Table "${input.schema}.${input.table}" is not owned by a registered prefix or declared table. Add the owner or the prefix to SCHEMA_OWNERSHIP.`,
    );
  }
}
