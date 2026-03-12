import { describe, expect, it } from "vitest";

import {
  buildAgentRelationshipWindow,
  buildIncidentPriorityQueue,
  buildWorkflowBlockerSummary,
  type RuntimeIncidentLedgerRecord,
  type RuntimeRelationshipObservation,
  type RuntimeWorkflowEvent,
} from "../../agents/shared/runtime-evidence.js";

describe("runtime intelligence helpers", () => {
  it("ranks open incidents by severity, escalation, and remediation blockage", () => {
    const incidents: RuntimeIncidentLedgerRecord[] = [
      {
        incidentId: "inc-critical",
        classification: "proof-delivery",
        severity: "critical",
        status: "active",
        escalation: { level: "breached" },
        remediation: {
          nextAction: "Restart the proof transport worker.",
          blockers: ["verification still pending"],
        },
        remediationTasks: [{ status: "failed", blockers: ["worker crashed"] }],
        recommendedSteps: ["Inspect delivery errors"],
        affectedSurfaces: ["public-proof"],
        linkedServiceIds: ["service:openclawdbot"],
      },
      {
        incidentId: "inc-warning",
        classification: "service-runtime",
        severity: "warning",
        status: "watching",
        owner: "ops",
        remediation: { nextAction: "Watch the service." },
      },
      {
        incidentId: "inc-resolved",
        classification: "service-runtime",
        severity: "critical",
        status: "resolved",
      },
    ];

    const queue = buildIncidentPriorityQueue(incidents);

    expect(queue).toHaveLength(2);
    expect(queue[0]?.incidentId).toBe("inc-critical");
    expect(queue[0]?.priorityScore).toBeGreaterThan(queue[1]?.priorityScore ?? 0);
    expect(queue[0]?.blockers).toContain("worker crashed");
    expect(queue[0]?.nextAction).toBe("Restart the proof transport worker.");
    expect(queue[0]?.affectedSurfaces).toContain("public-proof");
  });

  it("summarizes workflow stop signals across stages and stop codes", () => {
    const events: RuntimeWorkflowEvent[] = [
      {
        eventId: "evt-1",
        runId: "run-1",
        stage: "agent",
        state: "failed",
        timestamp: "2026-03-12T10:00:00.000Z",
        classification: "execution",
        stopCode: "agent-exit-1",
      },
      {
        eventId: "evt-2",
        runId: "run-1",
        stage: "proof",
        state: "blocked",
        timestamp: "2026-03-12T10:05:00.000Z",
        classification: "delivery",
        stopCode: "proof-timeout",
      },
      {
        eventId: "evt-3",
        runId: "run-2",
        relatedRunId: "run-1",
        stage: "approval",
        state: "completed",
        timestamp: "2026-03-12T10:03:00.000Z",
      },
    ];

    const summary = buildWorkflowBlockerSummary(events);

    expect(summary.totalStopSignals).toBe(2);
    expect(summary.byStage.agent).toBe(1);
    expect(summary.byStage.proof).toBe(1);
    expect(summary.byClassification.execution).toBe(1);
    expect(summary.byStopCode["proof-timeout"]).toBe(1);
    expect(summary.latestStopCode).toBe("proof-timeout");
    expect(summary.blockedRunIds).toContain("run-1");
    expect(summary.proofStopSignals).toBe(1);
  });

  it("builds an agent relationship window with recent-edge slices", () => {
    const now = Date.now();
    const observations: RuntimeRelationshipObservation[] = [
      {
        observationId: "obs-1",
        from: "agent:doc-specialist",
        to: "agent:integration-agent",
        relationship: "feeds-agent",
        timestamp: new Date(now - 30 * 60 * 1000).toISOString(),
        source: "knowledge-pack",
      },
      {
        observationId: "obs-2",
        from: "agent:qa-verification-agent",
        to: "agent:integration-agent",
        relationship: "verifies-agent",
        timestamp: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
        source: "verification",
      },
      {
        observationId: "obs-3",
        from: "agent:system-monitor-agent",
        to: "agent:security-agent",
        relationship: "monitors-agent",
        timestamp: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
        source: "monitoring",
      },
    ];

    const window = buildAgentRelationshipWindow(observations, "integration-agent");

    expect(window.agentId).toBe("integration-agent");
    expect(window.total).toBe(2);
    expect(window.recentSixHours).toBe(1);
    expect(window.recentTwentyFourHours).toBe(2);
    expect(window.byRelationship["feeds-agent"]).toBe(1);
    expect(window.byRelationship["verifies-agent"]).toBe(1);
    expect(window.recentEdges[0]?.relationship).toBe("feeds-agent");
  });
});
