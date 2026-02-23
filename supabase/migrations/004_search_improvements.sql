-- ============================================
-- Inventory search/filter/sort RPC
-- ============================================

create or replace function search_inventory(
  filter_title text default null,
  filter_artist text default null,
  filter_catalog text default null,
  filter_medium text default null,
  filter_year text default null,
  filter_status text default null,
  sort_column text default 'arternal_updated_at',
  sort_direction text default 'desc',
  page_size int default 20,
  page_offset int default 0
)
returns table (
  id bigint,
  title text,
  catalog_number text,
  year text,
  medium text,
  price numeric,
  price_currency text,
  status text,
  primary_image_url text,
  artist_names text,
  total_count bigint
)
language plpgsql
as $$
begin
  return query
  select
    a.id,
    a.title,
    a.catalog_number,
    a.year,
    a.medium,
    a.price,
    a.price_currency,
    a.status,
    a.primary_image_url,
    (select string_agg(aa.display_name, ', ') from artwork_artists aa where aa.artwork_id = a.id) as artist_names,
    count(*) over() as total_count
  from artworks a
  where
    (filter_title is null or a.title ilike '%' || filter_title || '%')
    and (filter_catalog is null or a.catalog_number ilike '%' || filter_catalog || '%')
    and (filter_medium is null or a.medium ilike '%' || filter_medium || '%')
    and (filter_year is null or a.year ilike '%' || filter_year || '%')
    and (filter_status is null or a.status = filter_status)
    and (filter_artist is null or exists (
      select 1 from artwork_artists aa
      where aa.artwork_id = a.id
        and aa.display_name ilike '%' || filter_artist || '%'
    ))
  order by
    case when sort_column = 'title' and sort_direction = 'asc' then a.title end asc nulls last,
    case when sort_column = 'title' and sort_direction = 'desc' then a.title end desc nulls last,
    case when sort_column = 'artist' and sort_direction = 'asc' then (select string_agg(aa.display_name, ', ') from artwork_artists aa where aa.artwork_id = a.id) end asc nulls last,
    case when sort_column = 'artist' and sort_direction = 'desc' then (select string_agg(aa.display_name, ', ') from artwork_artists aa where aa.artwork_id = a.id) end desc nulls last,
    case when sort_column = 'medium' and sort_direction = 'asc' then a.medium end asc nulls last,
    case when sort_column = 'medium' and sort_direction = 'desc' then a.medium end desc nulls last,
    case when sort_column = 'year' and sort_direction = 'asc' then a.year end asc nulls last,
    case when sort_column = 'year' and sort_direction = 'desc' then a.year end desc nulls last,
    case when sort_column = 'price' and sort_direction = 'asc' then a.price end asc nulls last,
    case when sort_column = 'price' and sort_direction = 'desc' then a.price end desc nulls last,
    case when sort_column = 'status' and sort_direction = 'asc' then a.status end asc nulls last,
    case when sort_column = 'status' and sort_direction = 'desc' then a.status end desc nulls last,
    case when sort_column = 'arternal_updated_at' and sort_direction = 'asc' then a.arternal_updated_at end asc nulls last,
    case when sort_column = 'arternal_updated_at' and sort_direction = 'desc' then a.arternal_updated_at end desc nulls last
  limit page_size
  offset page_offset;
end;
$$;

-- ============================================
-- Keyword search for hybrid discover page
-- ============================================

create or replace function keyword_search_artworks(
  search_term text,
  match_count int default 20,
  filter_status text default null,
  filter_min_price numeric default null,
  filter_max_price numeric default null,
  filter_medium text default null,
  filter_artist_id bigint default null
)
returns table (
  artwork_id bigint,
  title text,
  year text,
  medium text,
  dimensions text,
  price numeric,
  price_currency text,
  status text,
  primary_image_url text,
  artist_names text,
  similarity float,
  ai_description text,
  style_tags text[],
  subject_tags text[]
)
language plpgsql
as $$
begin
  return query
  select
    a.id as artwork_id,
    a.title,
    a.year,
    a.medium,
    a.dimensions,
    a.price,
    a.price_currency,
    a.status,
    a.primary_image_url,
    (select string_agg(aa.display_name, ', ') from artwork_artists aa where aa.artwork_id = a.id) as artist_names,
    1.0::float as similarity,
    ae.ai_description,
    ae.style_tags,
    ae.subject_tags
  from artworks a
  left join artworks_extended ae on ae.artwork_id = a.id
  where
    (
      a.title ilike '%' || search_term || '%'
      or a.catalog_number ilike '%' || search_term || '%'
      or exists (
        select 1 from artwork_artists aa
        where aa.artwork_id = a.id
          and aa.display_name ilike '%' || search_term || '%'
      )
    )
    and (filter_status is null or a.status = filter_status)
    and (filter_min_price is null or a.price >= filter_min_price)
    and (filter_max_price is null or a.price <= filter_max_price)
    and (filter_medium is null or a.medium ilike '%' || filter_medium || '%')
    and (filter_artist_id is null or filter_artist_id = any(a.artist_ids))
  order by
    -- Prioritize exact title matches, then artist matches, then catalog matches
    case
      when a.title ilike search_term then 0
      when a.title ilike search_term || '%' then 1
      when a.title ilike '%' || search_term || '%' then 2
      else 3
    end,
    a.title
  limit match_count;
end;
$$;
