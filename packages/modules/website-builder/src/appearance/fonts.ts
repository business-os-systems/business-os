/**
 * The hosted font registry (FR-015, FR-080). Only families here may be offered
 * to a theme, and the same list feeds the tenant appearance panel, so a theme's
 * choice is a choice a tenant can see and keep.
 *
 * The files are served from /fonts/<file> by every app that renders a site.
 */

export type HostedFontWeight = 400 | 500 | 600 | 700;

export interface HostedFontFile {
  readonly weight: HostedFontWeight;
  readonly style: "normal" | "italic";
  readonly path: string;
}

export interface HostedFontFamily {
  readonly id: string;
  readonly label: string;
  readonly stack: string;
  readonly files: readonly HostedFontFile[];
  readonly status: "hosted";
}

interface FamilyInput {
  readonly id: string;
  readonly label: string;
  readonly stack: string;
  readonly fileStem: string;
  readonly weights: readonly HostedFontWeight[];
}

function family(input: FamilyInput): HostedFontFamily {
  return {
    id: input.id,
    label: input.label,
    stack: input.stack,
    status: "hosted",
    files: input.weights.map((weight) => ({
      weight,
      style: "normal",
      path: `/fonts/${input.fileStem}-${weight}.woff2`,
    })),
  };
}

export const HOSTED_FONT_FAMILIES: readonly HostedFontFamily[] = [
  family({ id: "inter", label: "Inter", stack: "Inter, system-ui, sans-serif", fileStem: "inter", weights: [400, 600, 700] }),
  family({ id: "fraunces", label: "Fraunces", stack: "Fraunces, Georgia, serif", fileStem: "fraunces", weights: [400, 600, 700] }),
  family({ id: "source-sans-3", label: "Source Sans 3", stack: "Source Sans 3, system-ui, sans-serif", fileStem: "source-sans-3", weights: [400, 600] }),
  family({ id: "dm-sans", label: "DM Sans", stack: "DM Sans, system-ui, sans-serif", fileStem: "dm-sans", weights: [400, 600] }),
  family({ id: "plus-jakarta-sans", label: "Plus Jakarta Sans", stack: "Plus Jakarta Sans, system-ui, sans-serif", fileStem: "plus-jakarta-sans", weights: [400, 600] }),
];

export const HOSTED_FONT_STACKS: readonly string[] = HOSTED_FONT_FAMILIES.map(
  (entry) => entry.stack
);

export function hostedFontById(id: string): HostedFontFamily | null {
  return HOSTED_FONT_FAMILIES.find((entry) => entry.id === id) ?? null;
}

/** A theme may only name a family the platform actually serves. */
export function isHostedFontStack(stack: string): boolean {
  return HOSTED_FONT_STACKS.includes(stack.trim());
}
