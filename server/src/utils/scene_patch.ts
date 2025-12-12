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
};

type GenerateScenePatchResult = {
  operations: ScenePatchOperation[];
  errors: string[];
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

  const operations: ScenePatchOperation[] = [];
  const errors: string[] = [];

  const walk = (existingParent: SceneTreeNode | null, parentPath: string, desired: DesiredSceneNode) => {
    const existing = existingParent ? childMap(existingParent).get(desired.name) : null;
    const desiredType = desired.type ?? 'Node';
    const nodePath = `${parentPath}/${desired.name}`;

    if (!existing) {
      operations.push({
        op: 'create_node',
        parent_path: parentPath,
        node_type: desiredType,
        node_name: desired.name,
        properties: desired.properties ?? {},
        set_owner: true,
      });

      for (const child of desired.children ?? []) {
        walk(null, nodePath, child);
      }

      return;
    }

    if (desired.type && existing.type !== desired.type) {
      const msg = `Type mismatch at ${nodePath}: existing=${existing.type} desired=${desired.type}`;
      errors.push(msg);
      if (strictTypes) return;
    }

    for (const [propertyName, value] of Object.entries(desired.properties ?? {})) {
      operations.push({
        op: 'set_property',
        node_path: nodePath,
        property: propertyName,
        value,
      });
    }

    const desiredChildren = desiredChildMap(desired);
    const existingChildren = childMap(existing);

    for (const child of desired.children ?? []) {
      walk(existing, nodePath, child);
    }

    if (allowDelete) {
      const deleteMissing = (ex: SceneTreeNode) => {
        for (const c of ex.children ?? []) deleteMissing(c);
        operations.push({ op: 'delete_node', node_path: ex.path });
      };

      for (const [existingName, existingNode] of existingChildren.entries()) {
        if (!desiredChildren.has(existingName)) {
          deleteMissing(existingNode);
        }
      }
    }
  };

  const existingByName = childMap(existingRoot);
  const desiredByName = desiredChildMap(desiredRoot);

  for (const child of desiredRoot.children ?? []) {
    const existing = existingByName.get(child.name) ?? null;
    walk(existingRoot, '/root', child);
    if (!existing && child.children?.length) {
      // already handled via walk(null,..) when missing
    }
  }

  if (allowDelete) {
    const deleteMissing = (ex: SceneTreeNode) => {
      for (const c of ex.children ?? []) deleteMissing(c);
      operations.push({ op: 'delete_node', node_path: ex.path });
    };
    for (const [existingName, existingNode] of existingByName.entries()) {
      if (!desiredByName.has(existingName)) {
        deleteMissing(existingNode);
      }
    }
  }

  return { operations, errors };
}

