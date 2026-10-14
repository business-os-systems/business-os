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

  const paddingStyle: React.CSSProperties = {
    paddingTop:
      styles?.paddingTop !== undefined ? `${styles.paddingTop}px` : "64px",
    paddingBottom:
      styles?.paddingBottom !== undefined
        ? `${styles.paddingBottom}px`
        : "64px",
    backgroundColor: styles?.backgroundColor,
    color: styles?.textColor,
  };

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
      style={paddingStyle}
      className={`w-full px-4 sm:px-6 lg:px-8 ${styles?.customClassName || ""}`}
    >
      <div className="max-w-2xl mx-auto">
        <Card className="shadow-lg border border-hairline">
          <CardHeader className="text-center">
            {props.headline ? (
              <CardTitle className="text-2xl sm:text-3xl font-bold font-heading">
                {props.headline}
              </CardTitle>
            ) : null}
            {props.subheadline ? (
              <p className="text-sm text-on-surface-variant mt-2">
                {props.subheadline}
              </p>
            ) : null}
          </CardHeader>

          <CardContent>
            {submitted ? (
              <div className="text-center py-8">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container mb-4">
                  <ShieldCheckIcon size={28} />
                </div>
                <h3 className="text-lg font-semibold font-heading text-on-surface">
                  Thank you!
                </h3>
                <p className="mt-2 text-sm text-on-surface-variant">
                  {props.successMessage || "Your submission has been received."}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {props.fields.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <label
                      htmlFor={field.name}
                      className="block text-sm font-medium text-on-surface"
                    >
                      {field.label}
                      {field.required ? (
                        <span className="text-red-500 ml-1">*</span>
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
                  <p className="text-sm text-red-600 font-medium">{error}</p>
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
