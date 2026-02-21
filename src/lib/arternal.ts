const API_BASE = process.env.ARTERNAL_API_BASE_URL || "https://api.arternal.com/api/v1";
const API_KEY = process.env.ARTERNAL_API_KEY || "";

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

export async function fetchInventory(params: Record<string, string> = {}): Promise<InventoryResponse> {
  const url = new URL(`${API_BASE}/inventory`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Arternal API error: ${res.status}`);
  }

  return res.json();
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
  birth_year: number | null;
  death_year: number | null;
  bio: string | null;
  country: string | null;
  life_dates: string | null;
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

export async function fetchArtists(params: Record<string, string> = {}): Promise<ArtistListResponse> {
  const url = new URL(`${API_BASE}/artists`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Arternal API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchArtist(id: string): Promise<ArtistDetailResponse> {
  const res = await fetch(`${API_BASE}/artists/${id}`, {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Arternal API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchArtistWorks(id: string, params: Record<string, string> = {}): Promise<ArtistWorksResponse> {
  const url = new URL(`${API_BASE}/artists/${id}/works`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Arternal API error: ${res.status}`);
  }

  return res.json();
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

export interface ContactListResponse {
  success: boolean;
  data: ContactItem[];
  pagination: Pagination;
}

export async function fetchContacts(params: Record<string, string> = {}): Promise<ContactListResponse> {
  const url = new URL(`${API_BASE}/contacts`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Arternal API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchInventoryItem(id: string): Promise<SingleInventoryResponse> {
  const res = await fetch(`${API_BASE}/inventory/${id}`, {
    headers: { "X-API-Key": API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Arternal API error: ${res.status}`);
  }

  return res.json();
}
