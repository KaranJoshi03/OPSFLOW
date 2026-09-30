import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';

export const userRouter = Router();

userRouter.use(authenticate);

// GET /api/users — List all users (for assignment dropdowns)
userRouter.get('/', async (req: AuthRequest, res: Response) => {
  const { teamId, search } = req.query;

  const where: any = { isActive: true };

  if (teamId) {
    where.teamMemberships = { some: { teamId: teamId as string } };
  }

  if (search) {
    where.OR = [
      { displayName: { contains: search as string, mode: 'insensitive' } },
      { email: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      teamMemberships: {
        select: {
          teamId: true,
          role: true,
          team: { select: { name: true } },
        },
      },
    },
    orderBy: { displayName: 'asc' },
    take: 50,
  });

  res.json({ users });
});

// GET /api/users/:id/notifications
userRouter.get('/notifications', async (req: AuthRequest, res: Response) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: req.user!.id, isRead: false },
  });

  res.json({ notifications, unreadCount });
});

// PATCH /api/users/notifications/:id/read
userRouter.patch('/notifications/:id/read', async (req: AuthRequest, res: Response) => {
  await prisma.notification.update({
    where: { id: req.params.id, userId: req.user!.id },
    data: { isRead: true },
  });
  res.json({ success: true });
});

// PATCH /api/users/notifications/read-all
userRouter.patch('/notifications/read-all', async (req: AuthRequest, res: Response) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, isRead: false },
    data: { isRead: true },
  });
  res.json({ success: true });
});
