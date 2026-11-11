export interface PageTreePage {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly parentId: string | null;
  readonly isHomePage: boolean;
  readonly status: string;
  readonly revision: number;
  readonly orderIndex: number;
}

export interface PageTreeNode extends PageTreePage {
  readonly children: PageTreeNode[];
}

const MAX_TREE_DEPTH = 100;

function createsCycle(
  parentId: string,
  nodeId: string,
  byId: ReadonlyMap<string, PageTreePage>
): boolean {
  let currentId: string | null = parentId;
  const visited = new Set<string>();
  for (let depth = 0; depth < MAX_TREE_DEPTH && currentId !== null; depth += 1) {
    if (currentId === nodeId || visited.has(currentId)) {
      return true;
    }
    visited.add(currentId);
    currentId = byId.get(currentId)?.parentId ?? null;
  }
  return currentId !== null;
}

function sortNodes(nodes: PageTreeNode[]): PageTreeNode[] {
  nodes.sort((left, right) => {
    if (left.orderIndex !== right.orderIndex) {
      return left.orderIndex - right.orderIndex;
    }
    return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
  });
  for (const node of nodes) {
    sortNodes(node.children);
  }
  return nodes;
}

/**
 * Builds the hierarchical page tree from a flat page list. A missing parent or
 * a cycle becomes a root, so one bad row can never hide the rest of the tree.
 */
export function buildPageTree(pages: readonly PageTreePage[]): PageTreeNode[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const nodes = new Map(
    pages.map((page) => [page.id, { ...page, children: [] as PageTreeNode[] }])
  );
  const roots: PageTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(node.parentId);
    if (parent === undefined || createsCycle(node.parentId, node.id, byId)) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }
  return sortNodes(roots);
}
