import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserTeamIds } from '../middleware/authorize';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// GET /api/dashboard — Personal dashboard data
dashboardRouter.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const userTeamIds = await getUserTeamIds(userId);

  const [
    myAssigned,
    myCreated,
    needsAttention,
    recentActivity,
    teamStats,
    unreadNotifications,
  ] = await Promise.all([
    // Items assigned to me
    prisma.workItem.findMany({
      where: {
        assignedToId: userId,
        status: { notIn: ['CLOSED'] },
      },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
        tags: { include: { tag: true } },
      },
      orderBy: [
        { priority: 'asc' }, // CRITICAL first
        { updatedAt: 'desc' },
      ],
      take: 20,
    }),

    // Items I created
    prisma.workItem.findMany({
      where: {
        createdById: userId,
        status: { notIn: ['CLOSED'] },
      },
      include: {
        team: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, displayName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),

    // Unassigned items in my teams (needs attention)
    prisma.workItem.findMany({
      where: {
        teamId: { in: userTeamIds },
        assignedToId: null,
        status: { in: ['OPEN', 'REOPENED'] },
      },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
      take: 10,
    }),

    // Recent activity across my teams
    prisma.activityLog.findMany({
      where: {
        workItem: { teamId: { in: userTeamIds } },
      },
      include: {
        user: { select: { id: true, displayName: true } },
        workItem: { select: { id: true, identifier: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    // Stats per team
    Promise.all(
      userTeamIds.map(async (teamId) => {
        const team = await prisma.team.findUnique({
          where: { id: teamId },
          select: { id: true, name: true },
        });

        const [total, open, inProgress, blocked, resolved] = await Promise.all([
          prisma.workItem.count({ where: { teamId } }),
          prisma.workItem.count({ where: { teamId, status: 'OPEN' } }),
          prisma.workItem.count({ where: { teamId, status: 'IN_PROGRESS' } }),
          prisma.workItem.count({ where: { teamId, status: 'BLOCKED' } }),
          prisma.workItem.count({ where: { teamId, status: 'RESOLVED' } }),
        ]);

        return { team, total, open, inProgress, blocked, resolved };
      })
    ),

    // Unread notifications count
    prisma.notification.count({
      where: { userId, isRead: false },
    }),
  ]);

  res.json({
    myAssigned,
    myCreated,
    needsAttention,
    recentActivity,
    teamStats,
    unreadNotifications,
  });
});
