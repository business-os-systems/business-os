import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FeaturesBlockPropsSchema,
  HeroBlockPropsSchema,
} from "@suite/website-builder/ast";
import {
  catalogFormFields,
  catalogFormFieldsFromPropsSchema,
  fieldText,
  fieldValue,
  type CatalogFormField,
} from "../src/components/catalog/catalog-form.config";

const PROPS_PREFIX = "definition.block.props.";

function pathsOf(fields: readonly CatalogFormField[]): readonly string[] {
  return fields.map((field) => field.path);
}

function fieldAt(fields: readonly CatalogFormField[], path: string): CatalogFormField {
  const field = fields.find((candidate) => candidate.path === path);
  if (field === undefined) {
    throw new Error("No generated field at " + path);
  }
  return field;
}

function selectOptionsOf(field: CatalogFormField) {
  if (field.control === "select" || field.control === "block-type") {
    return field.options;
  }
  throw new Error("Expected a select control");
}

function toSchema(value: unknown): z.ZodTypeAny | null {
  return value instanceof z.ZodType ? value : null;
}

function unwrapForTest(value: unknown): z.ZodTypeAny | null {
  let current = toSchema(value);
  while (current !== null) {
    if (current instanceof z.ZodNullable || current instanceof z.ZodOptional) {
      current = toSchema(current.unwrap());
      continue;
    }
    if (current instanceof z.ZodDefault) {
      current = toSchema(current.removeDefault());
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = toSchema(current.innerType());
      continue;
    }
    return current;
  }
  return null;
}

function declaredProperty(value: unknown, segment: string): unknown {
  const schema = toSchema(value);
  if (schema === null || !(schema instanceof z.ZodObject)) {
    return undefined;
  }
  const shape: unknown = schema.shape;
  if (typeof shape !== "object" || shape === null) {
    return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(shape, segment)) {
    return undefined;
  }
  const next: unknown = Reflect.get(shape, segment);
  return next;
}

/** Walks only the declared object shape; it never guesses a fallback field. */
function declaresPath(schema: z.ZodTypeAny, path: readonly string[]): boolean {
  let current: unknown = schema;
  for (const segment of path) {
    const unwrapped = unwrapForTest(current);
    if (unwrapped === null || !(unwrapped instanceof z.ZodObject)) {
      return false;
    }
    current = declaredProperty(unwrapped, segment);
    if (current === undefined) {
      return false;
    }
  }
  return true;
}

describe("catalog form generation from a declared schema", () => {
  it("generates one field per declared leaf of a synthetic section type", () => {
    const synthetic = z.object({
      headline: z.string().max(120),
      optionalFlag: z.boolean().optional(),
      density: z.union([z.literal(2), z.literal(3)]),
      nested: z
        .object({
          label: z.string().min(1),
          body: z.string().max(500),
        })
        .optional(),
      items: z.array(z.string()),
      records: z.array(z.object({ label: z.string() })),
    });

    const fields = catalogFormFieldsFromPropsSchema(synthetic);

    expect(pathsOf(fields)).toEqual([
      PROPS_PREFIX + "headline",
      PROPS_PREFIX + "optionalFlag",
      PROPS_PREFIX + "density",
      PROPS_PREFIX + "nested.label",
      PROPS_PREFIX + "nested.body",
      PROPS_PREFIX + "items",
    ]);
    expect(fieldAt(fields, PROPS_PREFIX + "headline").required).toBe(true);
    expect(fieldAt(fields, PROPS_PREFIX + "optionalFlag").required).toBe(false);
    expect(fieldAt(fields, PROPS_PREFIX + "nested.label").required).toBe(false);
    expect(fieldAt(fields, PROPS_PREFIX + "nested.body").control).toBe("textarea");
  });

  it("derives a select from a literal union rather than a hand-written option list", () => {
    const synthetic = z.object({ density: z.union([z.literal(2), z.literal(3)]) });
    const field = fieldAt(catalogFormFieldsFromPropsSchema(synthetic), PROPS_PREFIX + "density");

    expect(field.control).toBe("select");
    expect(selectOptionsOf(field)).toEqual([
      { value: "2", label: "2" },
      { value: "3", label: "3" },
    ]);
  });

  it("derives an enum select and keeps the declared description", () => {
    const synthetic = z.object({
      position: z.enum(["left", "right"]).describe("Where the image sits."),
    });
    const field = fieldAt(catalogFormFieldsFromPropsSchema(synthetic), PROPS_PREFIX + "position");

    expect(field.description).toBe("Where the image sits.");
    expect(field.control).toBe("select");
    expect(selectOptionsOf(field).map((option) => option.value)).toEqual(["left", "right"]);
  });

  it("generates nothing from a schema that declares no object shape", () => {
    expect(catalogFormFieldsFromPropsSchema(null)).toEqual([]);
    expect(catalogFormFieldsFromPropsSchema(z.string())).toEqual([]);
  });
});

describe("catalog form generation from the production section declarations", () => {
  it("covers every declared hero property the preset editor edits", () => {
    const fields = catalogFormFields("SECTION", "hero");
    const paths = pathsOf(fields);

    for (const required of [
      "headline",
      "subheadline",
      "badge",
      "primaryCta.label",
      "primaryCta.target.url",
      "secondaryCta.label",
      "secondaryCta.target.url",
      "imageUrl",
      "imageAlt",
      "imagePosition",
    ]) {
      expect(paths).toContain(PROPS_PREFIX + required);
      expect(declaresPath(HeroBlockPropsSchema, required.split("."))).toBe(true);
    }

    const imagePosition = fieldAt(fields, PROPS_PREFIX + "imagePosition");
    expect(imagePosition.control).toBe("select");
    expect(selectOptionsOf(imagePosition).map((option) => option.value)).toEqual([
      "right",
      "left",
      "bottom",
      "background",
    ]);
  });

  it("declares only fields the section type declares", () => {
    const fields = catalogFormFields("SECTION", "hero");
    for (const field of fields) {
      if (!field.path.startsWith(PROPS_PREFIX)) {
        continue;
      }
      const leaf = field.path.slice(PROPS_PREFIX.length).split(".");
      expect(declaresPath(HeroBlockPropsSchema, leaf)).toBe(true);
    }
  });

  it("generates the feature grid column choices from the declared union", () => {
    const field = fieldAt(catalogFormFields("SECTION", "features"), PROPS_PREFIX + "columns");

    expect(field.control).toBe("select");
    expect(selectOptionsOf(field).map((option) => option.value)).toEqual(["2", "3", "4"]);
    expect(declaresPath(FeaturesBlockPropsSchema, ["columns"])).toBe(true);
  });
});

describe("generated field values", () => {
  it("round-trips text, list, nullable, number and boolean values", () => {
    const fields = catalogFormFieldsFromPropsSchema(
      z.object({
        headline: z.string(),
        tags: z.array(z.string()),
        flag: z.string().nullable(),
        count: z.number(),
        enabled: z.boolean(),
      }),
    );

    const draft = {
      definition: {
        block: {
          props: {
            headline: "A headline",
            tags: ["one", "two"],
            flag: null,
            count: 4,
            enabled: true,
          },
        },
      },
    };

    const headline = fieldAt(fields, PROPS_PREFIX + "headline");
    expect(fieldText(headline, draft)).toBe("A headline");
    expect(fieldValue(headline, "Changed")).toBe("Changed");

    const tags = fieldAt(fields, PROPS_PREFIX + "tags");
    expect(fieldText(tags, draft)).toBe("one, two");
    expect(fieldValue(tags, "a, b")).toEqual(["a", "b"]);

    const flag = fieldAt(fields, PROPS_PREFIX + "flag");
    expect(fieldValue(flag, "  ")).toBeNull();
    expect(fieldValue(flag, "on")).toBe("on");

    const count = fieldAt(fields, PROPS_PREFIX + "count");
    expect(fieldText(count, draft)).toBe("4");
    expect(fieldValue(count, "8")).toBe(8);

    const enabled = fieldAt(fields, PROPS_PREFIX + "enabled");
    expect(fieldText(enabled, draft)).toBe("true");
    expect(fieldValue(enabled, "false")).toBe(false);
  });
});
