import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// All admin routes require authentication + admin role (AC #5: requireAuth before requireAdmin)
router.use(requireAuth);
router.use(requireAdmin);

// GET /api/v1/admin/users - List all users (Task 4.3)
router.get('/users', async (req, res) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        created_at: users.created_at,
      })
      .from(users);

    return res.json({ data: allUsers });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

// DELETE /api/v1/admin/users/:id - Delete user (Task 4.3)
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Validate userId is a valid number
    if (isNaN(userId) || !Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid user ID',
        },
      });
    }

    // Prevent self-deletion
    if (userId === req.user!.id) {
      return res.status(400).json({
        error: {
          code: 'INVALID_OPERATION',
          message: 'Cannot delete your own account',
        },
      });
    }

    await db.delete(users).where(eq(users.id, userId));

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

// PATCH /api/v1/admin/users/:id/role - Change user role (Task 4.3)
router.patch('/users/:id/role', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Validate userId is a valid number
    if (isNaN(userId) || !Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid user ID',
        },
      });
    }
    const { role } = req.body;

    // Validate role
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid role. Must be "admin" or "user"',
        },
      });
    }

    // Prevent changing own role
    if (userId === req.user!.id) {
      return res.status(400).json({
        error: {
          code: 'INVALID_OPERATION',
          message: 'Cannot change your own role',
        },
      });
    }

    const [updated] = await db
      .update(users)
      .set({ role, updated_at: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
      });

    if (!updated) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    return res.json({ data: updated });
  } catch (error) {
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
