import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import type { FormConfig } from "@suite/ui";
import { ConfigFormRenderer } from "../src/components/config-renderers/config-form-renderer.js";

interface TestOrgForm {
  name: string;
  slug: string;
  currency: string;
  bio?: string;
  isActive: boolean;
  adminSecret?: string;
}

const testFormConfig: FormConfig<TestOrgForm> = {
  id: "org-general-settings",
  title: "Organization Profile",
  description: "Manage your legal entity and business attributes",
  sections: [
    {
      id: "general-section",
      title: "Legal Identity",
      description: "Official entity name and primary currency",
      fields: [
        {
          name: "name",
          label: "Organization Name",
          type: "text",
          placeholder: "Riverview Homestay",
          required: true,
          colSpan: 1,
        },
        {
          name: "slug",
          label: "Workspace Slug",
          type: "text",
          placeholder: "riverview-homestay",
          required: true,
          colSpan: 1,
        },
        {
          name: "currency",
          label: "Primary Currency",
          type: "select",
          options: [
            { label: "INR (₹)", value: "INR" },
            { label: "USD ($)", value: "USD" },
          ],
          defaultValue: "INR",
          colSpan: 1,
        },
        {
          name: "isActive",
          label: "Active Operations",
          type: "switch",
          placeholder: "Enable active booking engine",
          colSpan: 1,
        },
        {
          name: "bio",
          label: "Public Description",
          type: "textarea",
          colSpan: 2,
        },
        {
          name: "adminSecret",
          label: "Admin Key",
          type: "password",
          permission: "core:superadmin:view",
          colSpan: 2,
        },
      ],
    },
    {
      id: "danger-section",
      title: "Delete Organization",
      description: "Permanently delete workspace and terminate subscriptions",
      isDangerZone: true,
      dangerConfirmationSlug: "DELETE-RIVERVIEW",
      fields: [],
    },
  ],
  stickyActionBar: {
    saveLabel: "Save Profile",
    discardLabel: "Reset",
    showDiscard: true,
  },
};

const testSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z.string().min(2, "Slug must be at least 2 characters"),
  currency: z.string(),
  bio: z.string().optional(),
  isActive: z.boolean(),
  adminSecret: z.string().optional(),
});

describe("ConfigFormRenderer Declarative Engine", () => {
  it("renders form sections, field labels, placeholders and inputs", () => {
    const html = renderToString(
      <ConfigFormRenderer
        config={testFormConfig}
        initialValues={{ name: "Riverview", slug: "riverview", currency: "INR", isActive: true }}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain("Organization Profile");
    expect(html).toContain("Legal Identity");
    expect(html).toContain("Organization Name");
    expect(html).toContain("Workspace Slug");
    expect(html).toContain("Primary Currency");
    expect(html).toContain("Public Description");
    expect(html).toContain("Riverview");
    expect(html).toContain("riverview");
  });

  it("gates fields based on required user capabilities", () => {
    // User without 'core:superadmin:view'
    const htmlWithoutPerm = renderToString(
      <ConfigFormRenderer
        config={testFormConfig}
        userPermissions={["core:organization:read", "core:organization:update"]}
        onSubmit={vi.fn()}
      />
    );
    expect(htmlWithoutPerm).not.toContain("Admin Key");

    // User with 'core:superadmin:view'
    const htmlWithPerm = renderToString(
      <ConfigFormRenderer
        config={testFormConfig}
        userPermissions={["core:superadmin:view"]}
        onSubmit={vi.fn()}
      />
    );
    expect(htmlWithPerm).toContain("Admin Key");
  });

  it("renders danger zone section with expected slug", () => {
    const html = renderToString(
      <ConfigFormRenderer
        config={testFormConfig}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain("Delete Organization");
    expect(html).toContain("Permanently delete workspace");
  });

  it("renders sticky action bar with custom save and discard labels", () => {
    const html = renderToString(
      <ConfigFormRenderer
        config={testFormConfig}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain("Save Profile");
    expect(html).toContain("Reset");
  });

  it("accepts Zod validationSchema and renders initial valid state", () => {
    const html = renderToString(
      <ConfigFormRenderer
        config={testFormConfig}
        validationSchema={testSchema}
        initialValues={{ name: "Acme Corp", slug: "acme-corp", currency: "USD", isActive: true }}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain("Acme Corp");
    expect(html).toContain("acme-corp");
  });
});
