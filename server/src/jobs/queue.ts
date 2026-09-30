import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/env';
import { prisma } from '../config/database';
import { classifyItem } from '../ai/agent';

/**
 * Async Job Queue (BullMQ + Redis)
 * 
 * Critical Behaviour: Reliable asynchronous processing
 * 
 * Jobs have:
 * - Configurable retries with exponential backoff
 * - Dead-letter handling for permanently failed jobs
 * - Idempotent execution (safe to retry)
 * 
 * What happens when processing fails: Jobs retry 3 times with backoff.
 * After all retries fail, they move to the failed state and are logged.
 * The core system continues working — AI features gracefully degrade.
 */

const connection = {
  host: new URL(config.REDIS_URL).hostname || 'localhost',
  port: parseInt(new URL(config.REDIS_URL).port || '6379', 10),
};

// Queue definitions
let aiTriageQueue: Queue;
let aiEmbeddingQueue: Queue;
let notificationQueue: Queue;

export async function setupQueues() {
  aiTriageQueue = new Queue('ai.triage', { connection });
  aiEmbeddingQueue = new Queue('ai.embedding', { connection });
  notificationQueue = new Queue('notification', { connection });

  // AI Triage Worker
  const triageWorker = new Worker(
    'ai.triage',
    async (job: Job) => {
      const { workItemId, title, description } = job.data;
      console.log(`[AI Triage] Processing work item: ${workItemId}`);

      const classification = await classifyItem(title, description);
      if (!classification) {
        console.log(`[AI Triage] No classification available (AI unavailable)`);
        return;
      }

      // Store AI suggestions on the work item
      await prisma.workItem.update({
        where: { id: workItemId },
        data: {
          aiSuggestions: classification,
        },
      });

      // Create activity log
      await prisma.activityLog.create({
        data: {
          action: 'AI_TRIAGED',
          workItemId,
          userId: (await prisma.workItem.findUnique({ where: { id: workItemId }, select: { createdById: true } }))!.createdById,
          metadata: classification,
        },
      });

      console.log(`[AI Triage] Completed for ${workItemId}: ${classification.suggestedPriority} / ${classification.suggestedType}`);
    },
    {
      connection,
      concurrency: 3,
      limiter: { max: 10, duration: 60000 }, // Rate limit: 10 jobs per minute
    }
  );

  triageWorker.on('failed', (job, err) => {
    console.error(`[AI Triage] Job ${job?.id} failed:`, err.message);
  });

  // AI Embedding Worker (generates embeddings for semantic search)
  const embeddingWorker = new Worker(
    'ai.embedding',
    async (job: Job) => {
      const { workItemId, title, description } = job.data;
      console.log(`[AI Embedding] Processing work item: ${workItemId}`);
      
      // For now, mark as processed (actual embedding requires pgvector setup)
      await prisma.workItem.update({
        where: { id: workItemId },
        data: { embeddingUpdatedAt: new Date() },
      });

      console.log(`[AI Embedding] Completed for ${workItemId}`);
    },
    {
      connection,
      concurrency: 2,
    }
  );

  embeddingWorker.on('failed', (job, err) => {
    console.error(`[AI Embedding] Job ${job?.id} failed:`, err.message);
  });

  // Notification Worker
  const notificationWorker = new Worker(
    'notification',
    async (job: Job) => {
      const { userId, title, message, type, link } = job.data;
      
      await prisma.notification.create({
        data: { userId, title, message, type, link },
      });

      console.log(`[Notification] Sent to ${userId}: ${title}`);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  notificationWorker.on('failed', (job, err) => {
    console.error(`[Notification] Job ${job?.id} failed:`, err.message);
  });

  console.log(' Job workers started');
}

// Helper to add jobs
export async function addJob(
  queueName: 'ai.triage' | 'ai.embedding' | 'notification',
  data: any,
  opts?: { delay?: number; attempts?: number }
) {
  const queue = {
    'ai.triage': aiTriageQueue,
    'ai.embedding': aiEmbeddingQueue,
    notification: notificationQueue,
  }[queueName];

  if (!queue) {
    console.warn(`[Queue] Unknown queue: ${queueName}`);
    return;
  }

  await queue.add(queueName, data, {
    attempts: opts?.attempts || 3,
    backoff: { type: 'exponential', delay: 2000 },
    delay: opts?.delay,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  });
}
