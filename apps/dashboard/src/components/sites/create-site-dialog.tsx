"use client";

import React, { useState } from "react";
import { z } from "zod";
import { Button, Input } from "@suite/ui";

export const CreateSiteSchema = z.object({
  name: z.string().min(2, "Site name must be at least 2 characters").max(60),
  subdomain: z
    .string()
    .min(2, "Subdomain must be at least 2 characters")
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Subdomain can only contain lowercase letters, numbers, and hyphens"),
  customDomain: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(val),
      "Invalid custom domain format (e.g. www.example.com)"
    ),
});

export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;

interface CreateSiteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSiteInput) => void;
}

export function CreateSiteDialog({ isOpen, onClose, onSubmit }: CreateSiteDialogProps) {
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = CreateSiteSchema.safeParse({
      name,
      subdomain,
      customDomain: customDomain || undefined,
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
    setSubdomain("");
    setCustomDomain("");
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-site-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl border border-border animate-in fade-in zoom-in-95 duration-200">
        <h3 id="create-site-title" className="text-lg font-bold text-text">
          Create New Website
        </h3>
        <p className="text-xs text-text-muted mt-1">
          Deploy an edge-rendered multi-page website or storefront.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Website Name *
            </label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!subdomain) {
                  setSubdomain(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                  );
                }
              }}
              placeholder="e.g. Acme Corporation"
              className="w-full"
            />
            {errors["name"] && (
              <p className="text-[11px] text-danger mt-1 font-medium">{errors["name"]}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Platform Subdomain *
            </label>
            <div className="flex items-center rounded-lg border border-border-strong bg-surface overflow-hidden focus-within:ring-2 focus-within:ring-focus-ring">
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                placeholder="acme-corp"
                className="w-full px-3 py-2 text-sm text-text bg-transparent outline-none"
              />
              <span className="bg-surface-muted px-3 py-2 text-xs font-mono text-text-muted border-l border-border">
                .business-os.site
              </span>
            </div>
            {errors["subdomain"] && (
              <p className="text-[11px] text-danger mt-1 font-medium">{errors["subdomain"]}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Custom Domain (Optional)
            </label>
            <Input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="e.g. riverside.com"
              className="w-full font-mono text-xs"
            />
            {errors["customDomain"] && (
              <p className="text-[11px] text-danger mt-1 font-medium">{errors["customDomain"]}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="default" size="sm">
              Create Website
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
