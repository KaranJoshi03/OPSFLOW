import { PrismaClient, WorkItemStatus, WorkItemPriority, WorkItemType, TeamRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.activityLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.workItemTag.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 12);

  // Create users
  const users = await Promise.all([
    prisma.user.create({
      data: { email: 'alice@opsflow.com', passwordHash, displayName: 'Alice Johnson' },
    }),
    prisma.user.create({
      data: { email: 'bob@opsflow.com', passwordHash, displayName: 'Bob Smith' },
    }),
    prisma.user.create({
      data: { email: 'carol@opsflow.com', passwordHash, displayName: 'Carol Davis' },
    }),
    prisma.user.create({
      data: { email: 'dave@opsflow.com', passwordHash, displayName: 'Dave Wilson' },
    }),
    prisma.user.create({
      data: { email: 'eve@opsflow.com', passwordHash, displayName: 'Eve Martinez' },
    }),
    prisma.user.create({
      data: { email: 'demo@opsflow.com', passwordHash, displayName: 'Demo User' },
    }),
  ]);

  const [alice, bob, carol, dave, eve, demo] = users;

  // Create teams
  const teams = await Promise.all([
    prisma.team.create({
      data: { name: 'Engineering', slug: 'engineering', description: 'Software engineering team' },
    }),
    prisma.team.create({
      data: { name: 'Customer Support', slug: 'customer-support', description: 'Customer-facing support team' },
    }),
    prisma.team.create({
      data: { name: 'Operations', slug: 'operations', description: 'Infrastructure and ops team' },
    }),
  ]);

  const [engineering, support, operations] = teams;

  // Add team members with different roles
  await Promise.all([
    // Engineering team
    prisma.teamMember.create({ data: { userId: alice.id, teamId: engineering.id, role: 'ADMIN' } }),
    prisma.teamMember.create({ data: { userId: bob.id, teamId: engineering.id, role: 'TEAM_LEAD' } }),
    prisma.teamMember.create({ data: { userId: carol.id, teamId: engineering.id, role: 'MEMBER' } }),
    prisma.teamMember.create({ data: { userId: demo.id, teamId: engineering.id, role: 'MEMBER' } }),

    // Customer Support
    prisma.teamMember.create({ data: { userId: carol.id, teamId: support.id, role: 'ADMIN' } }),
    prisma.teamMember.create({ data: { userId: dave.id, teamId: support.id, role: 'TEAM_LEAD' } }),
    prisma.teamMember.create({ data: { userId: eve.id, teamId: support.id, role: 'MEMBER' } }),
    prisma.teamMember.create({ data: { userId: demo.id, teamId: support.id, role: 'MEMBER' } }),

    // Operations
    prisma.teamMember.create({ data: { userId: bob.id, teamId: operations.id, role: 'ADMIN' } }),
    prisma.teamMember.create({ data: { userId: alice.id, teamId: operations.id, role: 'MEMBER' } }),
    prisma.teamMember.create({ data: { userId: eve.id, teamId: operations.id, role: 'TEAM_LEAD' } }),
    prisma.teamMember.create({ data: { userId: demo.id, teamId: operations.id, role: 'MEMBER' } }),
  ]);

  // Create tags
  const tags = await Promise.all([
    prisma.tag.create({ data: { name: 'urgent', color: '#EF4444' } }),
    prisma.tag.create({ data: { name: 'billing', color: '#F59E0B' } }),
    prisma.tag.create({ data: { name: 'auth', color: '#8B5CF6' } }),
    prisma.tag.create({ data: { name: 'infrastructure', color: '#6366F1' } }),
    prisma.tag.create({ data: { name: 'performance', color: '#EC4899' } }),
    prisma.tag.create({ data: { name: 'security', color: '#EF4444' } }),
    prisma.tag.create({ data: { name: 'ux', color: '#14B8A6' } }),
    prisma.tag.create({ data: { name: 'api', color: '#3B82F6' } }),
  ]);

  // Create work items with realistic scenarios
  const workItems = await Promise.all([
    // Engineering items
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0001',
        title: 'Production API latency spike on /payments endpoint',
        description: 'Multiple customers reporting slow response times (>5s) on the payments API. CloudWatch shows P99 latency at 8200ms since 14:30 UTC. Appears correlated with the v2.14 deployment. Need immediate investigation.',
        type: 'INCIDENT',
        status: 'IN_PROGRESS',
        priority: 'CRITICAL',
        teamId: engineering.id,
        createdById: alice.id,
        assignedToId: bob.id,
      },
    }),
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0002',
        title: 'Implement rate limiting on public API endpoints',
        description: 'We\'re seeing abuse patterns on our public endpoints. Need to implement rate limiting with Redis-backed token bucket algorithm. Should support per-IP and per-API-key limits.',
        type: 'TASK',
        status: 'OPEN',
        priority: 'HIGH',
        teamId: engineering.id,
        createdById: bob.id,
      },
    }),
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0003',
        title: 'Database connection pool exhaustion during peak hours',
        description: 'PostgreSQL connection pool running out during 9-11 AM EST. Current pool size is 20, seeing 50+ concurrent requests. Need to tune pool settings and investigate potential connection leaks.',
        type: 'INVESTIGATION',
        status: 'UNDER_REVIEW',
        priority: 'HIGH',
        teamId: engineering.id,
        createdById: carol.id,
        assignedToId: alice.id,
      },
    }),

    // Customer Support items
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0004',
        title: 'Customer unable to update billing information',
        description: 'Customer (ID: CUST-4892) reports 500 error when trying to update their credit card info. They\'ve been unable to update for 3 days. Need to investigate and fix urgently as their subscription renewal is in 2 days.',
        type: 'CUSTOMER_ISSUE',
        status: 'OPEN',
        priority: 'HIGH',
        teamId: support.id,
        createdById: dave.id,
      },
    }),
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0005',
        title: 'Bulk refund processing for March billing error',
        description: 'Due to a billing calculation error in March, 47 customers were overcharged by 15-20%. Finance has approved refunds. Need to process bulk refunds and send confirmation emails.',
        type: 'APPROVAL',
        status: 'BLOCKED',
        priority: 'MEDIUM',
        teamId: support.id,
        createdById: carol.id,
        assignedToId: eve.id,
      },
    }),

    // Operations items
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0006',
        title: 'SSL certificate expiring in 14 days',
        description: 'The wildcard SSL certificate for *.opsflow.com expires on April 15. Need to renew with our certificate provider and deploy across all environments (prod, staging, dev).',
        type: 'TASK',
        status: 'OPEN',
        priority: 'MEDIUM',
        teamId: operations.id,
        createdById: bob.id,
        assignedToId: eve.id,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0007',
        title: 'GDPR compliance audit preparation',
        description: 'Annual GDPR compliance audit scheduled for next month. Need to prepare data processing documentation, update privacy impact assessments, and verify data retention policies are properly enforced.',
        type: 'COMPLIANCE',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        teamId: operations.id,
        createdById: alice.id,
        assignedToId: alice.id,
      },
    }),
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0008',
        title: 'Investigate unusual login attempts from Eastern Europe',
        description: 'Security monitoring has detected 2000+ failed login attempts from IP ranges in Eastern Europe over the past 48 hours. Need to analyze patterns, check if any accounts were compromised, and implement additional protections.',
        type: 'INCIDENT',
        status: 'OPEN',
        priority: 'CRITICAL',
        teamId: operations.id,
        createdById: eve.id,
      },
    }),
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0009',
        title: 'Customer reporting data export missing columns',
        description: 'Enterprise customer ACME Corp reports that their weekly data export CSV is missing the "transaction_date" and "currency" columns since last week. This breaks their internal reporting pipeline.',
        type: 'CUSTOMER_ISSUE',
        status: 'OPEN',
        priority: 'HIGH',
        teamId: support.id,
        createdById: dave.id,
        assignedToId: carol.id,
      },
    }),
    prisma.workItem.create({
      data: {
        identifier: 'OPS-0010',
        title: 'Migrate staging environment to new Kubernetes cluster',
        description: 'The current staging environment is running on k8s 1.24 which is EOL. Need to migrate all services to the new k8s 1.29 cluster. Includes updating Helm charts, testing all services, and cutting over DNS.',
        type: 'TASK',
        status: 'OPEN',
        priority: 'LOW',
        teamId: operations.id,
        createdById: bob.id,
      },
    }),
  ]);

  // Add some tags to work items
  await Promise.all([
    prisma.workItemTag.create({ data: { workItemId: workItems[0].id, tagId: tags[0].id } }), // urgent
    prisma.workItemTag.create({ data: { workItemId: workItems[0].id, tagId: tags[4].id } }), // performance
    prisma.workItemTag.create({ data: { workItemId: workItems[1].id, tagId: tags[7].id } }), // api
    prisma.workItemTag.create({ data: { workItemId: workItems[1].id, tagId: tags[5].id } }), // security
    prisma.workItemTag.create({ data: { workItemId: workItems[3].id, tagId: tags[1].id } }), // billing
    prisma.workItemTag.create({ data: { workItemId: workItems[4].id, tagId: tags[1].id } }), // billing
    prisma.workItemTag.create({ data: { workItemId: workItems[7].id, tagId: tags[5].id } }), // security
    prisma.workItemTag.create({ data: { workItemId: workItems[7].id, tagId: tags[0].id } }), // urgent
  ]);

  // Add comments to some work items
  await Promise.all([
    prisma.comment.create({
      data: {
        content: 'I\'ve checked the deployment logs and the latency spike correlates with a new database query in the payment validation flow. Looking into it now.',
        authorId: bob.id,
        workItemId: workItems[0].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Found the issue — the new query is doing a full table scan on the transactions table. Missing index on customer_id + created_at. Adding the index now.',
        authorId: bob.id,
        workItemId: workItems[0].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Confirmed with the customer. They last updated the billing info successfully on March 15th. The error started appearing on March 20th after our last release.',
        authorId: dave.id,
        workItemId: workItems[3].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Waiting on Finance team approval for the bulk refund. They need to review the impact assessment before we can proceed.',
        authorId: eve.id,
        workItemId: workItems[4].id,
      },
    }),
  ]);

  // Add activity logs
  await Promise.all([
    prisma.activityLog.create({
      data: {
        action: 'CREATED',
        workItemId: workItems[0].id,
        userId: alice.id,
      },
    }),
    prisma.activityLog.create({
      data: {
        action: 'ASSIGNED',
        workItemId: workItems[0].id,
        userId: alice.id,
        fieldName: 'assignedTo',
        newValue: bob.id,
      },
    }),
    prisma.activityLog.create({
      data: {
        action: 'STATUS_CHANGED',
        workItemId: workItems[0].id,
        userId: bob.id,
        fieldName: 'status',
        oldValue: 'OPEN',
        newValue: 'IN_PROGRESS',
      },
    }),
    prisma.activityLog.create({
      data: {
        action: 'PRIORITY_CHANGED',
        workItemId: workItems[0].id,
        userId: alice.id,
        fieldName: 'priority',
        oldValue: 'HIGH',
        newValue: 'CRITICAL',
      },
    }),
  ]);

  console.log('✅ Database seeded successfully!');
  console.log('\n📋 Demo credentials:');
  console.log('  Email: demo@opsflow.com');
  console.log('  Password: password123');
  console.log('\n  Other users: alice@, bob@, carol@, dave@, eve@ (same password)');

  await prisma.$disconnect();
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
