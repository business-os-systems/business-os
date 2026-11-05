import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ConfigTable } from "../src/components/tables/config-table";
import { createFlagsTableConfig } from "../src/components/flags/flags-table.config";
import {
  EMPTY_FLAG_FORM,
  FLAG_FORM_FIELDS,
  buildCreateFlagBody,
  validateFlagForm,
  type FlagFormValues,
} from "../src/components/flags/flag-form.config";
import {
  FLAG_RULE_FORM_FIELDS,
  buildRuleInput,
  flagRuleFormFields,
  validateRuleForm,
} from "../src/components/flags/flag-rule.config";
import {
  buildLifecycleUpdate,
  toFlagLifecycleForm,
} from "../src/components/flags/flag-lifecycle.config";
import { FlagsToolbar } from "../src/app/(platform)/flags/flags-toolbar";
import {
  FLAG_ENVIRONMENTS,
  FLAG_RULE_TYPES,
  formatFlagEnvironment,
  type FlagRecord,
} from "../src/lib/flags-api";

const VALID_FORM: FlagFormValues = {
  ...EMPTY_FLAG_FORM,
  key: "pos.offline_mode",
  name: "Offline mode",
  description: "Queues orders while the network is down.",
  environment: FLAG_ENVIRONMENTS[2],
  owner: "pos-team@example.com",
  expiresAt: "2099-01-01T10:00",
  removalTicket: "#224",
};

const FLAG: FlagRecord = {
  id: "flag_1",
  key: "pos.offline_mode",
  name: "Offline mode",
  description: null,
  environment: FLAG_ENVIRONMENTS[2],
  isEnabled: true,
  defaultEnabled: true,
  version: 2,
  owner: "pos-team@example.com",
  expiresAt: "2027-01-01T00:00:00.000Z",
  removalTicket: "#224",
  isExpired: false,
  lifecycleComplete: true,
  rules: [
    {
      id: "rule_1",
      ruleType: FLAG_RULE_TYPES[0],
      targetId: "org_probe",
      enabled: true,
      priority: 10,
    },
  ],
  createdAt: "2026-11-04T00:00:00.000Z",
  updatedAt: "2026-11-04T00:00:00.000Z",
};

describe("Environment labels", () => {
  it("capitalises the display label without changing the stored value", () => {
    expect(formatFlagEnvironment(FLAG_ENVIRONMENTS[0])).toBe("Development");
    expect(formatFlagEnvironment(FLAG_ENVIRONMENTS[1])).toBe("Staging");
    expect(formatFlagEnvironment(FLAG_ENVIRONMENTS[2])).toBe("Production");
  });
});

describe("Flag create form", () => {
  it("declares a namespaced key field and a select environment", () => {
    const key = FLAG_FORM_FIELDS.find((field) => field.name === "key");
    expect(key?.placeholder).toBe("pos.offline_mode");
    expect(key?.type).toBe("text");
    if (key?.type === "text") {
      expect(key.maxLength).toBe(64);
    }
    const environment = FLAG_FORM_FIELDS.find(
      (field) => field.name === "environment"
    );
    expect(environment?.type).toBe("select");
    if (environment?.type === "select") {
      expect(environment.options.map((option) => option.value)).toEqual([
        ...FLAG_ENVIRONMENTS,
      ]);
    }
  });

  it("accepts a complete future-dated flag", () => {
    expect(validateFlagForm(VALID_FORM)).toEqual({});
  });

  it("rejects an unnamespaced or malformed key", () => {
    expect(validateFlagForm({ ...VALID_FORM, key: "offline" }).key).toBeDefined();
    expect(
      validateFlagForm({ ...VALID_FORM, key: "Offline Mode" }).key
    ).toBeDefined();
  });

  it("rejects a past expiry", () => {
    const errors = validateFlagForm({
      ...VALID_FORM,
      expiresAt: "2020-01-01T00:00",
    });
    expect(errors.expiresAt).toBeDefined();
  });

  it("rejects a removal ticket without an issue reference", () => {
    const errors = validateFlagForm({ ...VALID_FORM, removalTicket: "later" });
    expect(errors.removalTicket).toBeDefined();
  });

  it("builds an ISO expiry for the API", () => {
    const body = buildCreateFlagBody(VALID_FORM);
    expect(body.environment).toBe(FLAG_ENVIRONMENTS[2]);
    expect(body.key).toBe("pos.offline_mode");
    expect(new Date(body.expiresAt).getTime()).toBe(
      new Date(VALID_FORM.expiresAt + "Z").getTime()
    );
  });
});

describe("Flag lifecycle form", () => {
  it("edits the default fallback separately from the master switch", () => {
    const values = toFlagLifecycleForm(FLAG);
    expect(values.defaultEnabled).toBe("true");
    expect(values.expiresAt).toBe("2027-01-01T00:00");
    const update = buildLifecycleUpdate({
      ...values,
      owner: "ops@example.com",
      removalTicket: "224",
      defaultEnabled: "false",
    });
    expect(update.defaultEnabled).toBe(false);
    expect(update.owner).toBe("ops@example.com");
    expect(update.removalTicket).toBe("#224");
    expect(update.expiresAt).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("Flag rules form", () => {
  it("declares tenant and environment targeting", () => {
    const ruleType = FLAG_RULE_FORM_FIELDS.find(
      (field) => field.name === "ruleType"
    );
    expect(ruleType?.type).toBe("select");
    if (ruleType?.type === "select") {
      expect(ruleType.options.map((option) => option.value)).toEqual([
        ...FLAG_RULE_TYPES,
      ]);
    }
  });

  it("rejects an empty target and a priority above 1000", () => {
    const errors = validateRuleForm({
      ruleType: FLAG_RULE_TYPES[0],
      targetId: "",
      enabled: "true",
      priority: "1001",
    });
    expect(errors.targetId).toBeDefined();
    expect(errors.priority).toBeDefined();
  });

  it("switches the target to a select for environment rules", () => {
    const environmentFields = flagRuleFormFields(FLAG_RULE_TYPES[1]);
    const target = environmentFields.find((field) => field.name === "targetId");
    expect(target?.type).toBe("select");
    if (target?.type === "select") {
      expect(target.options.map((option) => option.value)).toEqual([
        ...FLAG_ENVIRONMENTS,
      ]);
    }
  });

  it("builds a typed rule input", () => {
    expect(
      buildRuleInput({
        ruleType: FLAG_RULE_TYPES[1],
        targetId: FLAG_ENVIRONMENTS[2],
        enabled: "false",
        priority: "5",
      })
    ).toEqual({
      ruleType: FLAG_RULE_TYPES[1],
      targetId: FLAG_ENVIRONMENTS[2],
      enabled: false,
      priority: 5,
    });
  });
});

describe("Flags table", () => {
  it("renders the flag, state, owner and targeting summary", () => {
    const html = renderToString(
      <ConfigTable
        config={createFlagsTableConfig({
          onToggle: () => undefined,
          onRules: () => undefined,
          onEdit: () => undefined,
        })}
        rows={[FLAG]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.key}
      />
    );
    expect(html).toContain("pos.offline_mode");
    expect(html).toContain("Offline mode");
    expect(html).toContain("Production");
    expect(html).not.toContain(">production<");
    expect(html).toContain("On");
    expect(html).toContain("pos-team@example.com");
    expect(html).toContain("1 tenant");
    expect(html).toContain("Disable");
    expect(html).toContain("Rules");
  });

  it("marks an expired flag and disables its toggle", () => {
    const html = renderToString(
      <ConfigTable
        config={createFlagsTableConfig({
          onToggle: () => undefined,
          onRules: () => undefined,
          onEdit: () => undefined,
        })}
        rows={[{ ...FLAG, isExpired: true, isEnabled: false }]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.key}
      />
    );
    expect(html).toContain("Expired");
    expect(html).toMatch(/disabled/);
  });

  it("renders a targeted state when rules exist and the default is off", () => {
    const html = renderToString(
      <ConfigTable
        config={createFlagsTableConfig({
          onToggle: () => undefined,
          onRules: () => undefined,
          onEdit: () => undefined,
        })}
        rows={[{ ...FLAG, isEnabled: true, defaultEnabled: false }]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.key}
      />
    );
    expect(html).toContain("Targeted");
    expect(html).toContain("text-brand");
    expect(html).not.toContain(">On<");
  });

  it("renders master-on only when no rule can turn the flag on", () => {
    const html = renderToString(
      <ConfigTable
        config={createFlagsTableConfig({
          onToggle: () => undefined,
          onRules: () => undefined,
          onEdit: () => undefined,
        })}
        rows={[
          {
            ...FLAG,
            isEnabled: true,
            defaultEnabled: false,
            rules: [],
          },
        ]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.key}
      />
    );
    expect(html).toContain("Master on");
    expect(html).toContain("text-warning");
  });

  it("renders a genuine empty state instead of a blank table", () => {
    const html = renderToString(
      <ConfigTable
        config={createFlagsTableConfig({
          onToggle: () => undefined,
          onRules: () => undefined,
          onEdit: () => undefined,
        })}
        rows={[]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.key}
      />
    );
    expect(html).toContain("No feature flags yet");
  });
});

describe("Flags toolbar accessibility", () => {
  it("labels the environment filter and says the count is a page", () => {
    const html = renderToString(
      <FlagsToolbar
        environment="all"
        total={2}
        isBusy={false}
        onChange={() => undefined}
        onCreate={() => undefined}
      />
    );
    expect(html).toContain("Environment");
    expect(html).toMatch(/Showing[\s\S]*2[\s\S]*flags/);
    expect(html).toContain("New flag");
  });
});
