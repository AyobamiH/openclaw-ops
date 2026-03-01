export type DemandSegmentId =
  | "cash-velocity"
  | "security-exposure"
  | "skills-supply-chain"
  | "autonomy-collapse"
  | "hardening-runtime"
  | "debug-blindness"
  | "data-shape-drift";

export type DemandSegmentDefinition = {
  id: DemandSegmentId;
  label: string;
  staticWeight: number;
  clusterLabels: string[];
  keywordClusters: string[];
};

export const DEMAND_SEGMENTS: readonly DemandSegmentDefinition[] = [
  {
    id: "cash-velocity",
    label: "Cash Velocity",
    staticWeight: 5,
    clusterLabels: [
      "payments and backend",
      "preview vs production",
      "core instability",
    ],
    keywordClusters: [
      "payments_and_backend",
      "preview_vs_production",
      "core_instability",
      "emotional_identity_pain",
    ],
  },
  {
    id: "security-exposure",
    label: "Security Exposure",
    staticWeight: 5,
    clusterLabels: ["security exposure", "zero trust", "segmentation"],
    keywordClusters: ["security_exposure"],
  },
  {
    id: "skills-supply-chain",
    label: "Skills Supply Chain",
    staticWeight: 4,
    clusterLabels: [
      "skills supply chain",
      "prompt injection",
      "extension trust",
    ],
    keywordClusters: ["skills_supply_chain"],
  },
  {
    id: "autonomy-collapse",
    label: "Autonomy Collapse",
    staticWeight: 4,
    clusterLabels: ["approval loops", "execution stalls", "non-execution"],
    keywordClusters: ["autonomy_collapse"],
  },
  {
    id: "hardening-runtime",
    label: "Hardening + Runtime",
    staticWeight: 4,
    clusterLabels: ["docker vs vm", "least privilege", "tool calling"],
    keywordClusters: ["hardening_and_runtime"],
  },
  {
    id: "debug-blindness",
    label: "Debug Blindness",
    staticWeight: 3,
    clusterLabels: ["no logs", "no stack trace", "wrong explanation"],
    keywordClusters: ["debug_blindness"],
  },
  {
    id: "data-shape-drift",
    label: "Data Shape Drift",
    staticWeight: 3,
    clusterLabels: ["normalization", "schema mapping", "dedupe"],
    keywordClusters: [
      "export_quality_shock",
      "migration_and_rebrand_brittleness",
      "core_instability",
    ],
  },
];
