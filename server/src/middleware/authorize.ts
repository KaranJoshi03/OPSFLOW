import { Response, NextFunction } from 'express';
import { TeamRole } from '@prisma/client';
import { AuthRequest } from './auth';
import { prisma } from '../config/database';

/**
 * RBAC Authorization Middleware
 * 
 * Enforces role-based access control at the API level.
 * This is NOT just UI hiding — the server validates every request.
 * 
 * Critical Behaviour: Resource-level authorization
 */

// Check if user has any of the required roles in any team
export const requireRole = (...allowedRoles: TeamRole[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }

    const memberships = await prisma.teamMember.findMany({
      where: { userId: req.user.id },
      select: { role: true, teamId: true },
    });

    const hasRole = memberships.some((m) => allowedRoles.includes(m.role));
    if (!hasRole) {
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
};

// Check if user has a specific role in a specific team
export const requireTeamRole = (...allowedRoles: TeamRole[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }

    // Get teamId from params, body, or query
    const teamId = req.params.teamId || req.body?.teamId || req.query?.teamId as string;
    
    if (!teamId) {
      // If no teamId, try to get it from the work item
      const workItemId = req.params.id || req.params.workItemId;
      if (workItemId) {
        const workItem = await prisma.workItem.findUnique({
          where: { id: workItemId },
          select: { teamId: true },
        });
        if (!workItem) {
          res.status(404).json({ error: 'Work item not found', code: 'NOT_FOUND' });
          return;
        }
        
        const membership = await prisma.teamMember.findUnique({
          where: { userId_teamId: { userId: req.user.id, teamId: workItem.teamId } },
        });

        if (!membership || !allowedRoles.includes(membership.role)) {
          res.status(403).json({
            error: 'Insufficient permissions for this team',
            code: 'TEAM_FORBIDDEN',
          });
          return;
        }

        (req as any).teamMembership = membership;
        next();
        return;
      }

      res.status(400).json({ error: 'Team context required', code: 'TEAM_REQUIRED' });
      return;
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: req.user.id, teamId } },
    });

    if (!membership || !allowedRoles.includes(membership.role)) {
      res.status(403).json({
        error: 'Insufficient permissions for this team',
        code: 'TEAM_FORBIDDEN',
      });
      return;
    }

    (req as any).teamMembership = membership;
    next();
  };
};

// Check if user belongs to a team (any role)
export const requireTeamMembership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  const teamId = req.params.teamId || req.body?.teamId || req.query?.teamId as string;
  
  if (teamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: req.user.id, teamId } },
    });

    if (!membership) {
      res.status(403).json({
        error: 'You are not a member of this team',
        code: 'NOT_TEAM_MEMBER',
      });
      return;
    }

    (req as any).teamMembership = membership;
  }

  next();
};

// Get all team IDs the user belongs to
export const getUserTeamIds = async (userId: string): Promise<string[]> => {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
};

// Check if user can access a specific work item
export const canAccessWorkItem = async (userId: string, workItemId: string): Promise<boolean> => {
  const workItem = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { teamId: true },
  });

  if (!workItem) return false;

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId: workItem.teamId } },
  });

  return !!membership;
};
