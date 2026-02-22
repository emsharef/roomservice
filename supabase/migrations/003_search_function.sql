create or replace function search_artworks(
  query_embedding vector(768),
  embedding_col text default 'clip_embedding',
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
    1 - (
      case
        when embedding_col = 'description_embedding' then
          (ae.description_embedding <=> query_embedding)
        else
          (ae.clip_embedding <=> query_embedding)
      end
    ) as similarity,
    ae.ai_description,
    ae.style_tags,
    ae.subject_tags
  from artworks a
  join artworks_extended ae on ae.artwork_id = a.id
  where
    case
      when embedding_col = 'description_embedding' then ae.description_embedding is not null
      else ae.clip_embedding is not null
    end
    and (filter_status is null or a.status = filter_status)
    and (filter_min_price is null or a.price >= filter_min_price)
    and (filter_max_price is null or a.price <= filter_max_price)
    and (filter_medium is null or a.medium ilike '%' || filter_medium || '%')
    and (filter_artist_id is null or filter_artist_id = any(a.artist_ids))
  order by similarity desc
  limit match_count;
end;
$$;
