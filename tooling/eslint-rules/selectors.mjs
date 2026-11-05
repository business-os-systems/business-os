/**
 * Custom architectural selectors shared by eslint.config.mjs and the rule tests.
 * Keep this file free of side effects so RuleTester can import it directly.
 */

const PRESENTATION_PROPS = "variant|label|color|severity|icon|className";
const presentationPropSelector =
  "> ObjectExpression:has(> Property[key.name=/^(" + PRESENTATION_PROPS + ")$/])";

export const P1_SELECTORS = [
  {
    selector: "IfStatement ReturnStatement " + presentationPropSelector,
    message:
      "Do not return UI props from if/else. Derive a typed state, then map it with as const satisfies Record<State, ...>. See docs/engineering-standards.md#p1.",
  },
  {
    selector: "SwitchCase ReturnStatement " + presentationPropSelector,
    message:
      "Do not return UI props from switch. Derive a typed state, then map it with as const satisfies Record<State, ...>. See docs/engineering-standards.md#p1.",
  },
  {
    selector:
      "IfStatement ReturnStatement > TSAsExpression > TSTypeReference > Identifier[name='const']",
    message:
      "Do not inline as const on a conditional return. Declare the state and its map once. See docs/engineering-standards.md#p1.",
  },
  {
    selector:
      "SwitchCase ReturnStatement > TSAsExpression > TSTypeReference > Identifier[name='const']",
    message:
      "Do not inline as const on a conditional return. Declare the state and its map once. See docs/engineering-standards.md#p1.",
  },
];

export const PROCESS_ENV_SELECTOR = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message:
    "Read configuration through the validated config module, not process.env. See docs/engineering-standards.md#p14.",
};

export const DANGEROUS_HTML_SELECTOR = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message:
    "Do not inject raw HTML. Render structured content or sanitise it explicitly. See docs/engineering-standards.md#p17.",
};

export const RESTRICTED_ORM_IMPORTS = {
  group: ["@suite/db", "@suite/db/*", "@prisma/client", "prisma", "prisma/*"],
  message:
    "Presentation and transport code must not import the ORM. Move the query into a service. See docs/engineering-standards.md#p2.",
};

export const RESTRICTED_CACHE_IMPORTS = {
  group: ["@suite/redis", "@suite/redis/*", "ioredis"],
  message:
    "Presentation and transport code must not import the cache client. Move the access into a service. See docs/engineering-standards.md#p2.",
};

export const RESTRICTED_UI_IMPORTS = {
  group: ["react", "react-dom", "next", "next/*", "@suite/ui"],
  message:
    "Domain code must stay free of UI framework imports. See docs/engineering-standards.md#p2.",
};
