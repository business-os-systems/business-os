import { PageAstSchema, BlockAstSchema, SectionAstSchema } from "./schema.js";
import type { PageAst, BlockAst, SectionAst } from "./types.js";
import { z } from "zod";

export interface AstValidationSuccess<T> {
  success: true;
  data: T;
}

export interface AstValidationErrorDetail {
  path: string;
  message: string;
  code: string;
}

export interface AstValidationFailure {
  success: false;
  errorCode: "INVALID_AST_PAYLOAD";
  message: string;
  errors: AstValidationErrorDetail[];
}

export type AstValidationResult<T> =
  | AstValidationSuccess<T>
  | AstValidationFailure;

function formatZodIssues(issues: z.ZodIssue[]): AstValidationErrorDetail[] {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validates an arbitrary payload against PageAstSchema.
 * Guaranteed zero-eval and strict property verification.
 */
export function validatePageAst(payload: unknown): AstValidationResult<PageAst> {
  const result = PageAstSchema.safeParse(payload);
  if (!result.success) {
    return {
      success: false,
      errorCode: "INVALID_AST_PAYLOAD",
      message: "The provided Page AST payload failed structural validation.",
      errors: formatZodIssues(result.error.issues),
    };
  }
  return {
    success: true,
    data: result.data as PageAst,
  };
}

/**
 * Validates a section payload against SectionAstSchema.
 */
export function validateSectionAst(
  payload: unknown
): AstValidationResult<SectionAst> {
  const result = SectionAstSchema.safeParse(payload);
  if (!result.success) {
    return {
      success: false,
      errorCode: "INVALID_AST_PAYLOAD",
      message: "The provided Section AST payload failed structural validation.",
      errors: formatZodIssues(result.error.issues),
    };
  }
  return {
    success: true,
    data: result.data as SectionAst,
  };
}

/**
 * Validates a block payload against BlockAstSchema.
 */
export function validateBlockAst(
  payload: unknown
): AstValidationResult<BlockAst> {
  const result = BlockAstSchema.safeParse(payload);
  if (!result.success) {
    return {
      success: false,
      errorCode: "INVALID_AST_PAYLOAD",
      message: "The provided Block AST payload failed structural validation.",
      errors: formatZodIssues(result.error.issues),
    };
  }
  return {
    success: true,
    data: result.data as BlockAst,
  };
}
