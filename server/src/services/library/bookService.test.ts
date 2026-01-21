import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../db";
import { books } from "../../db/schema";
import * as bookService from "./bookService";

describe("bookService", () => {
  beforeEach(async () => {
    // Clean books table before each test
    await db.delete(books);
  });

  describe("createBook", () => {
    it("creates book with default status pending", async () => {
      const book = await bookService.createBook({
        title: "Test book",
        file_path: "/test/book.epub",
        file_type: "epub",
        content_type: "book",
      });
      expect(book.status).toBe("pending");
    });

    it("creates book with default visibility public", async () => {
      const book = await bookService.createBook({
        title: "Test book",
        file_path: "/test/book.epub",
        file_type: "epub",
        content_type: "book",
      });
      expect(book.visibility).toBe("public");
    });

    it("rejects duplicate file_path", async () => {
      await bookService.createBook({
        title: "First Book",
        file_path: "/same/path.epub",
        file_type: "epub",
        content_type: "book",
      });

      await expect(
        bookService.createBook({
          title: "Second Book",
          file_path: "/same/path.epub",
          file_type: "epub",
          content_type: "book",
        }),
      ).rejects.toThrow();
    });
  });

  describe("getBookById", () => {
    it("returns null for non-existent book", async () => {
      const book = await bookService.getBookById(99999);
      expect(book).toBeNull();
    });

    it("returns book when it exists", async () => {
      const created = await bookService.createBook({
        title: "Find By Id Book",
        file_path: "/test/find-by-id.epub",
        file_type: "epub",
        content_type: "book",
      });

      const found = await bookService.getBookById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Find By Id Book");
    });
  });

  describe("getBookByFilePath", () => {
    it("returns null for non-existent file path", async () => {
      const book = await bookService.getBookByFilePath(
        "/non/existent/path.epub",
      );
      expect(book).toBeNull();
    });

    it("returns book when file path exists", async () => {
      const filePath = "/test/find-by-path.epub";
      await bookService.createBook({
        title: "Find By Path Book",
        file_path: filePath,
        file_type: "epub",
        content_type: "book",
      });

      const found = await bookService.getBookByFilePath(filePath);
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Find By Path Book");
      expect(found!.file_path).toBe(filePath);
    });
  });

  describe("updateBook", () => {
    it("updates updated_at timestamp", async () => {
      const book = await bookService.createBook({
        title: "Test Book",
        file_path: "/test/update.epub",
        file_type: "epub",
        content_type: "book",
      });

      const originalUpdatedAt = book.updated_at;

      // Delay to ensure timestamp difference (SQLite stores timestamps with second precision)
      await new Promise((r) => setTimeout(r, 1000));

      const updated = await bookService.updateBook(book.id, {
        title: "Updated Title",
      });

      expect(updated.updated_at.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
    });
  });

  describe("deleteBook", () => {
    it("deletes the book", async () => {
      const book = await bookService.createBook({
        title: "To be deleted",
        file_path: "/to/be/deleted.epub",
        file_type: "epub",
        content_type: "book",
      });
      await bookService.deleteBook(book.id);
      const fetched = await bookService.getBookById(book.id);
      expect(fetched).toBeNull();
    });
  });
});
