import { readFileSync } from "node:fs";

export interface PrismaModel {
  readonly model: string;
  readonly schema: string;
  readonly table: string;
}

export function parsePrismaModels(file: string): PrismaModel[] {
  const text = readFileSync(file, "utf8");
  const models: PrismaModel[] = [];
  for (const match of text.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const model = match[1];
    const body = match[2];
    if (model === undefined || body === undefined) {
      continue;
    }
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1];
    const schema = /@@schema\("([^"]+)"\)/.exec(body)?.[1];
    if (table !== undefined && schema !== undefined) {
      models.push({ model, schema, table });
    }
  }
  return models;
}
