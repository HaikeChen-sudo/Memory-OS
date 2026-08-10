/**
 * Connection — relationship between two entities in Memory OS.
 *
 * Used for: AI citations, semantic similarity, temporal proximity,
 * topic clusters, manual user connections.
 */

export type ConnectionNodeType = "memory" | "message" | "source";

export type ConnectionKind =
  | "citation"
  | "semantic_similarity"
  | "temporal_proximity"
  | "topic_cluster"
  | "manual"
  | "derived_from";

export interface SpatialPath {
  from_anchor: { x: number; y: number };
  to_anchor: { x: number; y: number };
  control_points: { x: number; y: number }[];
  curvature: number;
}

export interface Connection {
  id: string;

  /* ── Core ── */
  source_id: string;
  target_id: string;
  connection_type: ConnectionKind;

  /* ── Metadata ── */
  weight: number;
  label: string | null;
  created_at: string;

  /* ── Reserved — future ── */
  color: string;
  animationState: string;
  spatial_path: SpatialPath | null;
  metadata: Record<string, unknown>;
}
