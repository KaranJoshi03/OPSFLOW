import { Router, Response } from 'express';
import { z } from 'zod';
import { WorkItemStatus, WorkItemPriority, WorkItemType, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireTeamMembership, getUserTeamIds, canAccessWorkItem } from '../middleware/authorize';
import { idempotency } from '../middleware/idempotency';
import { canTransition, getAllowedTransitions } from '../utils/stateMachine';
import { addJob } from '../jobs/queue';
import { v4 as uuidv4 } from 'uuid';

export const workItemRouter = Router();

// All routes require authentication
workItemRouter.use(authenticate);

// ============================================
// Schemas
// ============================================

const createWorkItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  type: z.nativeEnum(WorkItemType).optional(),
  priority: z.nativeEnum(WorkItemPriority).optional(),
  teamId: z.string().uuid(),
  assignedToId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
});

const updateWorkItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).optional(),
  type: z.nativeEnum(WorkItemType).optional(),
  priority: z.nativeEnum(WorkItemPriority).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  version: z.number().int().positive(), // Required for optimistic concurrency
});

const statusChangeSchema = z.object({
  status: z.nativeEnum(WorkItemStatus),
  version: z.number().int().positive(),
});

// ============================================
// HELPER: Generate human-readable identifier
// ============================================
async function generateIdentifier(): Promise<string> {
  const count = await prisma.workItem.count();
  return `OPS-${String(count + 1).padStart(4, '0')}`;
}

// ============================================
// GET /api/work-items — List with filtering, search, pagination
// ============================================
workItemRouter.get('/', async (req: AuthRequest, res: Response) => {
  const {
    page = '1',
    limit = '20',
    status,
    priority,
    type,
    teamId,
    assignedToId,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
  const skip = (pageNum - 1) * limitNum;

  // Users can only see items from teams they belong to
  const userTeamIds = await getUserTeamIds(req.user!.id);

  const where: Prisma.WorkItemWhereInput = {
    teamId: teamId
      ? { in: userTeamIds.includes(teamId as string) ? [teamId as string] : [] }
      : { in: userTeamIds },
    ...(status && { status: status as WorkItemStatus }),
    ...(priority && { priority: priority as WorkItemPriority }),
    ...(type && { type: type as WorkItemType }),
    ...(assignedToId && { assignedToId: assignedToId as string }),
    ...(search && {
      OR: [
        { title: { contains: search as string, mode: 'insensitive' as const } },
        { description: { contains: search as string, mode: 'insensitive' as const } },
        { identifier: { contains: search as string, mode: 'insensitive' as const } },
      ],
    }),
  };

  const orderBy: any = {};
  const validSortFields = ['createdAt', 'updatedAt', 'priority', 'status', 'dueDate', 'title'];
  if (validSortFields.includes(sortBy as string)) {
    orderBy[sortBy as string] = sortOrder === 'asc' ? 'asc' : 'desc';
  }

  const [items, total] = await Promise.all([
    prisma.workItem.findMany({
      where,
      skip,
      take: limitNum,
      orderBy,
      include: {
        team: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, displayName: true, email: true } },
        assignedTo: { select: { id: true, displayName: true, email: true } },
        tags: { include: { tag: true } },
        _count: { select: { comments: true, activityLogs: true } },
      },
    }),
    prisma.workItem.count({ where }),
  ]);

  res.json({
    items,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// ============================================
// GET /api/work-items/:id — Get single item with full details
// ============================================
workItemRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  // Resource-level authorization
  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  const item = await prisma.workItem.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, displayName: true, email: true } },
      assignedTo: { select: { id: true, displayName: true, email: true } },
      tags: { include: { tag: true } },
      comments: {
        include: { author: { select: { id: true, displayName: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      activityLogs: {
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });

  if (!item) {
    res.status(404).json({ error: 'Work item not found', code: 'NOT_FOUND' });
    return;
  }

  // Get allowed status transitions for this user
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: req.user!.id, teamId: item.teamId } },
  });
  const allowedTransitions = getAllowedTransitions(item.status, membership?.role);

  res.json({ item, allowedTransitions });
});

// ============================================
// POST /api/work-items — Create work item
// Critical Behaviour: Idempotency
// ============================================
workItemRouter.post('/', idempotency, async (req: AuthRequest, res: Response) => {
  const data = createWorkItemSchema.parse(req.body);

  // Verify user belongs to the team
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: req.user!.id, teamId: data.teamId } },
  });

  if (!membership) {
    res.status(403).json({ error: 'You are not a member of this team', code: 'NOT_TEAM_MEMBER' });
    return;
  }

  // Check if VIEWER role — viewers cannot create items
  if (membership.role === 'VIEWER') {
    res.status(403).json({ error: 'Viewers cannot create work items', code: 'FORBIDDEN' });
    return;
  }

  const identifier = await generateIdentifier();
  const idempotencyKey = req.headers['idempotency-key'] as string || undefined;

  // Create work item with tags in a transaction
  const item = await prisma.$transaction(async (tx) => {
    const workItem = await tx.workItem.create({
      data: {
        identifier,
        title: data.title,
        description: data.description,
        type: data.type || 'TASK',
        priority: data.priority || 'MEDIUM',
        teamId: data.teamId,
        createdById: req.user!.id,
        assignedToId: data.assignedToId,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        idempotencyKey,
      },
      include: {
        team: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, displayName: true, email: true } },
        assignedTo: { select: { id: true, displayName: true, email: true } },
      },
    });

    // Create activity log
    await tx.activityLog.create({
      data: {
        action: 'CREATED',
        workItemId: workItem.id,
        userId: req.user!.id,
        metadata: {
          title: workItem.title,
          type: workItem.type,
          priority: workItem.priority,
        },
      },
    });

    // Handle tags
    if (data.tags && data.tags.length > 0) {
      for (const tagName of data.tags) {
        const tag = await tx.tag.upsert({
          where: { name: tagName },
          create: { name: tagName },
          update: {},
        });
        await tx.workItemTag.create({
          data: { workItemId: workItem.id, tagId: tag.id },
        });
      }
    }

    return workItem;
  });

  // Emit real-time event
  const io = req.app.get('io');
  if (io) {
    io.to(`team:${data.teamId}`).emit('workItem:created', item);
  }

  // Queue AI triage job (async, non-blocking)
  try {
    await addJob('ai.triage', {
      workItemId: item.id,
      title: item.title,
      description: data.description,
    });
    await addJob('ai.embedding', {
      workItemId: item.id,
      title: item.title,
      description: data.description,
    });
  } catch (err) {
    console.warn('Failed to queue AI jobs (non-critical):', err);
  }

  res.status(201).json({ item });
});

// ============================================
// PATCH /api/work-items/:id — Update work item
// Critical Behaviour: Optimistic Concurrency Control
// ============================================
workItemRouter.patch('/:id', idempotency, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = updateWorkItemSchema.parse(req.body);

  // Resource-level authorization
  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  // Optimistic concurrency: update only if version matches
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Find with current version check
      const current = await tx.workItem.findUnique({ where: { id } });
      if (!current) {
        throw Object.assign(new Error('Work item not found'), { statusCode: 404, code: 'NOT_FOUND' });
      }

      if (current.version !== data.version) {
        // Version mismatch — someone else updated this item
        throw Object.assign(
          new Error('This item has been modified by another user. Please refresh and try again.'),
          {
            statusCode: 409,
            code: 'VERSION_CONFLICT',
            details: {
              currentVersion: current.version,
              yourVersion: data.version,
              currentItem: current,
            },
          }
        );
      }

      // Build update data and track changes for audit log
      const updateData: any = { version: { increment: 1 } };
      const changes: { field: string; oldValue: any; newValue: any }[] = [];

      if (data.title && data.title !== current.title) {
        updateData.title = data.title;
        changes.push({ field: 'title', oldValue: current.title, newValue: data.title });
      }
      if (data.description && data.description !== current.description) {
        updateData.description = data.description;
        changes.push({ field: 'description', oldValue: '(changed)', newValue: '(changed)' });
      }
      if (data.type && data.type !== current.type) {
        updateData.type = data.type;
        changes.push({ field: 'type', oldValue: current.type, newValue: data.type });
      }
      if (data.priority && data.priority !== current.priority) {
        updateData.priority = data.priority;
        changes.push({ field: 'priority', oldValue: current.priority, newValue: data.priority });
      }
      if (data.assignedToId !== undefined) {
        updateData.assignedToId = data.assignedToId;
        changes.push({ field: 'assignedTo', oldValue: current.assignedToId, newValue: data.assignedToId });
      }
      if (data.dueDate !== undefined) {
        updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
        changes.push({ field: 'dueDate', oldValue: current.dueDate, newValue: data.dueDate });
      }

      // Perform the update with version check (double-check with WHERE)
      const updated = await tx.workItem.update({
        where: { id, version: data.version },
        data: updateData,
        include: {
          team: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, displayName: true, email: true } },
          assignedTo: { select: { id: true, displayName: true, email: true } },
          tags: { include: { tag: true } },
        },
      });

      // Create activity logs for each change
      for (const change of changes) {
        let action: any = 'UPDATED';
        if (change.field === 'priority') action = 'PRIORITY_CHANGED';
        if (change.field === 'assignedTo') {
          action = change.oldValue ? (change.newValue ? 'REASSIGNED' : 'UNASSIGNED') : 'ASSIGNED';
        }
        if (change.field === 'type') action = 'TYPE_CHANGED';

        await tx.activityLog.create({
          data: {
            action,
            workItemId: id,
            userId: req.user!.id,
            fieldName: change.field,
            oldValue: String(change.oldValue ?? ''),
            newValue: String(change.newValue ?? ''),
          },
        });
      }

      return updated;
    });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`workItem:${id}`).emit('workItem:updated', result);
      io.to(`team:${result.teamId}`).emit('workItem:updated', { id, changes: data });
    }

    res.json({ item: result });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }
    throw error;
  }
});

// ============================================
// POST /api/work-items/:id/status — Change status
// Critical Behaviour: State Machine Enforcement
// ============================================
workItemRouter.post('/:id/status', idempotency, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const data = statusChangeSchema.parse(req.body);

  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.workItem.findUnique({ where: { id } });
      if (!current) {
        throw Object.assign(new Error('Not found'), { statusCode: 404, code: 'NOT_FOUND' });
      }

      // Optimistic concurrency check
      if (current.version !== data.version) {
        throw Object.assign(
          new Error('Version conflict — item was modified'),
          { statusCode: 409, code: 'VERSION_CONFLICT', details: { currentVersion: current.version } }
        );
      }

      // Get user's role in this team
      const membership = await tx.teamMember.findUnique({
        where: { userId_teamId: { userId: req.user!.id, teamId: current.teamId } },
      });

      // State machine validation
      const transition = canTransition(current.status, data.status, membership?.role);
      if (!transition.allowed) {
        throw Object.assign(
          new Error(transition.error!),
          { statusCode: 422, code: 'INVALID_TRANSITION', details: { requiredRoles: transition.requiredRoles } }
        );
      }

      // Perform update
      const updateData: any = {
        status: data.status,
        version: { increment: 1 },
      };

      if (data.status === 'RESOLVED') updateData.resolvedAt = new Date();
      if (data.status === 'CLOSED') updateData.closedAt = new Date();
      if (data.status === 'REOPENED') {
        updateData.resolvedAt = null;
        updateData.closedAt = null;
      }

      const updated = await tx.workItem.update({
        where: { id, version: data.version },
        data: updateData,
        include: {
          team: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, displayName: true, email: true } },
          assignedTo: { select: { id: true, displayName: true, email: true } },
        },
      });

      // Activity log
      await tx.activityLog.create({
        data: {
          action: 'STATUS_CHANGED',
          workItemId: id,
          userId: req.user!.id,
          fieldName: 'status',
          oldValue: current.status,
          newValue: data.status,
        },
      });

      // Create notification for assignee
      if (updated.assignedToId && updated.assignedToId !== req.user!.id) {
        await tx.notification.create({
          data: {
            userId: updated.assignedToId,
            title: `Status changed: ${updated.identifier}`,
            message: `${req.user!.displayName} changed status from ${current.status} to ${data.status}`,
            type: 'status_change',
            link: `/work-items/${id}`,
          },
        });
      }

      return updated;
    });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`workItem:${id}`).emit('workItem:statusChanged', result);
      io.to(`team:${result.teamId}`).emit('workItem:updated', result);
    }

    res.json({ item: result });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }
    throw error;
  }
});

// ============================================
// POST /api/work-items/:id/assign — Assign work item
// Critical Behaviour: Atomic Assignment (preventing double-claim)
// ============================================
workItemRouter.post('/:id/assign', idempotency, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { assignedToId, version } = req.body;

  if (!version || typeof version !== 'number') {
    res.status(400).json({ error: 'Version required', code: 'VERSION_REQUIRED' });
    return;
  }

  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Use SELECT FOR UPDATE to prevent race conditions
      const current = await tx.$queryRaw<any[]>`
        SELECT * FROM work_items WHERE id = ${id} FOR UPDATE
      `;

      if (!current.length) {
        throw Object.assign(new Error('Not found'), { statusCode: 404, code: 'NOT_FOUND' });
      }

      const item = current[0];

      // Version check
      if (item.version !== version) {
        throw Object.assign(
          new Error('Version conflict'),
          { statusCode: 409, code: 'VERSION_CONFLICT', details: { currentVersion: item.version } }
        );
      }

      // If someone is trying to claim an already-assigned item
      const targetUserId = assignedToId || req.user!.id;
      if (item.assigned_to_id && item.assigned_to_id !== targetUserId) {
        const currentAssignee = await tx.user.findUnique({
          where: { id: item.assigned_to_id },
          select: { displayName: true },
        });
        throw Object.assign(
          new Error(`This item is already assigned to ${currentAssignee?.displayName || 'another user'}`),
          { statusCode: 409, code: 'ALREADY_ASSIGNED', details: { currentAssignee: item.assigned_to_id } }
        );
      }

      const updated = await tx.workItem.update({
        where: { id },
        data: {
          assignedToId: targetUserId,
          version: { increment: 1 },
        },
        include: {
          team: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, displayName: true, email: true } },
          assignedTo: { select: { id: true, displayName: true, email: true } },
        },
      });

      // Activity log
      await tx.activityLog.create({
        data: {
          action: item.assigned_to_id ? 'REASSIGNED' : 'ASSIGNED',
          workItemId: id,
          userId: req.user!.id,
          fieldName: 'assignedTo',
          oldValue: item.assigned_to_id || '',
          newValue: targetUserId,
        },
      });

      // Notify assignee
      if (targetUserId !== req.user!.id) {
        await tx.notification.create({
          data: {
            userId: targetUserId,
            title: `Assigned: ${updated.identifier}`,
            message: `${req.user!.displayName} assigned "${updated.title}" to you`,
            type: 'assignment',
            link: `/work-items/${id}`,
          },
        });
      }

      return updated;
    });

    // Real-time broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(`workItem:${id}`).emit('workItem:assigned', result);
      io.to(`team:${result.teamId}`).emit('workItem:updated', result);
    }

    res.json({ item: result });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }
    throw error;
  }
});

// ============================================
// POST /api/work-items/:id/comments — Add comment
// ============================================
workItemRouter.post('/:id/comments', idempotency, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'Comment content required', code: 'VALIDATION_ERROR' });
    return;
  }

  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: {
        content: content.trim(),
        authorId: req.user!.id,
        workItemId: id,
      },
      include: {
        author: { select: { id: true, displayName: true, email: true } },
      },
    }),
    prisma.activityLog.create({
      data: {
        action: 'COMMENTED',
        workItemId: id,
        userId: req.user!.id,
        metadata: { preview: content.trim().substring(0, 100) },
      },
    }),
  ]);

  // Real-time broadcast
  const io = req.app.get('io');
  if (io) {
    io.to(`workItem:${id}`).emit('comment:created', comment);
  }

  res.status(201).json({ comment });
});

// ============================================
// GET /api/work-items/:id/comments — Get comments
// ============================================
workItemRouter.get('/:id/comments', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  const comments = await prisma.comment.findMany({
    where: { workItemId: id },
    include: {
      author: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({ comments });
});

// ============================================
// POST /api/work-items/:id/ai-suggestion — Accept/dismiss AI suggestion
// ============================================
workItemRouter.post('/:id/ai-suggestion', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { action, field, value, version } = req.body; // action: 'accept' | 'dismiss'

  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  if (action === 'accept' && field && value !== undefined) {
    const updateData: any = { version: { increment: 1 } };
    updateData[field] = value;

    const updated = await prisma.workItem.update({
      where: { id, version },
      data: updateData,
    });

    await prisma.activityLog.create({
      data: {
        action: 'AI_SUGGESTION_ACCEPTED',
        workItemId: id,
        userId: req.user!.id,
        fieldName: field,
        newValue: String(value),
        metadata: { source: 'ai_triage' },
      },
    });

    res.json({ item: updated });
  } else {
    await prisma.activityLog.create({
      data: {
        action: 'AI_SUGGESTION_DISMISSED',
        workItemId: id,
        userId: req.user!.id,
        metadata: { field, source: 'ai_triage' },
      },
    });

    res.json({ success: true });
  }
});

// ============================================
// DELETE /api/work-items/:id
// ============================================
workItemRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  // Only ADMIN and TEAM_LEAD can delete
  const item = await prisma.workItem.findUnique({
    where: { id },
    select: { teamId: true },
  });

  if (!item) {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    return;
  }

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: req.user!.id, teamId: item.teamId } },
  });

  if (!membership || !['ADMIN', 'TEAM_LEAD'].includes(membership.role)) {
    res.status(403).json({ error: 'Only team leads and admins can delete items', code: 'FORBIDDEN' });
    return;
  }

  await prisma.workItem.delete({ where: { id } });

  const io = req.app.get('io');
  if (io) {
    io.to(`team:${item.teamId}`).emit('workItem:deleted', { id });
  }

  res.json({ success: true });
});
