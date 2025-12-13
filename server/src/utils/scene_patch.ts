export type SceneTreeNode = {
  name: string;
  type: string;
  path: string; // expected "/root/..."
  children?: SceneTreeNode[];
};

export type DesiredSceneNode = {
  name: string;
  type?: string;
  properties?: Record<string, any>;
  children?: DesiredSceneNode[];
};

export type ScenePatchOperation =
  | {
      op: 'create_node';
      parent_path?: string;
      node_type?: string;
      node_name: string;
      properties?: Record<string, any>;
      set_owner?: boolean;
    }
  | {
      op: 'delete_node';
      node_path: string;
    }
  | {
      op: 'set_property';
      node_path: string;
      property: string;
      value: any;
    }
  | {
      op: 'rename_node';
      node_path: string;
      new_name: string;
    }
  | {
      op: 'reparent_node';
      node_path: string;
      new_parent_path: string;
      keep_global_transform?: boolean;
      index?: number;
    };

export type GenerateScenePatchOptions = {
  allow_delete?: boolean;
  strict_types?: boolean;
  detect_renames?: boolean;
  reorder_children?: boolean;
};

type GenerateScenePatchResult = {
  operations: ScenePatchOperation[];
  errors: string[];
  aliases: Record<string, string>;
};

function childMap(node: SceneTreeNode): Map<string, SceneTreeNode> {
  const map = new Map<string, SceneTreeNode>();
  for (const child of node.children ?? []) {
    map.set(child.name, child);
  }
  return map;
}

function desiredChildMap(node: { children?: DesiredSceneNode[] }): Map<string, DesiredSceneNode> {
  const map = new Map<string, DesiredSceneNode>();
  for (const child of node.children ?? []) {
    map.set(child.name, child);
  }
  return map;
}

export function generateScenePatch(
  existingRoot: SceneTreeNode,
  desiredRoot: { children: DesiredSceneNode[] },
  options: GenerateScenePatchOptions = {},
): GenerateScenePatchResult {
  const allowDelete = options.allow_delete ?? false;
  const strictTypes = options.strict_types ?? true;
  const detectRenames = options.detect_renames ?? false;
  const reorderChildren = options.reorder_children ?? false;

  const operations: ScenePatchOperation[] = [];
  const errors: string[] = [];
  const aliases: Record<string, string> = {};

  const renameSubtree = (
    node: SceneTreeNode,
    oldPrefix: string,
    newPrefix: string,
    newName: string,
  ): SceneTreeNode => {
    const fixPath = (path: string) =>
      path === oldPrefix ? newPrefix : path.replace(oldPrefix + '/', newPrefix + '/');
    return {
      ...node,
      name: newName,
      path: fixPath(node.path),
      children: (node.children ?? []).map(child =>
        renameSubtree(child, oldPrefix, newPrefix, child.name),
      ),
    };
  };

  const emitDeletes = (node: SceneTreeNode) => {
    for (const child of node.children ?? []) emitDeletes(child);
    operations.push({ op: 'delete_node', node_path: node.path });
  };

  function diffChildren(existingParent: SceneTreeNode, parentPath: string, desiredChildren: DesiredSceneNode[]) {
    const existingChildren = existingParent.children ?? [];
    const existingByName = childMap(existingParent);
    const desiredByName = desiredChildMap({ children: desiredChildren });

    const matchedExistingNames = new Set<string>();
    const usedForRename = new Set<string>();
    const desiredOrder = desiredChildren.map(c => c.name);

    const resolveExistingForDesired = (desiredChild: DesiredSceneNode): SceneTreeNode | null => {
      const direct = existingByName.get(desiredChild.name);
      if (direct) {
        matchedExistingNames.add(direct.name);
        return direct;
      }

      if (!detectRenames) return null;
      if (!desiredChild.type) return null;

      const candidates = existingChildren.filter(ex => {
        if (matchedExistingNames.has(ex.name)) return false;
        if (usedForRename.has(ex.name)) return false;
        if (desiredByName.has(ex.name)) return false;
        if (ex.type !== desiredChild.type) return false;
        if (desiredChild.children && ex.children && desiredChild.children.length !== ex.children.length) return false;
        return true;
      });

      if (candidates.length !== 1) return null;

      const ex = candidates[0];
      usedForRename.add(ex.name);

      const oldPath = `${parentPath}/${ex.name}`;
      const newPath = `${parentPath}/${desiredChild.name}`;
      operations.push({ op: 'rename_node', node_path: oldPath, new_name: desiredChild.name });
      aliases[oldPath] = newPath;

      const renamed = renameSubtree(ex, oldPath, newPath, desiredChild.name);
      matchedExistingNames.add(ex.name);
      existingByName.set(desiredChild.name, renamed);
      return renamed;
    };

    for (const desiredChild of desiredChildren) {
      const desiredType = desiredChild.type ?? 'Node';
      const nodePath = `${parentPath}/${desiredChild.name}`;

      const existing = resolveExistingForDesired(desiredChild);
      if (!existing) {
        operations.push({
          op: 'create_node',
          parent_path: parentPath,
          node_type: desiredType,
          node_name: desiredChild.name,
          properties: desiredChild.properties ?? {},
          set_owner: true,
        });

        for (const child of desiredChild.children ?? []) {
          const dummy: SceneTreeNode = { name: desiredChild.name, type: desiredType, path: nodePath, children: [] };
          diffChildren(dummy, nodePath, [child]);
        }
        continue;
      }

      diffNode(existing, nodePath, desiredChild);
    }

    if (reorderChildren && desiredOrder.length > 1) {
      const currentOrder = existingChildren.map(c => (aliases[`${parentPath}/${c.name}`] ? aliases[`${parentPath}/${c.name}`].split('/').pop()! : c.name));
      const currentIndex = new Map<string, number>();
      for (let i = 0; i < currentOrder.length; i++) currentIndex.set(currentOrder[i], i);
      for (let i = 0; i < desiredOrder.length; i++) {
        const name = desiredOrder[i];
        if (currentIndex.get(name) === i) continue;
        operations.push({
          op: 'reparent_node',
          node_path: `${parentPath}/${name}`,
          new_parent_path: parentPath,
          index: i,
          keep_global_transform: false,
        });
      }
    }

    if (allowDelete) {
      for (const existingChild of existingChildren) {
        if (matchedExistingNames.has(existingChild.name)) continue;
        if (desiredByName.has(existingChild.name)) continue;
        emitDeletes(existingChild);
      }
    }
  }

  function diffNode(existingNode: SceneTreeNode, nodePath: string, desiredNode: DesiredSceneNode) {
    if (desiredNode.type && existingNode.type !== desiredNode.type) {
      const msg = `Type mismatch at ${nodePath}: existing=${existingNode.type} desired=${desiredNode.type}`;
      errors.push(msg);
      if (strictTypes) return;
    }

    for (const [propertyName, value] of Object.entries(desiredNode.properties ?? {})) {
      operations.push({
        op: 'set_property',
        node_path: nodePath,
        property: propertyName,
        value,
      });
    }

    diffChildren(existingNode, nodePath, desiredNode.children ?? []);
  }

  const desiredByName = desiredChildMap(desiredRoot);

  diffChildren(existingRoot, '/root', desiredRoot.children ?? []);

  if (allowDelete) {
    for (const child of existingRoot.children ?? []) {
      if (!desiredByName.has(child.name)) emitDeletes(child);
    }
  }

  return { operations, errors, aliases };
}
