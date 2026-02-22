const API_BASE =
  process.env.ARTERNAL_API_BASE_URL || "https://api.arternal.com/api/v1";
const API_KEY = process.env.ARTERNAL_API_KEY || "";

// ---------------------------------------------------------------------------
// Generic fetcher
// ---------------------------------------------------------------------------

async function arternaFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arternal API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Artist {
  id: number;
  first_name: string;
  last_name: string;
  alias: string | null;
  display_name: string;
}

export interface InventoryImage {
  id: number;
  url: string;
  title: string;
  type: string;
  is_primary: boolean;
}

export interface InventoryItem {
  id: number;
  catalog_number: string | null;
  title: string;
  year: string | null;
  medium: string | null;
  dimensions: string | null;
  edition: string | null;
  price: number | null;
  price_currency: string | null;
  work_status: string | null;
  status: string | null;
  type: string | null;
  height: number | null;
  width: number | null;
  depth: number | null;
  primary_image_url: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
  artists: Artist[];
  image_base_url?: string;
  images?: InventoryImage[];
}

export interface Pagination {
  total: string;
  count: number;
  per_page: number;
  current_page: number;
  total_pages: number;
  has_more: boolean;
}

export interface InventoryResponse {
  success: boolean;
  data: InventoryItem[];
  pagination: Pagination;
}

export interface SingleInventoryResponse {
  success: boolean;
  data: InventoryItem;
}

export interface ArtistListItem {
  id: number;
  first_name: string;
  last_name: string;
  alias: string | null;
  display_name: string;
  birth_year: number | null;
  death_year: number | null;
  bio: string | null;
  country: string | null;
  work_count: number | null;
  catalog_count: number | null;
  life_dates: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArtistDetail {
  id: number;
  first_name: string;
  last_name: string;
  alias: string | null;
  display_name: string;
  birth_year: string | null;
  death_year: string | null;
  bio: string | null;
  country: string | null;
  life_dates: string | null;
  saved: boolean;
  statistics: {
    inventory: Record<string, number>;
    sets: Record<string, number>;
  };
  created_at: string;
  updated_at: string;
}

export interface ArtistWork {
  id: number;
  catalog_number: string | null;
  title: string;
  year: string | null;
  medium: string | null;
  dimensions: string | null;
  edition: string | null;
  price: number | null;
  price_currency: string | null;
  status: string | null;
  type: string | null;
  primary_image_url: string | null;
  created_at: string;
}

export interface ArtistListResponse {
  success: boolean;
  data: ArtistListItem[];
  pagination: Pagination;
}

export interface ArtistDetailResponse {
  success: boolean;
  data: ArtistDetail;
}

export interface ArtistWorksResponse {
  success: boolean;
  data: ArtistWork[];
  pagination: Pagination;
}

export interface ContactItem {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  website: string | null;
  company: string | null;
  primary_city: string | null;
  primary_state: string | null;
  primary_country: string | null;
  phone: string | null;
  phone_mobile: string | null;
  type: string | null;
  display_name: string;
  primary_address?: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    formatted: string | null;
  };
}

export interface ContactTransaction {
  id: number;
  title: string;
  status: string;
  total_price: string;
  created_at: string;
}

export interface ContactActivity {
  type: string;
  text: string | null;
  created_at: string;
}

export interface ContactDetail {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  phone_mobile: string | null;
  type: string | null;
  website: string | null;
  company: string | null;
  primary_street: string | null;
  primary_city: string | null;
  primary_state: string | null;
  primary_zip: string | null;
  primary_country: string | null;
  display_name: string;
  primary_address?: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    formatted: string | null;
  };
  tags: string[];
  notes: string[];
  recent_transactions: ContactTransaction[];
  recent_activities: ContactActivity[];
}

export interface ContactDetailResponse {
  success: boolean;
  data: ContactDetail;
}

export interface ContactListResponse {
  success: boolean;
  data: ContactItem[];
  pagination: Pagination;
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

export function fetchInventory(params?: Record<string, string>) {
  return arternaFetch<InventoryResponse>("/inventory", params);
}

export function fetchInventoryItem(id: string) {
  return arternaFetch<SingleInventoryResponse>(`/inventory/${id}`);
}

export function fetchArtists(params?: Record<string, string>) {
  return arternaFetch<ArtistListResponse>("/artists", params);
}

export function fetchArtist(id: string) {
  return arternaFetch<ArtistDetailResponse>(`/artists/${id}`);
}

export function fetchArtistWorks(id: string, params?: Record<string, string>) {
  return arternaFetch<ArtistWorksResponse>(`/artists/${id}/works`, params);
}

export function fetchContacts(params?: Record<string, string>) {
  return arternaFetch<ContactListResponse>("/contacts", params);
}

export function fetchContact(id: string) {
  return arternaFetch<ContactDetailResponse>(`/contacts/${id}`);
}

// ---------------------------------------------------------------------------
// Write functions
// ---------------------------------------------------------------------------

export async function updateArtist(
  id: number,
  data: Partial<ArtistListItem>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/artists/${id}`, {
    method: "PUT",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arternal API error ${res.status}: ${text}`);
  }
}

export async function updateContact(
  id: number,
  data: Partial<ContactItem>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/contacts/${id}`, {
    method: "PUT",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arternal API error ${res.status}: ${text}`);
  }
}

export async function createContact(
  data: Partial<ContactItem>,
): Promise<ContactDetailResponse> {
  const res = await fetch(`${API_BASE}/contacts`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Arternal API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

export async function fetchAllPages<T>(
  fetcher: (
    params: Record<string, string>,
  ) => Promise<{ data: T[]; pagination: Pagination }>,
  baseParams: Record<string, string> = {},
  pageSize: number = 100,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await fetcher({
      ...baseParams,
      limit: String(pageSize),
      offset: String(offset),
    });
    all.push(...result.data);
    hasMore = result.pagination.has_more;
    offset += pageSize;
  }

  return all;
}
