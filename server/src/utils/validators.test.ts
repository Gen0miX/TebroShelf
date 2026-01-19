import { describe, it, expect } from 'vitest';
import { registerUserSchema } from './validators';

describe('Validators', () => {
  describe('registerUserSchema', () => {
    it('should validate valid data', () => {
      const result = registerUserSchema.safeParse({
        username: 'valid_user',
        password: 'password123',
        role: 'user',
      });
      expect(result.success).toBe(true);
    });

    it('should reject short username', () => {
      const result = registerUserSchema.safeParse({
        username: 'ab',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid username characters', () => {
      const result = registerUserSchema.safeParse({
        username: 'invalid user!',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const result = registerUserSchema.safeParse({
        username: 'valid_user',
        password: '123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid role', () => {
      const result = registerUserSchema.safeParse({
        username: 'valid_user',
        password: 'password123',
        role: 'superadmin',
      });
      expect(result.success).toBe(false);
    });
    
    it('should default role to user if missing', () => {
        const result = registerUserSchema.parse({
            username: 'valid_user',
            password: 'password123'
        });
        expect(result.role).toBe('user');
    })
  });
});
