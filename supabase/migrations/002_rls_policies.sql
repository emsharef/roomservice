-- Enable RLS on all tables
alter table artworks enable row level security;
alter table artists enable row level security;
alter table contacts enable row level security;
alter table artwork_artists enable row level security;
alter table artworks_extended enable row level security;
alter table artists_extended enable row level security;
alter table contacts_extended enable row level security;
alter table sync_log enable row level security;
alter table user_profiles enable row level security;

-- Helper function: get current user's role
create or replace function public.get_user_role()
returns text
language sql
stable
security definer
as $$
  select role from public.user_profiles where id = auth.uid()
$$;

-- READ POLICIES (all authenticated users can read data)
create policy "Authenticated users can read artworks"
  on artworks for select to authenticated using (true);
create policy "Authenticated users can read artists"
  on artists for select to authenticated using (true);
create policy "Authenticated users can read contacts"
  on contacts for select to authenticated using (true);
create policy "Authenticated users can read artwork_artists"
  on artwork_artists for select to authenticated using (true);
create policy "Authenticated users can read artworks_extended"
  on artworks_extended for select to authenticated using (true);
create policy "Authenticated users can read artists_extended"
  on artists_extended for select to authenticated using (true);
create policy "Authenticated users can read contacts_extended"
  on contacts_extended for select to authenticated using (true);

-- Staff and admin can read sync logs
create policy "Staff+ can read sync_log"
  on sync_log for select to authenticated
  using (public.get_user_role() in ('admin', 'staff'));

-- WRITE POLICIES
-- Mirror tables: service role writes only (sync uses admin client, bypasses RLS)
-- Extended tables: staff and admin can write
create policy "Staff+ can write artworks_extended"
  on artworks_extended for all to authenticated
  using (public.get_user_role() in ('admin', 'staff'))
  with check (public.get_user_role() in ('admin', 'staff'));
create policy "Staff+ can write artists_extended"
  on artists_extended for all to authenticated
  using (public.get_user_role() in ('admin', 'staff'))
  with check (public.get_user_role() in ('admin', 'staff'));
create policy "Staff+ can write contacts_extended"
  on contacts_extended for all to authenticated
  using (public.get_user_role() in ('admin', 'staff'))
  with check (public.get_user_role() in ('admin', 'staff'));
create policy "Staff+ can write sync_log"
  on sync_log for all to authenticated
  using (public.get_user_role() in ('admin', 'staff'))
  with check (public.get_user_role() in ('admin', 'staff'));

-- User profiles: users can read their own, admin can read/write all
create policy "Users can read own profile"
  on user_profiles for select to authenticated
  using (id = auth.uid());
create policy "Admin can read all profiles"
  on user_profiles for select to authenticated
  using (public.get_user_role() = 'admin');
create policy "Admin can manage all profiles"
  on user_profiles for all to authenticated
  using (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_profiles (id, email, display_name, role)
  values (new.id, new.email, split_part(new.email, '@', 1), 'viewer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
