"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

interface SearchResult {
  artwork_id: number;
  title: string;
  year: string | null;
  medium: string | null;
  dimensions: string | null;
  price: number | null;
  price_currency: string | null;
  status: string | null;
  primary_image_url: string | null;
  artist_names: string | null;
  similarity: number;
  ai_description: string | null;
  style_tags: string[] | null;
  subject_tags: string[] | null;
}

const statusColors: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  sold: "bg-red-100 text-red-800",
  hold: "bg-yellow-100 text-yellow-800",
  "on consignment": "bg-blue-100 text-blue-800",
};

function formatPrice(price: number | null, currency: string | null) {
  if (price === null || price === undefined) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
  }).format(price);
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden animate-pulse">
      <div className="bg-gray-200 aspect-[4/3]" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-200 rounded w-2/3" />
        <div className="flex gap-2">
          <div className="h-5 bg-gray-200 rounded-full w-16" />
          <div className="h-5 bg-gray-200 rounded-full w-12" />
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, showSimilarity }: { result: SearchResult; showSimilarity?: boolean }) {
  const priceStr = formatPrice(result.price, result.price_currency);
  const matchPercent = Math.round(result.similarity * 100);

  return (
    <Link
      href={`/inventory/${result.artwork_id}`}
      className="group bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:border-gray-300 transition-all"
    >
      {/* Image */}
      <div className="bg-gray-100 aspect-[4/3] flex items-center justify-center overflow-hidden">
        {result.primary_image_url ? (
          <img
            src={result.primary_image_url}
            alt={result.title || "Artwork"}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              />
            </svg>
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 truncate">
          {result.title || (
            <span className="text-gray-400 italic">Untitled</span>
          )}
        </h3>

        {result.artist_names && (
          <p className="text-sm text-gray-600 truncate mt-0.5">
            {result.artist_names}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2 text-sm">
          {priceStr && (
            <span className="font-medium text-gray-900">{priceStr}</span>
          )}
          {priceStr && result.status && (
            <span className="text-gray-300">&middot;</span>
          )}
          {result.status && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                statusColors[result.status.toLowerCase()] ||
                "bg-gray-100 text-gray-800"
              }`}
            >
              {result.status}
            </span>
          )}
        </div>

        {showSimilarity && (
          <div className="mt-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {matchPercent}% match
            </span>
          </div>
        )}

        {result.style_tags && result.style_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {result.style_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function ResultGrid({ results, showSimilarity }: { results: SearchResult[]; showSimilarity?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {results.map((result) => (
        <ResultCard key={result.artwork_id} result={result} showSimilarity={showSimilarity} />
      ))}
    </div>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const similarParam = searchParams.get("similar");

  const [query, setQuery] = useState("");
  const [keywordResults, setKeywordResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [filterMedium, setFilterMedium] = useState("");

  const performSearch = useCallback(
    async (params: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Search failed");
          setKeywordResults([]);
          setSemanticResults([]);
        } else if (data.keywordResults !== undefined) {
          // Hybrid search response
          setKeywordResults(data.keywordResults || []);
          setSemanticResults(data.semanticResults || []);
        } else {
          // Legacy response (image/similar search)
          setKeywordResults([]);
          setSemanticResults(data.results || []);
        }
      } catch (err) {
        setError(String(err));
        setKeywordResults([]);
        setSemanticResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Handle "more like this" on mount
  useEffect(() => {
    if (similarParam) {
      const artworkId = parseInt(similarParam, 10);
      if (!isNaN(artworkId)) {
        performSearch({ artworkId });
      }
    }
  }, [similarParam, performSearch]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    const params: Record<string, unknown> = { query: query.trim() };
    if (filterStatus) params.status = filterStatus;
    if (filterMinPrice) params.minPrice = parseFloat(filterMinPrice);
    if (filterMaxPrice) params.maxPrice = parseFloat(filterMaxPrice);
    if (filterMedium) params.medium = filterMedium;

    performSearch(params);
  }

  function clearSimilar() {
    router.push("/search");
    setKeywordResults([]);
    setSemanticResults([]);
    setSearched(false);
  }

  const totalResults = keywordResults.length + semanticResults.length;
  const hasResults = totalResults > 0;

  return (
    <>
      {/* Similar artwork banner */}
      {similarParam && (
        <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-indigo-800">
            Showing artworks similar to artwork #{similarParam}
          </p>
          <button
            onClick={clearSimilar}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            Clear
          </button>
        </div>
      )}

      {/* Search form */}
      {!similarParam && (
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg
                  className="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by artist, title, style, or description..."
                className="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Searching..." : "Search"}
            </button>
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                filtersOpen
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
            </button>
          </div>

          {/* Filters */}
          {filtersOpen && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">All</option>
                    <option value="available">Available</option>
                    <option value="sold">Sold</option>
                    <option value="hold">Hold</option>
                    <option value="on consignment">On Consignment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Min Price
                  </label>
                  <input
                    type="number"
                    value={filterMinPrice}
                    onChange={(e) => setFilterMinPrice(e.target.value)}
                    placeholder="0"
                    className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Max Price
                  </label>
                  <input
                    type="number"
                    value={filterMaxPrice}
                    onChange={(e) => setFilterMaxPrice(e.target.value)}
                    placeholder="No limit"
                    className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Medium
                  </label>
                  <input
                    type="text"
                    value={filterMedium}
                    onChange={(e) => setFilterMedium(e.target.value)}
                    placeholder="e.g. oil, acrylic, bronze"
                    className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : searched && hasResults ? (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {totalResults} result{totalResults !== 1 ? "s" : ""} found
          </p>

          {/* Exact Matches */}
          {keywordResults.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                Exact Matches
              </h2>
              <ResultGrid results={keywordResults} />
            </div>
          )}

          {/* Similar Artworks (semantic) */}
          {semanticResults.length > 0 && (
            <div>
              {keywordResults.length > 0 && (
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Similar Artworks
                </h2>
              )}
              <ResultGrid results={semanticResults} showSimilarity />
            </div>
          )}
        </>
      ) : searched && !hasResults ? (
        <div className="text-center py-16">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <h3 className="mt-3 text-sm font-medium text-gray-900">
            No matching artworks found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Try adjusting your search or filters. If no artworks have been
            processed yet, run batch processing from the Admin panel.
          </p>
        </div>
      ) : (
        <div className="text-center py-16">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <h3 className="mt-3 text-sm font-medium text-gray-900">
            Discover Artworks
          </h3>
          <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
            Search by artist name, title, or describe what you&apos;re looking
            for. Try &quot;Eleanor Schiltz&quot; for exact matches or
            &quot;moody dark landscape&quot; for visual discovery.
          </p>
        </div>
      )}
    </>
  );
}

function SearchFallback() {
  return (
    <>
      <div className="mb-6">
        <div className="flex gap-2">
          <div className="flex-1 h-12 bg-gray-100 rounded-lg animate-pulse" />
          <div className="w-24 h-12 bg-gray-100 rounded-lg animate-pulse" />
          <div className="w-12 h-12 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </>
  );
}

export default function SearchPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Discover</h1>
        <p className="mt-1 text-sm text-gray-500">Find artworks by artist, title, style, or visual similarity.</p>
      </div>
      <Suspense fallback={<SearchFallback />}>
        <SearchContent />
      </Suspense>
    </div>
  );
}
