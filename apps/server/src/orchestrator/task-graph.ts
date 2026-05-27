import type { SubTask } from "./types.js";

// ─── Error types ─────────────────────────────────────────────────────────

export class CycleDetectedError extends Error {
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(" → ")}`);
    this.name = "CycleDetectedError";
  }
}

// ─── DAG building ────────────────────────────────────────────────────────

/**
 * Build an adjacency list from sub-tasks.
 * Returns a map of task ID → list of dependency IDs.
 */
export function buildDAG(subtasks: SubTask[]): Map<string, string[]> {
  const dag = new Map<string, string[]>();
  for (const sub of subtasks) {
    dag.set(sub.id, [...sub.dependsOn]);
  }
  return dag;
}

/**
 * Detect cycles in the dependency graph using DFS.
 * Returns the first cycle found, or null if the graph is acyclic.
 */
export function detectCycle(subtasks: SubTask[]): string[] | null {
  const dag = buildDAG(subtasks);
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(node: string): string[] | null {
    visited.add(node);
    inStack.add(node);

    const deps = dag.get(node) ?? [];
    for (const dep of deps) {
      if (!dag.has(dep)) continue; // skip unknown nodes

      if (!visited.has(dep)) {
        parent.set(dep, node);
        const cycle = dfs(dep);
        if (cycle) return cycle;
      } else if (inStack.has(dep)) {
        // Found a cycle — reconstruct it
        const cycle: string[] = [dep];
        let current = node;
        while (current !== dep) {
          cycle.unshift(current);
          current = parent.get(current) ?? "";
          if (!current || current === dep) break;
        }
        cycle.unshift(dep);
        return cycle;
      }
    }

    inStack.delete(node);
    return null;
  }

  for (const [id] of dag) {
    if (!visited.has(id)) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Topologically sort sub-tasks into layers.
 *
 * Each layer contains tasks that can be executed in parallel.
 * Layers are ordered sequentially — layer N+1 waits for layer N.
 *
 * @throws {CycleDetectedError} if a cycle is detected in the dependency graph
 */
export function topSort(subtasks: SubTask[]): string[][] {
  if (subtasks.length === 0) return [];

  // Check for cycles first
  const cycle = detectCycle(subtasks);
  if (cycle) {
    throw new CycleDetectedError(cycle);
  }

  const dag = buildDAG(subtasks);
  const layers: string[][] = [];

  // Track in-degree (number of unresolved dependencies) for each task
  const inDegree = new Map<string, number>();
  for (const [id, deps] of dag) {
    inDegree.set(id, deps.filter((dep) => dag.has(dep)).length);
  }

  // Kahn's algorithm: start with tasks that have no dependencies
  let queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    // Current layer = all tasks with in-degree 0
    layers.push([...queue]);

    const nextQueue: string[] = [];
    for (const taskId of queue) {
      // Decrease in-degree for all tasks that depend on this one
      for (const [otherId, deps] of dag) {
        if (deps.includes(taskId)) {
          const newDegree = (inDegree.get(otherId) ?? 1) - 1;
          inDegree.set(otherId, newDegree);
          if (newDegree === 0) {
            nextQueue.push(otherId);
          }
        }
      }
    }

    queue = nextQueue;
  }

  return layers;
}

/**
 * Sort sub-tasks into layers, validating the DAG.
 * Convenience wrapper combining cycle detection + topological sort.
 */
export function buildLayers(subtasks: SubTask[]): string[][] {
  return topSort(subtasks);
}
