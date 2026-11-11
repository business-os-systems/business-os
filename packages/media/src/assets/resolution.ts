import type { Prisma } from "@suite/db";
import type {
  MediaAssetResolution,
  MediaAssetResolutionMap,
} from "../contracts.js";

/**
 * Resolves referenced asset ids to their public URLs inside the caller's
 * tenant transaction. Resolution happens at read/render time, so the AST keeps
 * identity only and never stores a copied URL (FR-120).
 */
export async function resolveMediaAssets(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assetIds: readonly string[]
): Promise<MediaAssetResolutionMap> {
  const uniqueIds = [...new Set(assetIds)];
  if (uniqueIds.length === 0) {
    return {};
  }
  const rows = await tx.mediaAsset.findMany({
    where: { organizationId, id: { in: uniqueIds } },
    select: {
      id: true,
      publicUrl: true,
      fileName: true,
      width: true,
      height: true,
    },
  });
  const resolved: Record<string, MediaAssetResolution> = {};
  for (const row of rows) {
    resolved[row.id] = {
      assetId: row.id,
      url: row.publicUrl,
      fileName: row.fileName,
      width: row.width,
      height: row.height,
    };
  }
  return resolved;
}
