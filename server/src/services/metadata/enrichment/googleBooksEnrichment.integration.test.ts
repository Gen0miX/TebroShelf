import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enrichFromGoogleBooks } from "./googleBooksEnrichment";
import { db } from "../../../db";
import { books } from "../../../db/schema";
import { eq } from "drizzle-orm";
import * as scrapingConfig from "../../../config/scraping";
import * as wsEvent from "../../../websocket/event";
import fs from "fs/promises";
import path from "path";

// Mock external dependencies that involve network or side effects
vi.mock("fs/promises");
vi.mock("../../../websocket/event");
vi.mock("../../../config/scraping", () => ({
  getScrapingConfig: vi.fn(() => ({
    googleBooks: {
      apiBaseUrl: "https://www.googleapis.com/books/v1",
      apiKey: "TEST_API_KEY",
      rateLimit: 1000,
      rateLimitWindow: 60000,
      searchTimeout: 5000,
      maxRetries: 1,
    },
    openLibrary: { enabled: true, userAgent: "Test" },
  })),
}));

describe("Google Books Enrichment - Integration Tests (Story 7 task 8)", () => {
  let testBookId: number;
  let fetchMock: any;
  const testIsbn = "9780132350884"; // Clean Code ISBN

  // Sample Google Books API Response
  const mockGoogleBooksResponse = {
    totalItems: 1,
    items: [
      {
        id: "test-volume-id",
        volumeInfo: {
          title: "Clean Code Integration",
          authors: ["Robert C. Martin"],
          description: "A Handbook of Agile Software Craftsmanship",
          publisher: "Prentice Hall",
          publishedDate: "2008-08-01",
          categories: ["Computers"],
          industryIdentifiers: [{ type: "ISBN_13", identifier: testIsbn }],
          imageLinks: {
            thumbnail: "http://books.google.com/books/content?id=test&printsec=frontcover&img=1&zoom=1",
            extraLarge: "http://books.google.com/books/content?id=test&printsec=frontcover&img=1&zoom=6"
          }
        }
      }
    ]
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // 1. Setup Database: Insert a test book
    const [insertedBook] = await db
      .insert(books)
      .values({
        title: "Clean Code", // Initial title
        isbn: testIsbn,
        content_type: "book",
        file_path: "/tmp/test/clean_code.epub",
        file_type: "epub",
        status: "pending", // Should change to 'enriched'
      })
      .returning();
    testBookId = insertedBook.id;

    // 2. Mock Configuration
    vi.mocked(scrapingConfig.getScrapingConfig).mockReturnValue({
      googleBooks: {
        apiBaseUrl: "https://www.googleapis.com/books/v1",
        apiKey: "TEST_API_KEY", // Fake key
        rateLimit: 1000,
        rateLimitWindow: 60000,
        searchTimeout: 5000,
        maxRetries: 1,
      },
      openLibrary: { enabled: true, userAgent: "Test" }
    } as any);

    // 3. Mock Network (fetch) - Handle both API and Image
    fetchMock = vi.fn(async (url: string) => {
      // Handle Google Books API Search
      if (url.includes("googleapis.com/books/v1/volumes")) {
        return {
          ok: true,
          status: 200,
          json: async () => mockGoogleBooksResponse,
        } as Response;
      }

      // Handle Cover Image Download
      if (url.includes("books.google.com/books/content")) {
        // Return a dummy buffer for the image
        const dummyBuffer = new ArrayBuffer(1024); // 1KB dummy image
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: async () => dummyBuffer,
        } as Response;
      }

      return { ok: false, status: 404, statusText: "Not Found" } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

     // 4. Mock FS for Cover Downloader
     vi.mocked(fs.mkdir).mockResolvedValue(undefined);
     vi.mocked(fs.writeFile).mockResolvedValue(undefined);
     vi.mocked(fs.stat).mockRejectedValue(new Error("File not found")); // Simulate cover missing
  });

  afterEach(async () => {
    // Cleanup DB
    if (testBookId) {
      await db.delete(books).where(eq(books.id, testBookId));
    }
    vi.restoreAllMocks();
  });

  // 8.2 Test full enrichment flow from book ID to updated record
  it("should perform full enrichment: search, download cover, and update DB", async () => {
    // Perform Enrichment
    const result = await enrichFromGoogleBooks(testBookId);

    // Verify Function Result
    expect(result.success).toBe(true);
    expect(result.bookId).toBe(testBookId);
    expect(result.source).toBe("googlebooks");
    expect(result.coverUpdated).toBe(true);
    expect(result.fieldsUpdated).toEqual(expect.arrayContaining(["author", "description", "publisher"]));
    expect(result.fieldsUpdated).not.toContain("title"); // Title exists, so it's not updated

    // 8.5 Test book record updated with all enriched metadata
    const updatedBook = await db.select().from(books).where(eq(books.id, testBookId)).get();
    
    expect(updatedBook).toBeDefined();
    expect(updatedBook?.title).toBe("Clean Code"); // Not updated because it existed
    expect(updatedBook?.author).toBe("Robert C. Martin");
    expect(updatedBook?.publisher).toBe("Prentice Hall");
    expect(updatedBook?.status).toBe("enriched");
    expect(updatedBook?.cover_path).toMatch(/covers[/\\]\d+\.jpg/);
  });

  // 8.3 Test WebSocket events emitted during enrichment
  it("should emit progress events during the process", async () => {
    await enrichFromGoogleBooks(testBookId);

    // Verify "Started" event
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
        testBookId,
        "googlebooks-search-started",
        expect.any(Object)
    );

    // Verify "Match Found" event
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
        testBookId,
        "googlebooks-match-found",
        expect.objectContaining({
            matchTitle: "Clean Code Integration"
        })
    );

    // Verify "Completed" event (uses dedicated emitEnrichmentCompleted)
    expect(wsEvent.emitEnrichmentCompleted).toHaveBeenCalledWith(
        testBookId,
        expect.objectContaining({
            source: "googlebooks",
            fieldsUpdated: expect.arrayContaining(["author"])
        })
    );
  });

  // 8.4 Test cover image downloaded and saved correctly
  it("should download the cover image and save it to disk", async () => {
    await enrichFromGoogleBooks(testBookId);
    
    // Verify fetch was called for the image with correct parameters (googleBooksClient adds zoom=1)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("img=1&zoom=1"));

    // Verify fs.writeFile was called to save the image
    const writeCalls = vi.mocked(fs.writeFile).mock.calls;
    expect(writeCalls.length).toBeGreaterThan(0);
    
    // Check arguments of the first write call
    const [filePath, buffer] = writeCalls[0];
    expect(String(filePath)).toContain("covers");
    expect(String(filePath)).toContain(`${testBookId}.jpg`);
    expect(buffer).toBeInstanceOf(Buffer);
  });

  it("should fail gracefully if API key is invalid or request fails", async () => {
    // Modify existing fetchMock to fail on next call
    fetchMock.mockRejectedValue(new Error("Network Error"));

    const result = await enrichFromGoogleBooks(testBookId);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No matching book found on Google Books");

    // Verify WS failure event
    expect(wsEvent.emitEnrichmentProgress).toHaveBeenCalledWith(
        testBookId,
        "googlebooks-no-match", // It actually emits no-match, not enrichment-failed, if match is null
        expect.any(Object)
    );

    // Verify DB was NOT updated status
    const bookInDb = await db.select().from(books).where(eq(books.id, testBookId)).get();
    expect(bookInDb?.status).toBe("pending"); 
  });
});
