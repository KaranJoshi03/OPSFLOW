import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessWorkItem } from '../middleware/authorize';
import { isAIAvailable, classifyItem, summarizeHistory, findSimilarByText } from '../ai/agent';

export const aiRouter = Router();

aiRouter.use(authenticate);

// GET /api/ai/status — Check if AI features are available
aiRouter.get('/status', (_req: AuthRequest, res: Response) => {
  res.json({
    available: isAIAvailable(),
    features: {
      triage: isAIAvailable(),
      summarization: isAIAvailable(),
      duplicateDetection: isAIAvailable(),
    },
  });
});

// POST /api/ai/classify — Manually trigger classification
aiRouter.post('/classify', async (req: AuthRequest, res: Response) => {
  if (!isAIAvailable()) {
    res.status(503).json({ error: 'AI features not configured', code: 'AI_UNAVAILABLE' });
    return;
  }

  const { title, description } = req.body;
  if (!title || !description) {
    res.status(400).json({ error: 'Title and description required', code: 'VALIDATION_ERROR' });
    return;
  }

  const classification = await classifyItem(title, description);
  if (!classification) {
    res.status(500).json({ error: 'AI classification failed', code: 'AI_ERROR' });
    return;
  }

  res.json({ classification });
});

// POST /api/ai/summarize/:id — Generate summary for a work item
aiRouter.post('/summarize/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (!isAIAvailable()) {
    res.status(503).json({ error: 'AI features not configured', code: 'AI_UNAVAILABLE' });
    return;
  }

  const hasAccess = await canAccessWorkItem(req.user!.id, id);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
    return;
  }

  const item = await prisma.workItem.findUnique({
    where: { id },
    include: {
      activityLogs: {
        include: { user: { select: { displayName: true } } },
        orderBy: { createdAt: 'asc' },
      },
      comments: {
        include: { author: { select: { displayName: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!item) {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    return;
  }

  const activities = item.activityLogs.map((a) => ({
    action: a.action,
    user: a.user.displayName,
    detail: a.fieldName ? `${a.fieldName}: ${a.oldValue} → ${a.newValue}` : '',
    date: a.createdAt.toISOString(),
  }));

  const comments = item.comments.map((c) => ({
    author: c.author.displayName,
    content: c.content,
    date: c.createdAt.toISOString(),
  }));

  const summary = await summarizeHistory(item.title, item.description, activities, comments);
  if (!summary) {
    res.status(500).json({ error: 'Summary generation failed', code: 'AI_ERROR' });
    return;
  }

  // Cache the summary on the work item
  await prisma.workItem.update({
    where: { id },
    data: { aiSummary: summary },
  });

  res.json({ summary });
});

// POST /api/ai/find-similar — Find similar work items
aiRouter.post('/find-similar', async (req: AuthRequest, res: Response) => {
  const { title, description, teamId } = req.body;

  if (!title) {
    res.status(400).json({ error: 'Title required', code: 'VALIDATION_ERROR' });
    return;
  }

  // Get existing items from the team
  const existingItems = await prisma.workItem.findMany({
    where: {
      teamId,
      status: { notIn: ['CLOSED'] },
    },
    select: { id: true, identifier: true, title: true, description: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  if (!isAIAvailable() || existingItems.length === 0) {
    // Fallback: simple text-based matching
    const matches = existingItems.filter((item) => {
      const titleLower = title.toLowerCase();
      return (
        item.title.toLowerCase().includes(titleLower) ||
        titleLower.includes(item.title.toLowerCase())
      );
    }).slice(0, 5);

    res.json({ similar: matches.map((m) => ({ ...m, similarity: 'text-match' })) });
    return;
  }

  const similar = await findSimilarByText(title, description || '', existingItems);
  res.json({ similar });
});
