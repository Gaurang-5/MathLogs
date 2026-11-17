import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { teacherMutationIdempotency } from '../src/middleware/teacherMutationIdempotency';

type Row = {
  id: string;
  instituteId: string;
  idempotencyKey: string;
  action: string;
  result: any;
  createdAt: Date;
};

function fakeStore() {
  const rows = new Map<string, Row>();
  return {
    async create({ data }: any) {
      const key = `${data.instituteId}:${data.idempotencyKey}`;
      if (rows.has(key)) throw { code: 'P2002' };
      const row = { ...data, id: `row-${rows.size + 1}`, createdAt: new Date() } as Row;
      rows.set(key, row);
      return { id: row.id };
    },
    async findUnique({ where }: any) {
      const key = `${where.instituteId_idempotencyKey.instituteId}:${where.instituteId_idempotencyKey.idempotencyKey}`;
      return rows.get(key) ?? null;
    },
    async updateMany({ where, data }: any) {
      const row = [...rows.values()].find(candidate => candidate.id === where.id);
      if (!row) return { count: 0 };
      row.result = data.result;
      return { count: 1 };
    },
    async update({ where, data }: any) {
      const row = [...rows.values()].find(candidate => candidate.id === where.id);
      if (!row) throw new Error('missing receipt');
      row.result = data.result;
      return row;
    },
    async delete({ where }: any) {
      const entry = [...rows.entries()].find(([, row]) => row.id === where.id);
      if (entry) rows.delete(entry[0]);
      return entry?.[1];
    },
  };
}

test('replays a completed teacher mutation without executing it twice', async () => {
  const app = express();
  const store = fakeStore();
  let executions = 0;
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 'teacher-1', instituteId: 'institute-1' };
    next();
  });
  app.post('/marks', teacherMutationIdempotency('UPSERT_MARK', store as any), (_req, res) => {
    executions += 1;
    res.json({ id: 'mark-1', score: 8 });
  });

  const first = await request(app).post('/marks').set('Idempotency-Key', 'mobile:test:123').send({ score: 8 });
  const replay = await request(app).post('/marks').set('Idempotency-Key', 'mobile:test:123').send({ score: 8 });

  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { id: 'mark-1', score: 8 });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.deepEqual(replay.body, first.body);
  assert.equal(executions, 1);
});

test('rejects an idempotency key reused with different data', async () => {
  const app = express();
  const store = fakeStore();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 'teacher-1', instituteId: 'institute-1' };
    next();
  });
  app.post('/tests', teacherMutationIdempotency('CREATE_TEST', store as any), (_req, res) => res.json({ id: 'test-1' }));

  await request(app).post('/tests').set('Idempotency-Key', 'mobile:test:456').send({ name: 'A' });
  const conflict = await request(app).post('/tests').set('Idempotency-Key', 'mobile:test:456').send({ name: 'B' });

  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'IDEMPOTENCY_KEY_REUSED');
});
