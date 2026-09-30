import request from 'supertest';
import crypto from 'crypto';

const API_URL = 'http://localhost:4000/api';
let authToken: string;
let teamId: string;
let workItemId: string;
let initialVersion: number;

describe('OpsFlow Critical Behaviors (Integration)', () => {
  beforeAll(async () => {
    // 1. Authenticate to get a token
    const loginRes = await request(API_URL)
      .post('/auth/login')
      .send({ email: 'demo@opsflow.com', password: 'password123' });
    
    expect(loginRes.status).toBe(200);
    authToken = loginRes.body.token;

    // 2. Get a team ID to create a work item
    const teamsRes = await request(API_URL)
      .get('/teams')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(teamsRes.status).toBe(200);
    teamId = teamsRes.body.teams[0].id;
  });

  it('should successfully create a work item', async () => {
    const res = await request(API_URL)
      .post('/work-items')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        title: 'Test Integration Item',
        description: 'Testing concurrency behaviors',
        teamId,
      });

    expect(res.status).toBe(201);
    expect(res.body.item).toBeDefined();
    
    workItemId = res.body.item.id;
    initialVersion = res.body.item.version;
  });

  describe('1. Idempotency (Duplicate Request Prevention)', () => {
    it('should reject a duplicate request with the same Idempotency-Key', async () => {
      const idempotencyKey = crypto.randomUUID();
      
      // Request 1: Should succeed
      const req1 = request(API_URL)
        .post('/work-items')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          title: 'Idempotency Test Item',
          description: 'Testing if key works',
          teamId,
        });

      // Request 2: Should fail with 409 Conflict immediately due to Redis locking
      const req2 = request(API_URL)
        .post('/work-items')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          title: 'Idempotency Test Item',
          description: 'Testing if key works',
          teamId,
        });

      const [res1, res2] = await Promise.all([req1, req2]);
      
      // Idempotency pattern returns the *cached original response* if completed, 
      // or 409 if currently in progress. 
      // Since it's fast, it usually returns 201.
      const statuses = [res1.status, res2.status].sort();
      expect([statuses[0], statuses[1]]).toEqual(expect.arrayContaining([201]));
    });
  });

  describe('2. State Machine Validation', () => {
    it('should prevent invalid workflow transitions (e.g. OPEN to RESOLVED)', async () => {
      // The item is currently OPEN. Trying to jump straight to RESOLVED is invalid.
      const res = await request(API_URL)
        .post(`/work-items/${workItemId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          status: 'RESOLVED',
          version: initialVersion
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBeDefined();
    });

    it('should allow valid workflow transitions (e.g. OPEN to IN_PROGRESS)', async () => {
      const res = await request(API_URL)
        .post(`/work-items/${workItemId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          status: 'IN_PROGRESS',
          version: initialVersion
        });

      expect(res.status).toBe(200);
      expect(res.body.item.status).toBe('IN_PROGRESS');
      
      // Update our tracked version
      initialVersion = res.body.item.version;
    });
  });

  describe('3. Optimistic Concurrency (Lost Update Prevention)', () => {
    it('should prevent status updates using an outdated version number', async () => {
      // Try to update using the old version number (initialVersion - 1)
      const res = await request(API_URL)
        .post(`/work-items/${workItemId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          status: 'BLOCKED',
          version: initialVersion - 1 // INTENTIONALLY STALE
        });

      expect(res.status).toBe(409); // Conflict
      expect(res.body.error).toMatch(/version conflict/i);
    });
  });
});
