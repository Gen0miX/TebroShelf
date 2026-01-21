import { db } from "../../db";
import { books, Book, NewBook } from "../../db/schema";
import { eq } from "drizzle-orm";

export interface CreateBookDTO extends Omit<NewBook, "genres"> {
  genres?: string[];
}

export async function createBook(data: CreateBookDTO): Promise<Book> {
  const formattedData = {
    ...data,
    genres: data.genres ? JSON.stringify(data.genres) : null,
  } as NewBook;

  const [book] = await db.insert(books).values(formattedData).returning();
  return book;
}

export async function getBookById(id: number): Promise<Book | null> {
  const [book] = await db.select().from(books).where(eq(books.id, id));
  return book ?? null;
}

export async function getBookByFilePath(
  filePath: string,
): Promise<Book | null> {
  const [book] = await db
    .select()
    .from(books)
    .where(eq(books.file_path, filePath));
  return book ?? null;
}

export async function updateBook(
  id: number,
  data: Partial<CreateBookDTO>,
): Promise<Book> {
  const { genres, ...rest } = data;
  const updateData: Partial<NewBook> & { updated_at: Date } = {
    ...rest,
    updated_at: new Date(),
  };

  if (genres !== undefined) {
    updateData.genres = genres ? JSON.stringify(genres) : null;
  }

  const [book] = await db
    .update(books)
    .set(updateData)
    .where(eq(books.id, id))
    .returning();

  return book;
}

export async function deleteBook(id: number): Promise<void> {
  await db.delete(books).where(eq(books.id, id));
}
