import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock config must be before importing the service because it's called at top level in some modules
vi.mock("../../config/scraping", () => ({
  getScrapingConfig: vi.fn(() => ({
    openLibrary: { apiBaseUrl: "http://ol.com", rateLimit: 1, rateLimitWindow: 1, searchTimeout: 1, maxRetries: 1 },
    googleBooks: { apiKey: "test-key" },
    aniList: {},
    myAnimeList: { clientId: "test-id" },
    mangaDex: {},
  })),
}));

import {
  getAvailableSources,
  searchMetadata,
} from "./metadataSearchService";
import * as olClient from "./sources/openLibraryClient";
import * as gbClient from "./sources/googleBooksClient";
import * as alClient from "./sources/anilistClient";
import * as malClient from "./sources/malClient";
import * as mdClient from "./sources/mangadexClient";
import { getScrapingConfig } from "../../config/scraping";

// Mock clients
vi.mock("./sources/openLibraryClient");
vi.mock("./sources/googleBooksClient");
vi.mock("./sources/anilistClient");
vi.mock("./sources/malClient");
vi.mock("./sources/mangadexClient");

// Mock logger
vi.mock("../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("metadataSearchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default config mock
    vi.mocked(getScrapingConfig).mockReturnValue({
      openLibrary: {} as any,
      googleBooks: { apiKey: "test-key" } as any,
      aniList: {} as any,
      myAnimeList: { clientId: "test-id" } as any,
      mangaDex: {} as any,
    });

    vi.mocked(gbClient.isConfigured).mockReturnValue(true);
  });

  describe("getAvailableSources", () => {
    it("returns all sources when everything is configured (Task 3.5)", () => {
      const sources = getAvailableSources();
      expect(sources).toContain("openlibrary");
      expect(sources).toContain("googlebooks");
      expect(sources).toContain("anilist");
      expect(sources).toContain("myanimelist");
      expect(sources).toContain("mangadex");
    });

    it("excludes googlebooks if not configured", () => {
      vi.mocked(gbClient.isConfigured).mockReturnValue(false);
      const sources = getAvailableSources();
      expect(sources).not.toContain("googlebooks");
    });

    it("excludes myanimelist if clientId is missing", () => {
      vi.mocked(getScrapingConfig).mockReturnValue({
        myAnimeList: { clientId: "" },
      } as any);
      const sources = getAvailableSources();
      expect(sources).not.toContain("myanimelist");
    });
  });

  describe("searchMetadata", () => {
    it("delegates to OpenLibraryClient and maps results (Task 3.2, 3.7)", async () => {
      const mockOlBook = {
        key: "/works/OL123",
        title: "One Piece",
        author_name: ["Eiichiro Oda"],
        first_publish_year: 1997,
        isbn: ["1234567890"],
        subject: ["Manga", "Adventure"],
        publisher: ["Shueisha"],
        language: ["jpn"],
      };

      vi.mocked(olClient.searchByTitle).mockResolvedValue([mockOlBook as any]);
      vi.mocked(olClient.getCoverUrl).mockReturnValue("http://cover.com/ol.jpg");

      const results = await searchMetadata("one piece", "openlibrary");

      expect(olClient.searchByTitle).toHaveBeenCalledWith("one piece");
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        sourceId: "/works/OL123",
        title: "One Piece",
        author: "Eiichiro Oda",
        coverUrl: "http://cover.com/ol.jpg",
        source: "openlibrary",
        publicationDate: "1997",
      });
    });

    it("delegates to GoogleBooksClient and maps results (Task 3.3, 3.7)", async () => {
      const mockGbVol = {
        id: "gb123",
        volumeInfo: {
          title: "Harry Potter",
          authors: ["J.K. Rowling"],
          description: "Wizard boy",
          publishedDate: "1997",
          categories: ["Fantasy"],
          imageLinks: { thumbnail: "http://cover.com/gb.jpg" },
          publisher: "Scholastic",
          language: "en",
          industryIdentifiers: [{ type: "ISBN_13", identifier: "978123" }],
        },
      };

      vi.mocked(gbClient.searchByTitle).mockResolvedValue([mockGbVol as any]);
      vi.mocked(gbClient.getCoverUrl).mockReturnValue("http://cover.com/gb.jpg");

      const results = await searchMetadata("harry potter", "googlebooks");

      expect(gbClient.searchByTitle).toHaveBeenCalledWith("harry potter");
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        sourceId: "gb123",
        title: "Harry Potter",
        author: "J.K. Rowling",
        description: "Wizard boy",
        coverUrl: "http://cover.com/gb.jpg",
        source: "googlebooks",
        isbn: "978123",
      });
    });

    it("delegates to AniListClient and maps results (Task 3.7)", async () => {
      const mockAlMedia = {
        id: 1,
        title: { english: "Naruto" },
        staff: { edges: [{ role: "Story & Art", node: { name: { full: "Masashi Kishimoto" } } }] },
        description: "Ninja <b>boy</b>",
        coverImage: { large: "http://cover.com/al.jpg" },
        genres: ["Action"],
        startDate: { year: 1999 },
      };

      vi.mocked(alClient.searchManga).mockResolvedValue([mockAlMedia as any]);
      vi.mocked(alClient.extractAuthor).mockReturnValue("Masashi Kishimoto");
      vi.mocked(alClient.stripHtmlTags).mockReturnValue("Ninja boy");
      vi.mocked(alClient.getCoverUrl).mockReturnValue("http://cover.com/al.jpg");

      const results = await searchMetadata("naruto", "anilist");

      expect(alClient.searchManga).toHaveBeenCalledWith("naruto");
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        title: "Naruto",
        author: "Masashi Kishimoto",
        description: "Ninja boy",
        source: "anilist",
      });
    });

    it("handles errors gracefully and returns empty array (Task 3.6)", async () => {
      vi.mocked(olClient.searchByTitle).mockRejectedValue(new Error("API Failure"));
      
      const results = await searchMetadata("fail", "openlibrary");
      
      expect(results).toEqual([]);
      // Should log error but not throw
    });

    it("returns empty array for unimplemented source", async () => {
        // @ts-ignore - testing runtime behavior for invalid input
        const results = await searchMetadata("test", "nonexistent");
        expect(results).toEqual([]);
    });

    it("delegates to MyAnimeListClient and maps results", async () => {
        const mockMalNode = {
            id: 1,
            title: "Bleach",
            main_picture: { medium: "mal.jpg" },
            synopsis: "Soul reaper",
            genres: [{ name: "Action" }],
            start_date: "2001-01-01",
            authors: []
        };
        vi.mocked(malClient.searchManga).mockResolvedValue([mockMalNode as any]);
        vi.mocked(malClient.getAuthorName).mockReturnValue("Tite Kubo");
        vi.mocked(malClient.getCoverUrl).mockReturnValue("http://cover.com/mal.jpg");

        const results = await searchMetadata("bleach", "myanimelist");

        expect(malClient.searchManga).toHaveBeenCalledWith("bleach");
        expect(results[0].title).toBe("Bleach");
        expect(results[0].author).toBe("Tite Kubo");
    });

    it("delegates to MangaDexClient and maps results", async () => {
        const mockMdManga = {
            id: "md1",
            attributes: {
                title: { en: "One Punch Man" },
                description: { en: "Bald hero" },
                year: 2012,
                tags: []
            },
            relationships: []
        };
        vi.mocked(mdClient.searchManga).mockResolvedValue([mockMdManga as any]);
        vi.mocked(mdClient.getLocalizedString).mockReturnValue("One Punch Man");
        vi.mocked(mdClient.getAuthorName).mockReturnValue("ONE");
        vi.mocked(mdClient.getCoverFileName).mockReturnValue("cover.jpg");
        vi.mocked(mdClient.buildCoverUrl).mockReturnValue("http://cover.com/md.jpg");

        const results = await searchMetadata("one punch", "mangadex");

        expect(mdClient.searchManga).toHaveBeenCalledWith("one punch");
        expect(results[0].title).toBe("One Punch Man");
        expect(results[0].author).toBe("ONE");
    });
  });
});
