import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createUser } from '../services/auth/userService';

/**
 * Seeds the initial admin user if no admins exist.
 */
export async function seedAdmin() {
  try {
    const admins = await db.select().from(users).where(eq(users.role, 'admin'));
    
    if (admins.length === 0) {
      const username = 'admin';
      const password = process.env.ADMIN_DEFAULT_PASSWORD || 'changeme123';
      
      console.log(`No admin users found. Creating default admin: ${username}`);
      
      await createUser({
        username,
        password,
        role: 'admin',
      });
      
      console.log('Default admin user created successfully. Please change the password immediately!');
    } else {
      console.log('Admin user already exists. Skipping seed.');
    }
  } catch (error) {
    console.error('Failed to seed admin user:', error);
  }
}
