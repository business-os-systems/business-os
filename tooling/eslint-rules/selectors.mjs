/**
 * Custom architectural selectors shared by eslint.config.mjs and the rule tests.
 * Keep this file free of side effects so RuleTester can import it directly.
 */

const PRESENTATION_PROPS = "variant|label|color|severity|icon|className";
const IDENTITY_PROPS = "name|id|href|appId|permission|description";
// P1 flags any returned object that carries a presentation prop, unless its own
// keys identify it as a configuration/DTO object (an identity field such as
// name, id, href, appId, permission, or description). That keeps form-field
// schemas and DTOs valid while still catching a presentation object that mixes
// in unrelated data, for example { label, className, value }.
const presentationProperty = "Property[key.name=/^(" + PRESENTATION_PROPS + ")$/]";
const identityProperty = "Property[key.name=/^(" + IDENTITY_PROPS + ")$/]";
const presentationPropSelector =
  "> ObjectExpression:has(> " + presentationProperty + "):not(:has(> " + identityProperty + "))";
const P1_GUIDE = "See tooling/quality/engineering-standards.md#p1.";

export const P1_SELECTORS = [
  {
    selector: "IfStatement ReturnStatement " + presentationPropSelector,
    message:
      "Do not return UI props from if/else. Derive a typed state, then map it with as const satisfies Record<State, ...>. " +
      P1_GUIDE,
  },
  {
    selector: "SwitchCase ReturnStatement " + presentationPropSelector,
    message:
      "Do not return UI props from switch. Derive a typed state, then map it with as const satisfies Record<State, ...>. " +
      P1_GUIDE,
  },
  {
    selector:
      "IfStatement ReturnStatement > TSAsExpression > TSTypeReference > Identifier[name='const']",
    message:
      "Do not inline as const on a conditional return. Declare the state and its map once. " +
      P1_GUIDE,
  },
  {
    selector:
      "SwitchCase ReturnStatement > TSAsExpression > TSTypeReference > Identifier[name='const']",
    message:
      "Do not inline as const on a conditional return. Declare the state and its map once. " +
      P1_GUIDE,
  },
];

export const PROCESS_ENV_SELECTOR = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message:
    "Read configuration through the validated config module, not process.env. See tooling/quality/engineering-standards.md#p14.",
};

export const DANGEROUS_HTML_SELECTOR = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message:
    "Do not inject raw HTML. Render structured content or sanitise it explicitly. See tooling/quality/engineering-standards.md#p17.",
};

export const RESTRICTED_ORM_IMPORTS = {
  group: ["@suite/db", "@suite/db/*", "@prisma/client", "prisma", "prisma/*"],
  message:
    "Presentation and transport code must not import the ORM. Move the query into a service. See tooling/quality/engineering-standards.md#p2.",
};

export const RESTRICTED_CACHE_IMPORTS = {
  group: ["@suite/redis", "@suite/redis/*", "ioredis"],
  message:
    "Presentation and transport code must not import the cache client. Move the access into a service. See tooling/quality/engineering-standards.md#p2.",
};

export const RESTRICTED_UI_IMPORTS = {
  group: ["react", "react-dom", "next", "next/*", "@suite/ui"],
  message:
    "Domain code must stay free of UI framework imports. See tooling/quality/engineering-standards.md#p2.",
};
export const PAGE_LEVEL_TABLIST_SELECTOR = {
  selector: "JSXAttribute[name.name='role'][value.value='tablist']",
  message:
    'Page-level role="tablist" is forbidden by the Hub Navigation Law (H-3.1, H-2): a surface with 4+ destinations, extensible destinations or configuration uses a routed hub; only in-panel tabs (modal, drawer, inspector) may use a tablist. See DESIGN.md §4.7 and AGENTS.md §5.',
};
