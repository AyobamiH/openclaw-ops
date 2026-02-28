/**
 * Metrics Module Index
 *
 * Central export point for all metrics functionality.
 * Import from this module to access metrics, start the server, and record events.
 */

// Start/stop server
export { startMetricsServer, stopMetricsServer } from "./prometheus.js";

// Prometheus registers and metrics
export {
  metricsRegister,
  agentTasksStarted,
  agentTasksCompleted,
  agentTasksFailed,
  agentActiveTasks,
  agentTaskDuration,
  agentCostPerDay,
  agentTotalCostPerDay,
  skillAccessAllowed,
  skillAccessDenied,
  permissionEscalationRequests,
  activePermissionsGranted,
  auditViolationsLogged,
  taskApprovalRequests,
  approvalResponseTime,
  pendingApprovalsCount,
  approvalAutoEscalated,
} from "./prometheus.js";

// Agent metrics helpers
export {
  onAgentTaskStart,
  onAgentTaskComplete,
  onAgentTaskFailure,
  getAgentCost,
  getTotalCost,
  resetDailyCosts,
  exportCostSnapshot,
} from "./agent-metrics.js";

// Security metrics helpers
export {
  onSkillAccessAllowed,
  onSkillAccessDenied,
  onPermissionEscalation,
  updateActivePermissions,
  ViolationType,
  logViolation,
  onPermissionGranted,
  onPermissionRevoked,
  getSecuritySnapshot,
} from "./security-metrics.js";

// Approval gate metrics helpers
export {
  onApprovalRequested,
  onApprovalCompleted,
  onApprovalAutoEscalated,
  getPendingApprovalsCount,
  getPendingApprovals,
  getApprovalMetricsSnapshot,
  clearStaleApprovals,
  APPROVAL_SLA_MS,
  APPROVAL_ESCALATION_MS,
} from "./approval-metrics.js";
