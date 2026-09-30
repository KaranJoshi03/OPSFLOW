import { Router, Response } from 'express';
import { z } from 'zod';
import { TeamRole } from '@prisma/client';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/authorize';

export const teamRouter = Router();

teamRouter.use(authenticate);

const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(TeamRole).optional(),
});

// GET /api/teams — List teams for current user
teamRouter.get('/', async (req: AuthRequest, res: Response) => {
  const teams = await prisma.team.findMany({
    where: {
      members: { some: { userId: req.user!.id } },
    },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
        },
      },
      _count: {
        select: { workItems: true },
      },
    },
  });

  res.json({ teams });
});

// GET /api/teams/:teamId — Get team details
teamRouter.get('/:teamId', async (req: AuthRequest, res: Response) => {
  const { teamId } = req.params;

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: req.user!.id, teamId } },
  });

  if (!membership) {
    res.status(403).json({ error: 'Not a team member', code: 'NOT_TEAM_MEMBER' });
    return;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: {
          user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
        },
      },
      _count: {
        select: { workItems: true },
      },
    },
  });

  res.json({ team, userRole: membership.role });
});

// POST /api/teams — Create team
teamRouter.post('/', async (req: AuthRequest, res: Response) => {
  const data = createTeamSchema.parse(req.body);
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({
      data: {
        name: data.name,
        description: data.description,
        slug,
      },
    });

    // Creator becomes ADMIN of the team
    await tx.teamMember.create({
      data: {
        userId: req.user!.id,
        teamId: created.id,
        role: 'ADMIN',
      },
    });

    return created;
  });

  res.status(201).json({ team });
});

// POST /api/teams/:teamId/members — Add team member
teamRouter.post('/:teamId/members', async (req: AuthRequest, res: Response) => {
  const { teamId } = req.params;
  const data = addMemberSchema.parse(req.body);

  // Only ADMIN or TEAM_LEAD can add members
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: req.user!.id, teamId } },
  });

  if (!membership || !['ADMIN', 'TEAM_LEAD'].includes(membership.role)) {
    res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    return;
  }

  const member = await prisma.teamMember.create({
    data: {
      userId: data.userId,
      teamId,
      role: data.role || 'MEMBER',
    },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
    },
  });

  res.status(201).json({ member });
});

// PATCH /api/teams/:teamId/members/:userId — Update member role
teamRouter.patch('/:teamId/members/:userId', async (req: AuthRequest, res: Response) => {
  const { teamId, userId } = req.params;
  const { role } = req.body;

  if (!role || !Object.values(TeamRole).includes(role)) {
    res.status(400).json({ error: 'Valid role required', code: 'VALIDATION_ERROR' });
    return;
  }

  // Only ADMIN can change roles
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: req.user!.id, teamId } },
  });

  if (!membership || membership.role !== 'ADMIN') {
    res.status(403).json({ error: 'Only admins can change roles', code: 'FORBIDDEN' });
    return;
  }

  const updated = await prisma.teamMember.update({
    where: { userId_teamId: { userId, teamId } },
    data: { role },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
    },
  });

  res.json({ member: updated });
});

// DELETE /api/teams/:teamId/members/:userId — Remove member
teamRouter.delete('/:teamId/members/:userId', async (req: AuthRequest, res: Response) => {
  const { teamId, userId } = req.params;

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: req.user!.id, teamId } },
  });

  if (!membership || !['ADMIN', 'TEAM_LEAD'].includes(membership.role)) {
    res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    return;
  }

  await prisma.teamMember.delete({
    where: { userId_teamId: { userId, teamId } },
  });

  res.json({ success: true });
});
