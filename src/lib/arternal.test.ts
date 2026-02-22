import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the fetchAllPages helper with mocked fetcher
describe("fetchAllPages", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fetches all pages until has_more is false", async () => {
    // Mock a fetcher that returns 2 pages
    const mockFetcher = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: 1 }, { id: 2 }],
        pagination: {
          total: "3",
          count: 2,
          per_page: 2,
          current_page: 1,
          total_pages: 2,
          has_more: true,
        },
      })
      .mockResolvedValueOnce({
        data: [{ id: 3 }],
        pagination: {
          total: "3",
          count: 1,
          per_page: 2,
          current_page: 2,
          total_pages: 2,
          has_more: false,
        },
      });

    const { fetchAllPages } = await import("./arternal");
    const results = await fetchAllPages(mockFetcher, {}, 2);

    expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(mockFetcher).toHaveBeenCalledTimes(2);
    expect(mockFetcher).toHaveBeenCalledWith({ limit: "2", offset: "0" });
    expect(mockFetcher).toHaveBeenCalledWith({ limit: "2", offset: "2" });
  });

  it("handles single page results", async () => {
    const mockFetcher = vi.fn().mockResolvedValueOnce({
      data: [{ id: 1 }],
      pagination: {
        total: "1",
        count: 1,
        per_page: 100,
        current_page: 1,
        total_pages: 1,
        has_more: false,
      },
    });

    const { fetchAllPages } = await import("./arternal");
    const results = await fetchAllPages(mockFetcher);

    expect(results).toEqual([{ id: 1 }]);
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });

  it("merges baseParams with pagination params", async () => {
    const mockFetcher = vi.fn().mockResolvedValueOnce({
      data: [{ id: 1 }],
      pagination: {
        total: "1",
        count: 1,
        per_page: 50,
        current_page: 1,
        total_pages: 1,
        has_more: false,
      },
    });

    const { fetchAllPages } = await import("./arternal");
    await fetchAllPages(mockFetcher, { search: "test" }, 50);

    expect(mockFetcher).toHaveBeenCalledWith({
      search: "test",
      limit: "50",
      offset: "0",
    });
  });

  it("returns empty array when first page has no data", async () => {
    const mockFetcher = vi.fn().mockResolvedValueOnce({
      data: [],
      pagination: {
        total: "0",
        count: 0,
        per_page: 100,
        current_page: 1,
        total_pages: 0,
        has_more: false,
      },
    });

    const { fetchAllPages } = await import("./arternal");
    const results = await fetchAllPages(mockFetcher);

    expect(results).toEqual([]);
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });
});
