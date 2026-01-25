import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

// Mock the db module
vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

// Mock the scanService module
vi.mock('../services/file/scanService', () => ({
  triggerForceScan: vi.fn(),
  isScanRunning: vi.fn(),
}));

// Mock the logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

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

import adminRouter from './admin';
import { db } from '../db';
import { triggerForceScan, isScanRunning } from '../services/file/scanService';

const app = express();
app.use(express.json());
app.use('/api/v1/admin', adminRouter);

describe('Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/users', () => {
    // AC #3: Admin can access admin endpoint
    it('should return list of users for admin', async () => {
      const mockUsers = [
        { id: 1, username: 'admin', role: 'admin', created_at: new Date() },
        { id: 2, username: 'sophie', role: 'user', created_at: new Date() },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue(mockUsers),
      } as any);

      const response = await request(app)
        .get('/api/v1/admin/users')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].username).toBe('admin');
      expect(response.body.data[1].username).toBe('sophie');
    });

    // AC #1: Regular user receives 403
    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .get('/api/v1/admin/users')
        .set('x-mock-user', JSON.stringify({ id: 2, username: 'sophie', role: 'user' }));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    // AC #4: Unauthenticated receives 401
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app).get('/api/v1/admin/users');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('DELETE /api/v1/admin/users/:id', () => {
    it('should delete user for admin', async () => {
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      const response = await request(app)
        .delete('/api/v1/admin/users/2')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      expect(response.status).toBe(204);
    });

    it('should return 400 for invalid user ID', async () => {
      const response = await request(app)
        .delete('/api/v1/admin/users/invalid')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative user ID', async () => {
      const response = await request(app)
        .delete('/api/v1/admin/users/-1')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should prevent admin from deleting themselves', async () => {
      const response = await request(app)
        .delete('/api/v1/admin/users/1')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_OPERATION');
      expect(response.body.error.message).toBe('Cannot delete your own account');
    });

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .delete('/api/v1/admin/users/3')
        .set('x-mock-user', JSON.stringify({ id: 2, username: 'sophie', role: 'user' }));

      expect(response.status).toBe(403);
    });
  });

  describe('PATCH /api/v1/admin/users/:id/role', () => {
    it('should update user role for admin', async () => {
      const updatedUser = { id: 2, username: 'sophie', role: 'admin' };

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedUser]),
          }),
        }),
      } as any);

      const response = await request(app)
        .patch('/api/v1/admin/users/2/role')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
        .send({ role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.data.role).toBe('admin');
    });

    it('should return 400 for invalid user ID', async () => {
      const response = await request(app)
        .patch('/api/v1/admin/users/abc/role')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
        .send({ role: 'user' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative user ID', async () => {
      const response = await request(app)
        .patch('/api/v1/admin/users/-5/role')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
        .send({ role: 'user' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should prevent admin from changing own role', async () => {
      const response = await request(app)
        .patch('/api/v1/admin/users/1/role')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
        .send({ role: 'user' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_OPERATION');
      expect(response.body.error.message).toBe('Cannot change your own role');
    });

    it('should reject invalid role', async () => {
      const response = await request(app)
        .patch('/api/v1/admin/users/2/role')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
        .send({ role: 'superadmin' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const response = await request(app)
        .patch('/api/v1/admin/users/999/role')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
        .send({ role: 'admin' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .patch('/api/v1/admin/users/3/role')
        .set('x-mock-user', JSON.stringify({ id: 2, username: 'sophie', role: 'user' }))
        .send({ role: 'admin' });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/admin/scan', () => {
    // Task 8.2: Test POST /api/v1/admin/scan requires authentication
    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app).post('/api/v1/admin/scan');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    // Task 8.3: Test endpoint returns 403 for regular user
    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .post('/api/v1/admin/scan')
        .set('x-mock-user', JSON.stringify({ id: 2, username: 'sophie', role: 'user' }));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    // Task 8.4: Test endpoint returns 200 with scan results for admin
    it('should return 200 with scan results for admin', async () => {
      const mockScanResult = {
        filesFound: 5,
        filesProcessed: 3,
        filesSkipped: 2,
        errors: 0,
        duration: 1234,
      };

      vi.mocked(isScanRunning).mockReturnValue(false);
      vi.mocked(triggerForceScan).mockResolvedValue(mockScanResult);

      const response = await request(app)
        .post('/api/v1/admin/scan')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(mockScanResult);
      expect(response.body.data.filesFound).toBe(5);
      expect(response.body.data.filesProcessed).toBe(3);
      expect(response.body.data.duration).toBe(1234);
    });

    // Task 8.5: Test endpoint returns 409 when scan already running
    it('should return 409 when scan is already in progress', async () => {
      vi.mocked(isScanRunning).mockReturnValue(true);

      const response = await request(app)
        .post('/api/v1/admin/scan')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SCAN_IN_PROGRESS');
      expect(response.body.error.message).toContain('already in progress');
    });

    // Additional: Test scan service is called when no scan is running
    it('should call triggerForceScan when no scan is running', async () => {
      vi.mocked(isScanRunning).mockReturnValue(false);
      vi.mocked(triggerForceScan).mockResolvedValue({
        filesFound: 0,
        filesProcessed: 0,
        filesSkipped: 0,
        errors: 0,
        duration: 100,
      });

      await request(app)
        .post('/api/v1/admin/scan')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      expect(triggerForceScan).toHaveBeenCalled();
    });

    // Additional: Test error handling when triggerForceScan throws
    it('should handle errors from triggerForceScan gracefully', async () => {
      vi.mocked(isScanRunning).mockReturnValue(false);
      vi.mocked(triggerForceScan).mockRejectedValue(new Error('Scan failed unexpectedly'));

      const response = await request(app)
        .post('/api/v1/admin/scan')
        .set('x-mock-user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }));

      // Error should be passed to next() middleware (500 response depends on error handler)
      expect(response.status).toBe(500);
    });
  });
});
