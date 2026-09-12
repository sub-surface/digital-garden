import { EmbedGraph, type EmbedGraphProps } from "./EmbedGraph"

export type WikiGraphProps = EmbedGraphProps

/**
 * WikiGraph — legacy MDX tag alias for EmbedGraph, defaulting to scope="wiki".
 * Supports all EmbedGraph properties: cluster, tag, slug, depth, height, interactive.
 */
export function WikiGraph(props: WikiGraphProps) {
  return <EmbedGraph scope={props.scope ?? "wiki"} {...props} />
}

export { EmbedGraph }
