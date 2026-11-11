import React, { useState } from "react";
import {
  Button,
  Input,
  Textarea,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@suite/ui";
import { ShieldCheckIcon } from "@suite/ui/icons";
import type { FormBlockProps, BlockStyleTokens } from "../../ast/types.js";
import {
  BLOCK_CARD_SHADOW,
  BLOCK_COLORS,
  BLOCK_FONTS,
  BLOCK_RADII,
  resolveSectionStyle,
} from "./block-tokens.js";

export interface FormBlockComponentProps {
  props: FormBlockProps;
  styles?: BlockStyleTokens;
  onSubmit?: (values: Record<string, unknown>) => Promise<boolean>;
}

export function FormBlock({
  props,
  styles,
  onSubmit,
}: FormBlockComponentProps) {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectionStyle = resolveSectionStyle(styles);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (onSubmit) {
        const ok = await onSubmit(formValues);
        if (ok) {
          setSubmitted(true);
        } else {
          setError(
            props.errorMessage || "Failed to submit form. Please retry.",
          );
        }
      } else {
        setSubmitted(true);
      }
    } catch {
      setError(props.errorMessage || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      data-block-type="form"
      style={sectionStyle}
      className="w-full px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-2xl mx-auto">
        <Card
          className="border"
          style={{
            backgroundColor: BLOCK_COLORS.surface,
            color: BLOCK_COLORS.text,
            borderColor: BLOCK_COLORS.border,
            borderRadius: BLOCK_RADII.md,
            boxShadow: BLOCK_CARD_SHADOW,
          }}
        >
          <CardHeader className="text-center">
            {props.headline ? (
              <CardTitle
                className="text-2xl sm:text-3xl font-bold"
                style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
              >
                {props.headline}
              </CardTitle>
            ) : null}
            {props.subheadline ? (
              <p className="text-sm mt-2" style={{ color: BLOCK_COLORS.textMuted }}>
                {props.subheadline}
              </p>
            ) : null}
          </CardHeader>

          <CardContent>
            {submitted ? (
              <div className="text-center py-8">
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full mb-4"
                  style={{
                    backgroundColor: BLOCK_COLORS.background,
                    color: BLOCK_COLORS.accent,
                  }}
                >
                  <ShieldCheckIcon size={28} />
                </div>
                <h3
                  className="text-lg font-semibold"
                  style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
                >
                  Thank you!
                </h3>
                <p className="mt-2 text-sm" style={{ color: BLOCK_COLORS.textMuted }}>
                  {props.successMessage || "Your submission has been received."}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {props.fields.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <label
                      htmlFor={field.name}
                      className="block text-sm font-medium"
                      style={{ color: BLOCK_COLORS.text }}
                    >
                      {field.label}
                      {field.required ? (
                        <span className="ml-1" style={{ color: BLOCK_COLORS.primary }}>
                          *
                        </span>
                      ) : null}
                    </label>

                    {field.type === "textarea" ? (
                      <Textarea
                        id={field.name}
                        placeholder={field.placeholder}
                        required={field.required}
                        value={formValues[field.name] || ""}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      <Input
                        id={field.name}
                        type={field.type}
                        placeholder={field.placeholder}
                        required={field.required}
                        value={formValues[field.name] || ""}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [field.name]: e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                ))}

                {error ? (
                  <p className="text-sm font-medium" style={{ color: BLOCK_COLORS.primary }}>
                    {error}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full mt-6"
                  isLoading={isSubmitting}
                >
                  {props.submitButtonText || "Submit Inquiry"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
