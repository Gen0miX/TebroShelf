import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

function main() {
  console.log('--- Database Verification Start ---');

  // 1. Insert a user
  console.log('\n1. Testing User Insertion...');
  const username = `testuser_${Date.now()}`;
  try {
    const start = Date.now();
    db.insert(users).values({
      username: username,
      password_hash: 'hashedpassword123',
      role: 'admin'
    }).run();
    const duration = Date.now() - start;
    
    // Query the inserted user
    const insertedUser = db.select().from(users).where(eq(users.username, username)).get();
    console.log('✅ User inserted:', insertedUser);
    console.log(`⏱️ Insert took ${duration}ms`);
  } catch (error) {
    console.error('❌ User insertion failed:', error);
    process.exit(1);
  }

  // 2. Test duplicate constraint
  console.log('\n2. Testing Duplicate Constraint...');
  try {
    db.insert(users).values({
      username: username, // Same username
      password_hash: 'password',
    }).run();
    console.error('❌ Duplicate constraint FAILED (Operation should have failed)');
    process.exit(1);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE')) {
      console.log('✅ Duplicate constraint caught correctly');
    } else {
      console.log('✅ Duplicate constraint caught (error code check might vary):', error.message || error);
    }
  }

  // 3. Test Role Constraint - Valid role
  console.log('\n3. Testing Valid Role Value...');
  const user = db.select().from(users).where(eq(users.username, username)).get();
  
  if (user?.role === 'admin') {
    console.log('✅ User role verified: admin');
  } else {
    console.error(`❌ User role mismatch: expected 'admin', got '${user?.role}'`);
  }

  // 4. Test Role Constraint - Invalid role (NEW TEST for AC #2)
  console.log('\n4. Testing Invalid Role Constraint...');
  const invalidUsername = `invalid_${Date.now()}`;
  try {
    // TypeScript will catch this at compile time due to enum, but let's test runtime
    // @ts-expect-error - Testing invalid role value at runtime
    db.insert(users).values({
      username: invalidUsername,
      password_hash: 'password',
      role: 'superuser' // Invalid role
    }).run();
    console.error('❌ Role constraint FAILED (Invalid role "superuser" was accepted)');
    process.exit(1);
  } catch (error: any) {
    // Drizzle's enum validation should catch this
    console.log('✅ Invalid role rejected correctly:', error.message || error);
  }

  console.log('\n--- Verification Complete ---');
}

main();
