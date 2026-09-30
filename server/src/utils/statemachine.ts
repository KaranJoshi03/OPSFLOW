import { WorkItemStatus, TeamRole } from '@prisma/client';

/**
 * Work Item State Machine
 * 
 * Critical Behaviour: Enforcing workflow rules
 * 
 * The backend validates all state transitions. Invalid transitions
 * are rejected with a clear error message. This prevents corrupted
 * workflow states regardless of what the frontend sends.
 * 
 * State Diagram:
 * OPEN → IN_PROGRESS → UNDER_REVIEW → RESOLVED → CLOSED
 *   │         │              │            │
 *   │         ▼              │            │
 *   │     BLOCKED ──────────▶│            │
 *   │                        │            │
 *   └────────────────────────┘            │
 *           REOPENED ◀───────────────────-┘
 *   REOPENED → IN_PROGRESS (follows same rules from there)
 */

// Define allowed transitions: from → [to1, to2, ...]
const TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  OPEN: [WorkItemStatus.IN_PROGRESS, WorkItemStatus.CLOSED],
  IN_PROGRESS: [
    WorkItemStatus.UNDER_REVIEW,
    WorkItemStatus.BLOCKED,
    WorkItemStatus.OPEN,
    WorkItemStatus.RESOLVED,
  ],
  UNDER_REVIEW: [
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.RESOLVED,
    WorkItemStatus.BLOCKED,
  ],
  BLOCKED: [
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.OPEN,
  ],
  RESOLVED: [
    WorkItemStatus.CLOSED,
    WorkItemStatus.REOPENED,
  ],
  CLOSED: [
    WorkItemStatus.REOPENED,
  ],
  REOPENED: [
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.OPEN,
  ],
};

// Some transitions require specific roles
const ROLE_RESTRICTED_TRANSITIONS: Record<string, TeamRole[]> = {
  // Only TEAM_LEAD or ADMIN can close items
  [`${WorkItemStatus.RESOLVED}_${WorkItemStatus.CLOSED}`]: [TeamRole.TEAM_LEAD, TeamRole.ADMIN],
  [`${WorkItemStatus.OPEN}_${WorkItemStatus.CLOSED}`]: [TeamRole.TEAM_LEAD, TeamRole.ADMIN],
  // Only TEAM_LEAD or ADMIN can approve (move to RESOLVED from UNDER_REVIEW)
  [`${WorkItemStatus.UNDER_REVIEW}_${WorkItemStatus.RESOLVED}`]: [
    TeamRole.TEAM_LEAD,
    TeamRole.ADMIN,
  ],
};

export interface TransitionResult {
  allowed: boolean;
  error?: string;
  requiredRoles?: TeamRole[];
}

export function canTransition(
  from: WorkItemStatus,
  to: WorkItemStatus,
  userRole?: TeamRole
): TransitionResult {
  // Check if transition exists
  const allowedTargets = TRANSITIONS[from];
  if (!allowedTargets || !allowedTargets.includes(to)) {
    return {
      allowed: false,
      error: `Cannot transition from ${from} to ${to}. Allowed transitions: ${allowedTargets?.join(', ') || 'none'}`,
    };
  }

  // Check role restrictions
  const transitionKey = `${from}_${to}`;
  const requiredRoles = ROLE_RESTRICTED_TRANSITIONS[transitionKey];
  if (requiredRoles && userRole && !requiredRoles.includes(userRole)) {
    return {
      allowed: false,
      error: `Transition from ${from} to ${to} requires role: ${requiredRoles.join(' or ')}`,
      requiredRoles,
    };
  }

  return { allowed: true };
}

export function getAllowedTransitions(
  from: WorkItemStatus,
  userRole?: TeamRole
): WorkItemStatus[] {
  const allAllowed = TRANSITIONS[from] || [];
  
  if (!userRole) return allAllowed;

  return allAllowed.filter((to) => {
    const transitionKey = `${from}_${to}`;
    const requiredRoles = ROLE_RESTRICTED_TRANSITIONS[transitionKey];
    return !requiredRoles || requiredRoles.includes(userRole);
  });
}

// Get a human-readable label for each status
export function getStatusLabel(status: WorkItemStatus): string {
  const labels: Record<WorkItemStatus, string> = {
    OPEN: 'Open',
    IN_PROGRESS: 'In Progress',
    UNDER_REVIEW: 'Under Review',
    BLOCKED: 'Blocked',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
    REOPENED: 'Reopened',
  };
  return labels[status];
}
