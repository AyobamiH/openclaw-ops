/**
 * Security & Permission Metrics
 *
 * Tracks all permission-related events in the system:
 * - Allowed/denied skill access attempts
 * - Permission escalation requests
 * - Active permissions per agent
 * - Audit violations
 *
 * Used for security dashboards and compliance monitoring.
 */

import {
  skillAccessAllowed,
  skillAccessDenied,
  permissionEscalationRequests,
  activePermissionsGranted,
  auditViolationsLogged,
  recordSkillAccess,
  recordAuditViolation,
} from "./prometheus.js";

/**
 * Track active permissions per agent (in-memory)
 */
const activePermissions = new Map<string, number>();

/**
 * Track allowed skill access
 */
export function onSkillAccessAllowed(skill: string, agent: string): void {
  skillAccessAllowed.labels(skill, agent).inc();
  recordSkillAccess(skill, agent, true);
}

/**
 * Track denied skill access
 */
export function onSkillAccessDenied(
  skill: string,
  agent: string,
  reason: string = "not_in_allowlist"
): void {
  skillAccessDenied.labels(skill, agent, reason).inc();
  recordSkillAccess(skill, agent, false, reason);
}

/**
 * Track permission escalation request
 */
export function onPermissionEscalation(
  agent: string,
  requestedPermission: string
): void {
  permissionEscalationRequests.labels(agent, requestedPermission).inc();
}

/**
 * Update active permissions for an agent
 */
export function updateActivePermissions(agent: string, count: number): void {
  activePermissions.set(agent, count);
  activePermissionsGranted.labels(agent).set(count);
}

/**
 * Track different types of violations
 */
export enum ViolationType {
  UNAUTHORIZED_SKILL_ACCESS = "unauthorized_skill_access",
  UNAUTHORIZED_FILE_ACCESS = "unauthorized_file_access",
  PERMISSION_ESCALATION_DENIED = "permission_escalation_denied",
  SUSPICIOUS_PATTERN = "suspicious_pattern",
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
  APPROVAL_GATE_BYPASS_ATTEMPT = "approval_gate_bypass_attempt",
}

/**
 * Log security violation
 */
export function logViolation(type: ViolationType, agent: string): void {
  auditViolationsLogged.labels(type).inc();
  recordAuditViolation(type);
  
  console.warn(
    `[SECURITY] Violation logged: ${type} by agent ${agent} at ${new Date().toISOString()}`
  );
}

/**
 * Track permission grant
 */
export function onPermissionGranted(agent: string, permission: string): void {
  console.log(
    `[AUDIT] Permission granted: ${permission} to agent ${agent} at ${new Date().toISOString()}`
  );
}

/**
 * Track permission revocation
 */
export function onPermissionRevoked(agent: string, permission: string): void {
  console.log(
    `[AUDIT] Permission revoked: ${permission} from agent ${agent} at ${new Date().toISOString()}`
  );
}

/**
 * Get current security metrics snapshot
 */
export function getSecuritySnapshot(): {
  totalSkillAccessAllowed: number;
  totalSkillAccessDenied: number;
  totalEscalationRequests: number;
  totalViolations: number;
} {
  // Note: These would be queried from the metrics register in production
  // For now, returning structure for integration
  return {
    totalSkillAccessAllowed: 0,
    totalSkillAccessDenied: 0,
    totalEscalationRequests: 0,
    totalViolations: 0,
  };
}
