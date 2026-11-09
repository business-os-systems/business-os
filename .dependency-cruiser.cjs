/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "A cycle makes ownership and load order ambiguous. Break it with a pure shared module.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-domain-to-ui",
      severity: "error",
      comment:
        "Domain packages must not depend on apps or the UI kit. See tooling/quality/engineering-standards.md#p2.",
      from: { path: "^packages/(core|flags|auth|db|redis|logger)/" },
      to: { path: "^(packages/ui|apps)/" },
    },
    {
      name: "no-ui-to-data",
      severity: "error",
      comment:
        "UI packages must not read the database or cache. See tooling/quality/engineering-standards.md#p2.",
      from: { path: "^packages/ui/" },
      to: { path: "^packages/(db|redis)/" },
    },
    {
      name: "no-route-to-orm",
      severity: "error",
      comment:
        "Routes validate, call a service and map the result; they do not query Prisma. See tooling/quality/engineering-standards.md#p2.",
      from: { path: "^apps/api/src/routes/" },
      to: { path: "^packages/db/" },
    },
    {
      name: "no-next-app-to-orm",
      severity: "error",
      comment:
        "Next.js presentation code must call an API, not the database. See tooling/quality/engineering-standards.md#p2.",
      from: {
        path: "^apps/(dashboard|platform)/src/",
        pathNot: "^apps/(dashboard|platform)/src/app/api/",
      },
      to: { path: "^packages/db/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    exclude: { path: "(^|/)(dist|coverage|\\.next|node_modules|graphify-out)/" },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/[^/]+" },
    },
  },
};
