import { describe, expect, it } from "vitest";
import {
  FLAG_ENVIRONMENTS,
  FLAG_RULE_TYPES,
} from "@suite/flags/contracts";
import {
  createFlagBodySchema,
  flagRuleSchema,
  flagSchema,
  updateFlagBodySchema,
} from "../src/routes/admin/flags.schema.js";
import type {
  CreateFlagInput,
  UpdateFlagInput,
} from "../src/services/admin/flags.contract.js";

const validCreateBody = {
  key: "pos.offline_mode",
  name: "Offline mode",
  description: "Queues orders while the network is down.",
  environment: FLAG_ENVIRONMENTS[0],
  owner: "pos-team@example.com",
  expiresAt: "2099-01-01T00:00:00.000Z",
  removalTicket: "#224",
};

const validFlag = {
  id: "flag_1",
  key: "pos.offline_mode",
  name: "Offline mode",
  description: null,
  environment: FLAG_ENVIRONMENTS[0],
  isEnabled: false,
  defaultEnabled: false,
  version: 1,
  owner: "pos-team@example.com",
  expiresAt: "2099-01-01T00:00:00.000Z",
  removalTicket: "#224",
  isExpired: false,
  lifecycleComplete: true,
  rules: [],
  createdAt: "2026-11-04T00:00:00.000Z",
  updatedAt: "2026-11-04T00:00:00.000Z",
};

describe("Flag contract schemas", () => {
  it("accepts the canonical environment and rule enums", () => {
    const body: CreateFlagInput = createFlagBodySchema.parse(validCreateBody);
    expect(body.environment).toBe(FLAG_ENVIRONMENTS[0]);
    expect(flagSchema.parse(validFlag).environment).toBe(FLAG_ENVIRONMENTS[0]);
    expect(
      flagRuleSchema.parse({
        id: "rule_1",
        ruleType: FLAG_RULE_TYPES[0],
        targetId: "org_probe",
        enabled: true,
        priority: 1,
      }).ruleType
    ).toBe(FLAG_RULE_TYPES[0]);
  });

  it("rejects an environment outside the canonical enum", () => {
    expect(
      createFlagBodySchema.safeParse({
        ...validCreateBody,
        environment: "qa",
      }).success
    ).toBe(false);
  });

  it("rejects a rule type outside the canonical enum", () => {
    expect(
      flagRuleSchema.safeParse({
        id: "rule_1",
        ruleType: "SEGMENT",
        targetId: "org_probe",
        enabled: true,
        priority: 1,
      }).success
    ).toBe(false);
    expect(
      updateFlagBodySchema.safeParse({
        expectedVersion: 1,
        rules: [
          {
            ruleType: "SEGMENT",
            targetId: "org_probe",
            enabled: true,
            priority: 1,
          },
        ],
      }).success
    ).toBe(false);
  });

});

describe("Flag contract inference", () => {
  it("infers the update input type from the schema", () => {
    const patch: UpdateFlagInput = updateFlagBodySchema.parse({
      expectedVersion: 2,
      isEnabled: true,
      rules: [
        {
          ruleType: FLAG_RULE_TYPES[1],
          targetId: FLAG_ENVIRONMENTS[1],
          enabled: true,
          priority: 10,
        },
      ],
    });
    expect(patch.rules?.[0]?.ruleType).toBe(FLAG_RULE_TYPES[1]);
  });

  it("rejects a repeated rule target", () => {
    const result = updateFlagBodySchema.safeParse({
      expectedVersion: 1,
      rules: [
        {
          ruleType: FLAG_RULE_TYPES[0],
          targetId: "org_probe",
          enabled: true,
          priority: 1,
        },
        {
          ruleType: FLAG_RULE_TYPES[0],
          targetId: "org_probe",
          enabled: false,
          priority: 2,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
