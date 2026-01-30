import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

// Mock the db module
vi.mock('../db', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: vi.fn(),
    catch: vi.fn(),
  };
  return { db: mockDb };
});

// Mock requireAuth middleware
vi.mock('../middleware/auth', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-mock-user']) {
      req.user = JSON.parse(req.headers['x-mock-user'] as string);
    }
    next();
  },
}));

// Mock requireAdmin middleware
vi.mock('../middleware/roleGuard', () => ({
  requireAdmin: (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }
    next();
  },
}));

import quarantineRouter from './quarantine';
import { db } from '../db';

const app = express();
app.use(express.json());
app.use('/api/v1/quarantine', quarantineRouter);

describe('Quarantine Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup the mock chain to return the db mock itself for fluid API
    vi.mocked(db.select).mockReturnThis();
    (db as any).from.mockReturnThis();
    (db as any).where.mockReturnThis();
    (db as any).orderBy.mockReturnThis();
  });

  describe('GET /api/v1/quarantine', () => {
    const mockAdminUser = { id: 1, username: 'admin', role: 'admin' };
    const mockRegularUser = { id: 2, username: 'user', role: 'user' };

    it('should return 200 OK for admin user (Task 3.5)', async () => {
      vi.mocked((db as any).then).mockImplementation((onFulfilled: any) => Promise.resolve(onFulfilled([])));

      const response = await request(app)
        .get('/api/v1/quarantine')
        .set('x-mock-user', JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
    });

    it('should return 403 Forbidden for regular user (Task 3.6)', async () => {
      const response = await request(app)
        .get('/api/v1/quarantine')
        .set('x-mock-user', JSON.stringify(mockRegularUser));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 401 Unauthorized for unauthenticated request (Task 3.7)', async () => {
      const response = await request(app).get('/api/v1/quarantine');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return quarantined books only and include required fields (Task 3.2, 3.3)', async () => {
      const mockQuarantinedBooks = [
        {
          id: 1,
          title: 'Bad EPUB',
          file_path: '/path/to/bad.epub',
          content_type: 'book',
          status: 'quarantine',
          failure_reason: 'Invalid format',
          created_at: new Date('2024-01-01T10:00:00Z'),
          updated_at: new Date('2024-01-01T10:00:00Z'),
          genres: null,
        },
      ];

      vi.mocked((db as any).then).mockImplementation((onFulfilled: any) => Promise.resolve(onFulfilled(mockQuarantinedBooks)));

      const response = await request(app)
        .get('/api/v1/quarantine')
        .set('x-mock-user', JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      
      const item = response.body.data[0];
      expect(item).toHaveProperty('file_path'); 
      expect(item.content_type).toBe('book');
      expect(item.failure_reason).toBe('Invalid format');
      expect(item.created_at).toBe(mockQuarantinedBooks[0].created_at.toISOString());
    });

    it('should return results sorted by created_at descending (Task 3.4)', async () => {
      const mockQuarantinedBooks = [
        {
          id: 2,
          title: 'Newer Error',
          created_at: new Date('2024-01-02T10:00:00Z'),
          updated_at: new Date('2024-01-02T10:00:00Z'),
          status: 'quarantine',
        },
        {
          id: 1,
          title: 'Older Error',
          created_at: new Date('2024-01-01T10:00:00Z'),
          updated_at: new Date('2024-01-01T10:00:00Z'),
          status: 'quarantine',
        },
      ];

      vi.mocked((db as any).then).mockImplementation((onFulfilled: any) => Promise.resolve(onFulfilled(mockQuarantinedBooks)));

      const response = await request(app)
        .get('/api/v1/quarantine')
        .set('x-mock-user', JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body.data[0].id).toBe(2);
      expect(response.body.data[1].id).toBe(1);
      
      expect((db as any).orderBy).toHaveBeenCalled();
    });

    it('should return empty data and meta total 0 when no items (Task 3.8)', async () => {
      vi.mocked((db as any).then).mockImplementation((onFulfilled: any) => Promise.resolve(onFulfilled([])));

      const response = await request(app)
        .get('/api/v1/quarantine')
        .set('x-mock-user', JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [],
        meta: { total: 0 },
      });
    });
  });

  describe('GET /api/v1/quarantine/count', () => {
    const mockAdminUser = { id: 1, username: 'admin', role: 'admin' };

    it('should return correct count (Task 3.9)', async () => {
      vi.mocked((db as any).then).mockImplementation((onFulfilled: any) => Promise.resolve(onFulfilled([{ count: 5 }])));

      const response = await request(app)
        .get('/api/v1/quarantine/count')
        .set('x-mock-user', JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body.data.count).toBe(5);
    });

    it('should return 0 when no quarantined items (Task 3.10)', async () => {
      vi.mocked((db as any).then).mockImplementation((onFulfilled: any) => Promise.resolve(onFulfilled([{ count: 0 }])));

      const response = await request(app)
        .get('/api/v1/quarantine/count')
        .set('x-mock-user', JSON.stringify(mockAdminUser));

      expect(response.status).toBe(200);
      expect(response.body.data.count).toBe(0);
    });
  });
});
