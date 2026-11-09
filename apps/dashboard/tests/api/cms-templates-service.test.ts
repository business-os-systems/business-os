import { beforeEach, describe, expect, it, vi } from "vitest";
import { listStarterTemplates } from "../../src/services/cms-templates.service";

const dbMocks = vi.hoisted(() => ({
  prisma: { cmsTemplate: { findMany: vi.fn() } },
}));

vi.mock("@suite/db", () => ({ prisma: dbMocks.prisma }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listStarterTemplates", () => {
  it("maps the blueprint metadata into template cards", async () => {
    dbMocks.prisma.cmsTemplate.findMany.mockResolvedValue([
      {
        id: "tpl_1",
        name: "Fallback",
        category: "business",
        blueprintJson: {
          id: "blueprint_1",
          title: "Starter Site",
          description: "A starter",
          badge: "Popular",
        },
      },
    ]);

    const templates = await listStarterTemplates();

    expect(templates).toEqual([
      {
        id: "blueprint_1",
        title: "Starter Site",
        desc: "A starter",
        badge: "Popular",
        category: "business",
      },
    ]);
  });

  it("falls back to the row values when the blueprint is not a record", async () => {
    dbMocks.prisma.cmsTemplate.findMany.mockResolvedValue([
      { id: "tpl_1", name: "Row Name", category: "retail", blueprintJson: ["array"] },
    ]);

    const [template] = await listStarterTemplates();

    expect(template).toEqual({
      id: "tpl_1",
      title: "Row Name",
      desc: "",
      badge: "Starter",
      category: "retail",
    });
  });

  it("ignores blueprint fields whose type is not a string", async () => {
    dbMocks.prisma.cmsTemplate.findMany.mockResolvedValue([
      { id: "tpl_1", name: "Row Name", category: "retail", blueprintJson: { title: 42, badge: null } },
    ]);

    const [template] = await listStarterTemplates();

    expect(template).toEqual({
      id: "tpl_1",
      title: "Row Name",
      desc: "",
      badge: "Starter",
      category: "retail",
    });
  });

  it("returns an empty list when there are no starter templates", async () => {
    dbMocks.prisma.cmsTemplate.findMany.mockResolvedValue([]);

    expect(await listStarterTemplates()).toEqual([]);
  });
});
