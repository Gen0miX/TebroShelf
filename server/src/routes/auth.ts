import { Router } from 'express';
import { registerUserSchema, loginSchema } from '../utils/validators';
import { createUser, findUserByUsername } from '../services/auth/userService';
import { login } from '../services/auth/authService';
import { deleteSession, validateSession, isValidTokenFormat } from '../services/auth/sessionService';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/v1/auth/register - Admin-only: Create new user (Story 1.6, Task 5)
router.post('/register', requireAuth, requireAdmin, async (req, res) => {
  try {
    // 1. Validate request body
    const validation = registerUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid registration data',
          details: validation.error.flatten().fieldErrors,
        },
      });
    }

    const { username, password, role } = validation.data;

    // 2. Check for existing user
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({
        error: {
          code: 'USERNAME_EXISTS',
          message: 'Username already taken',
        },
      });
    }

    // 3. Create user
    const user = await createUser({ username, password, role });

    logger.info('User registered successfully', { context: 'auth', username, userId: user.id });

    // 4. Return success
    return res.status(201).json({
      data: user,
    });
  } catch (error) {
    logger.error('Registration failed', { context: 'auth', error: error as Error });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    // 1. Validate request body
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid login data',
          details: validation.error.flatten().fieldErrors,
        },
      });
    }

    const { username, password } = validation.data;

    // 2. Attempt login
    const result = await login(username, password);

    if (!result.success) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        },
      });
    }

    // 3. Set httpOnly cookie with session token (AC #3)
    const SESSION_EXPIRY_DAYS = parseInt(process.env.SESSION_EXPIRY_DAYS || '7');
    res.cookie('session', result.session!.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    });

    logger.info('User logged in successfully', { context: 'auth', username, userId: result.user!.id });

    // 4. Return user data (AC #4 - frontend handles redirect)
    return res.json({
      data: result.user,
    });
  } catch (error) {
    logger.error('Login failed', { context: 'auth', error: error as Error });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

// GET /api/v1/auth/me - Get current authenticated user (AC #6)
router.get('/me', requireAuth, (req, res) => {
  // User is already validated and attached by requireAuth middleware
  return res.json({
    data: req.user,
  });
});

// POST /api/v1/auth/logout - Logout user and invalidate session (Story 1.5, AC #1, #2, #3)
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.session;
    let userId: number | undefined;

    // Delete session from database if token exists and is valid format (AC #1)
    // Validate token format before DB query (defense in depth)
    if (token && isValidTokenFormat(token)) {
      // Get userId for logging before deleting session
      const sessionData = await validateSession(token);
      if (sessionData) {
        userId = sessionData.user.id;
      }
      await deleteSession(token);
      logger.info('User logged out', { context: 'auth', userId });
    }

    // Always clear cookie, even if no session found - idempotent (AC #2)
    res.clearCookie('session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return res.json({
      data: { message: 'Logged out successfully' },
    });
  } catch (error) {
    logger.error('Logout failed', { context: 'auth', error: error as Error });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

export default router;
