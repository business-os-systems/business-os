"use client";

import React, { useState } from "react";
import { z } from "zod";
import { Button, Input, Checkbox } from "@suite/ui";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <h3 id="create-page-title" className="text-lg font-bold text-slate-900">
          Create New Page
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Add an AST-powered landing page, about page, or promotional showcase.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Page Title *
            </label>
            <Input
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
              <p className="text-[11px] text-red-600 mt-1 font-medium">{errors["name"]}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              URL Slug *
            </label>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <span className="bg-slate-50 px-3 py-2 text-xs font-mono text-slate-500 border-r border-slate-200">
                /
              </span>
              <input
                disabled={isHome}
                value={isHome ? "index (Root)" : slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="about-us"
                className="w-full px-3 py-2 text-sm text-slate-900 outline-none disabled:bg-slate-50 disabled:text-slate-400 font-mono text-xs"
              />
            </div>
            {errors["slug"] && (
              <p className="text-[11px] text-red-600 mt-1 font-medium">{errors["slug"]}</p>
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

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="default" size="sm">
              Create Page
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
