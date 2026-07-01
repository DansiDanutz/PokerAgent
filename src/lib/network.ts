import type { NetworkNode } from "@/types/domain";

/** Every descendant of `node`, flattened (the node itself is not included). */
export function flattenNetwork(node: NetworkNode, acc: NetworkNode[] = []): NetworkNode[] {
  for (const child of node.children) {
    acc.push(child);
    flattenNetwork(child, acc);
  }
  return acc;
}

/**
 * Like `flattenNetwork`, but stops descending past a nested agent — an agent
 * owns their own downline's rakeback tier, so a parent agent's "own business"
 * counts a sub-agent as one VIP win, not the sub-agent's whole tree too.
 */
export function flattenOwnBusiness(node: NetworkNode, acc: NetworkNode[] = []): NetworkNode[] {
  for (const child of node.children) {
    acc.push(child);
    if (child.user.role !== "agent") flattenOwnBusiness(child, acc);
  }
  return acc;
}
