-- Discount codes submitted by users
create table if not exists public.discount_codes (
  id          bigint generated always as identity primary key,
  hostname    text not null,
  code        text not null,
  reward      text not null default '?',
  ip_hash     text not null,
  created_at  timestamptz not null default now(),
  unique (hostname, code)
);

-- One submission per IP per hostname
create unique index if not exists discount_codes_ip_host
  on public.discount_codes (hostname, ip_hash);

-- Votes on codes
create table if not exists public.code_votes (
  id          bigint generated always as identity primary key,
  code_id     bigint not null references public.discount_codes (id) on delete cascade,
  ip_hash     text not null,
  vote        smallint not null check (vote in (-1, 1)),
  created_at  timestamptz not null default now(),
  unique (code_id, ip_hash)
);

-- Public read access (anon can fetch codes and vote counts)
alter table public.discount_codes enable row level security;
alter table public.code_votes enable row level security;

create policy "public read codes"
  on public.discount_codes for select using (true);

create policy "public read votes"
  on public.code_votes for select using (true);

-- No direct insert/update from client — all writes go through Edge Functions
