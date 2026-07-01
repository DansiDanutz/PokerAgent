import type { NetworkNode } from "@/types/domain";

/** Every descendant of `node`, flattened (the node itself is not included). */
export function flattenNetwork(node: NetworkNode, acc: NetworkNode[] = []): NetworkNode[] {
  for (const child of node.children) {
    acc.push(child);
    flattenNetwork(child, acc);
  }
  return acc;
}
