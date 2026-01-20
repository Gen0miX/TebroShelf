import { db } from '../../db';
import { books, type Visibility } from '../../db/schema';
import type { UserRole } from '../../db/schema';
import { eq, and, SQL } from 'drizzle-orm';

/**
 * Set the visibility of a book (AC #1)
 * @param bookId - The ID of the book to update
 * @param visibility - The new visibility value ('public' | 'private')
 */
export async function setBookVisibility(bookId: number, visibility: Visibility): Promise<void> {
  await db
    .update(books)
    .set({ visibility, updated_at: new Date() })
    .where(eq(books.id, bookId));
}

/**
 * Get visibility filter for book queries based on user role (AC #2, #3)
 * - Admin sees all content (no filter)
 * - Regular users only see 'public' content
 *
 * @param userRole - The role of the user making the request
 * @returns SQL condition or undefined (for admin - no filter needed)
 */
export function getVisibilityFilter(userRole: UserRole): SQL | undefined {
  if (userRole === 'admin') {
    // Admin sees everything - no filter applied
    return undefined;
  }

  // Regular users only see public content
  return eq(books.visibility, 'public');
}

/**
 * Check if a user can see a specific book based on its visibility
 * @param visibility - The book's visibility setting
 * @param userRole - The role of the user
 * @returns true if user can see the book
 */
export function canUserSeeBook(visibility: Visibility, userRole: UserRole): boolean {
  if (userRole === 'admin') {
    return true;
  }
  return visibility === 'public';
}

/**
 * Helper function to apply visibility filter to book queries (AC #2, #3, #5)
 * Reusable for all book queries throughout the application.
 *
 * @param userRole - The role of the user making the request
 * @param additionalConditions - Optional additional SQL conditions to combine
 * @returns Combined SQL condition or undefined if no conditions needed
 */
export function applyVisibilityFilter(
  userRole: UserRole,
  additionalConditions?: SQL[]
): SQL | undefined {
  const visibilityFilter = getVisibilityFilter(userRole);

  const conditions: SQL[] = [];

  if (visibilityFilter) {
    conditions.push(visibilityFilter);
  }

  if (additionalConditions && additionalConditions.length > 0) {
    conditions.push(...additionalConditions);
  }

  if (conditions.length === 0) {
    return undefined;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return and(...conditions);
}
