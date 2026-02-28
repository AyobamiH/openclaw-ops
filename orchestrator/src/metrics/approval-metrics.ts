/**
 * Approval Gate Metrics
 *
 * Tracks approval gate performance:
 * - Time to approval/rejection
 * - SLA compliance (< 60 seconds target)
 * - Pending approvals count
 * - Auto-escalations due to timeout
 *
 * Critical for monitoring system responsiveness to human review.
 */

import {
  taskApprovalRequests,
  approvalResponseTime,
  pendingApprovalsCount,
  approvalAutoEscalated,
  recordApprovalRequest,
  recordApprovalResponse,
} from "./prometheus.js";

// Track pending approvals in-memory
let pendingCount = 0;
const pendingApprovals = new Map<
  string,
  {
    taskId: string;
    type: string;
    requestedAt: Date;
  }
>();

/**
 * SLA constants
 */
export const APPROVAL_SLA_MS = 60000; // 60 seconds
export const APPROVAL_ESCALATION_MS = 120000; // 120 seconds (2 min)

/**
 * Record a task requiring approval
 */
export function onApprovalRequested(taskId: string, taskType: string): void {
  recordApprovalRequest(taskType);
  
  pendingApprovals.set(taskId, {
    taskId,
    type: taskType,
    requestedAt: new Date(),
  });
  
  updatePendingCount();
}

/**
 * Record task approval completion
 * Returns whether SLA was met
 */
export function onApprovalCompleted(
  taskId: string,
  result: "approved" | "rejected",
  completedAt?: Date
): boolean {
  const pending = pendingApprovals.get(taskId);
  
  if (!pending) {
    console.warn(`Approval completion recorded for unknown task: ${taskId}`);
    return false;
  }
  
  const now = completedAt || new Date();
  const responseMsec = now.getTime() - pending.requestedAt.getTime();
  const responseSeconds = responseMsec / 1000;
  
  // Record the response
  recordApprovalResponse(responseSeconds, result);
  approvalResponseTime.labels(result).observe(responseSeconds);
  
  // Remove from pending
  pendingApprovals.delete(taskId);
  updatePendingCount();
  
  const slaMet = responseMsec <= APPROVAL_SLA_MS;
  
  console.log(
    `[APPROVAL] Task ${taskId} ${result.toUpperCase()} in ${responseSeconds.toFixed(2)}s ` +
    `(SLA: ${slaMet ? "✓ MET" : "✗ BREACHED"})`
  );
  
  return slaMet;
}

/**
 * Record auto-escalation due to SLA breach or timeout
 */
export function onApprovalAutoEscalated(
  taskId: string,
  reason: "timeout" | "sla_breach"
): void {
  const pending = pendingApprovals.get(taskId);
  
  if (!pending) {
    console.warn(`Auto-escalation for unknown task: ${taskId}`);
    return;
  }
  
  approvalAutoEscalated.labels(reason).inc();
  
  console.warn(
    `[APPROVAL ESCALATION] Task ${taskId} auto-escalated due to ${reason}`
  );
}

/**
 * Update pending approvals count in metrics and Prometheus
 */
function updatePendingCount(): void {
  pendingCount = pendingApprovals.size;
  pendingApprovalsCount.set(pendingCount);
}

/**
 * Get current pending approval count
 */
export function getPendingApprovalsCount(): number {
  return pendingCount;
}

/**
 * Get all pending approvals
 */
export function getPendingApprovals(): Array<{
  taskId: string;
  type: string;
  waitTimeMs: number;
  slaBreach: boolean;
}> {
  const now = new Date();
  
  return Array.from(pendingApprovals.values()).map((approval) => {
    const waitTimeMs = now.getTime() - approval.requestedAt.getTime();
    const slaBreach = waitTimeMs > APPROVAL_SLA_MS;
    
    return {
      taskId: approval.taskId,
      type: approval.type,
      waitTimeMs,
      slaBreach,
    };
  });
}

/**
 * Get approval metrics snapshot
 */
export function getApprovalMetricsSnapshot(): {
  pendingCount: number;
  slaBreach: number;
  maxWaitMs: number;
} {
  const pending = getPendingApprovals();
  
  return {
    pendingCount: pending.length,
    slaBreach: pending.filter((p) => p.slaBreach).length,
    maxWaitMs: pending.length > 0 ? Math.max(...pending.map((p) => p.waitTimeMs)) : 0,
  };
}

/**
 * Clear stale approvals (for testing/cleanup)
 * Anything older than APPROVAL_ESCALATION_MS is forcibly resolved
 */
export function clearStaleApprovals(): {
  clearedCount: number;
  examples: string[];
} {
  const now = new Date();
  const stale: string[] = [];
  
  for (const [taskId, approval] of pendingApprovals.entries()) {
    const ageMs = now.getTime() - approval.requestedAt.getTime();
    
    if (ageMs > APPROVAL_ESCALATION_MS) {
      onApprovalAutoEscalated(taskId, "timeout");
      pendingApprovals.delete(taskId);
      stale.push(taskId);
    }
  }
  
  updatePendingCount();
  
  return {
    clearedCount: stale.length,
    examples: stale.slice(0, 5),
  };
}
