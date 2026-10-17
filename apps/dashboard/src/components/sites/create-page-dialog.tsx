"use client";

import React, { useState } from "react";
import { z } from "zod";
import { Button, Input, Checkbox, Label } from "@suite/ui";

export const CreatePageSchema = z.object({
  name: z.string().min(2, "Page title must be at least 2 characters").max(80),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  isHome: z.boolean().default(false),
});

export type CreatePageInput = z.infer<typeof CreatePageSchema>;

interface CreatePageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreatePageInput) => void;
}

export function CreatePageDialog({ isOpen, onClose, onSubmit }: CreatePageDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isHome, setIsHome] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = CreatePageSchema.safeParse({
      name,
      slug: isHome ? "index" : slug,
      isHome,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field) {
          fieldErrors[field.toString()] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit(result.data);
    setName("");
    setSlug("");
    setIsHome(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-page-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl border border-border animate-in fade-in zoom-in-95 duration-200">
        <h3 id="create-page-title" className="text-lg font-bold text-text">
          Create New Page
        </h3>
        <p className="text-xs text-text-muted mt-1">
          Add an AST-powered landing page, about page, or promotional showcase.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="create-page-title-input" required className="mb-1">
              Page Title
            </Label>
            <Input
              id="create-page-title-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug && !isHome) {
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                  );
                }
              }}
              placeholder="e.g. About Us"
              className="w-full"
            />
            {errors["name"] && (
              <p className="text-[11px] text-danger mt-1 font-medium">{errors["name"]}</p>
            )}
          </div>

          <div>
            <Label htmlFor="create-page-slug-input" required className="mb-1">
              URL Slug
            </Label>
            <div className="flex items-center rounded-lg border border-border-strong bg-surface overflow-hidden focus-within:ring-2 focus-within:ring-focus-ring">
              <span className="bg-surface-muted px-3 py-2 text-xs font-mono text-text-muted border-r border-border">
                /
              </span>
              <Input
                id="create-page-slug-input"
                disabled={isHome}
                value={isHome ? "index (Root)" : slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="about-us"
                className="w-full border-0 bg-transparent rounded-none focus:ring-0 focus:outline-none shadow-none font-mono text-xs"
              />
            </div>
            {errors["slug"] && (
              <p className="text-[11px] text-danger mt-1 font-medium">{errors["slug"]}</p>
            )}
          </div>

          <div className="pt-1">
            <Checkbox
              id="isHome"
              label="Set as Homepage (Root Route /)"
              checked={isHome}
              onChange={(e) => setIsHome(e.target.checked)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Create Page
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
