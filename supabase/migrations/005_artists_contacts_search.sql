-- ============================================
-- Artists search/filter/sort RPC
-- ============================================

create or replace function search_artists(
  filter_name text default null,
  filter_country text default null,
  filter_life_dates text default null,
  sort_column text default 'display_name',
  sort_direction text default 'asc',
  page_size int default 20,
  page_offset int default 0
)
returns table (
  id bigint,
  display_name text,
  first_name text,
  last_name text,
  country text,
  work_count int,
  bio text,
  life_dates text,
  total_count bigint
)
language plpgsql
as $$
begin
  return query
  select
    a.id,
    a.display_name,
    a.first_name,
    a.last_name,
    a.country,
    a.work_count,
    a.bio,
    a.life_dates,
    count(*) over() as total_count
  from artists a
  where
    (filter_name is null or (
      a.display_name ilike '%' || filter_name || '%'
      or a.first_name ilike '%' || filter_name || '%'
      or a.last_name ilike '%' || filter_name || '%'
    ))
    and (filter_country is null or a.country ilike '%' || filter_country || '%')
    and (filter_life_dates is null or a.life_dates ilike '%' || filter_life_dates || '%')
  order by
    case when sort_column = 'name' and sort_direction = 'asc' then a.display_name end asc nulls last,
    case when sort_column = 'name' and sort_direction = 'desc' then a.display_name end desc nulls last,
    case when sort_column = 'country' and sort_direction = 'asc' then a.country end asc nulls last,
    case when sort_column = 'country' and sort_direction = 'desc' then a.country end desc nulls last,
    case when sort_column = 'works' and sort_direction = 'asc' then a.work_count end asc nulls last,
    case when sort_column = 'works' and sort_direction = 'desc' then a.work_count end desc nulls last,
    case when sort_column = 'life_dates' and sort_direction = 'asc' then a.life_dates end asc nulls last,
    case when sort_column = 'life_dates' and sort_direction = 'desc' then a.life_dates end desc nulls last,
    case when sort_column = 'display_name' and sort_direction = 'asc' then a.display_name end asc nulls last,
    case when sort_column = 'display_name' and sort_direction = 'desc' then a.display_name end desc nulls last
  limit page_size
  offset page_offset;
end;
$$;

-- ============================================
-- Contacts search/filter/sort RPC
-- ============================================

create or replace function search_contacts(
  filter_name text default null,
  filter_email text default null,
  filter_company text default null,
  filter_location text default null,
  filter_type text default null,
  sort_column text default 'display_name',
  sort_direction text default 'asc',
  page_size int default 20,
  page_offset int default 0
)
returns table (
  id bigint,
  display_name text,
  first_name text,
  last_name text,
  email text,
  company text,
  phone text,
  phone_mobile text,
  type text,
  primary_city text,
  primary_state text,
  primary_country text,
  total_count bigint
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.display_name,
    c.first_name,
    c.last_name,
    c.email,
    c.company,
    c.phone,
    c.phone_mobile,
    c.type,
    c.primary_city,
    c.primary_state,
    c.primary_country,
    count(*) over() as total_count
  from contacts c
  where
    (filter_name is null or (
      c.display_name ilike '%' || filter_name || '%'
      or c.first_name ilike '%' || filter_name || '%'
      or c.last_name ilike '%' || filter_name || '%'
    ))
    and (filter_email is null or c.email ilike '%' || filter_email || '%')
    and (filter_company is null or c.company ilike '%' || filter_company || '%')
    and (filter_location is null or (
      c.primary_city ilike '%' || filter_location || '%'
      or c.primary_state ilike '%' || filter_location || '%'
      or c.primary_country ilike '%' || filter_location || '%'
    ))
    and (filter_type is null or c.type ilike '%' || filter_type || '%')
  order by
    case when sort_column = 'name' and sort_direction = 'asc' then c.display_name end asc nulls last,
    case when sort_column = 'name' and sort_direction = 'desc' then c.display_name end desc nulls last,
    case when sort_column = 'email' and sort_direction = 'asc' then c.email end asc nulls last,
    case when sort_column = 'email' and sort_direction = 'desc' then c.email end desc nulls last,
    case when sort_column = 'company' and sort_direction = 'asc' then c.company end asc nulls last,
    case when sort_column = 'company' and sort_direction = 'desc' then c.company end desc nulls last,
    case when sort_column = 'location' and sort_direction = 'asc' then c.primary_city end asc nulls last,
    case when sort_column = 'location' and sort_direction = 'desc' then c.primary_city end desc nulls last,
    case when sort_column = 'type' and sort_direction = 'asc' then c.type end asc nulls last,
    case when sort_column = 'type' and sort_direction = 'desc' then c.type end desc nulls last,
    case when sort_column = 'display_name' and sort_direction = 'asc' then c.display_name end asc nulls last,
    case when sort_column = 'display_name' and sort_direction = 'desc' then c.display_name end desc nulls last
  limit page_size
  offset page_offset;
end;
$$;
