-- Remove the "1 submission per IP per hostname" unique index.
-- Rate limiting is now enforced in Edge Functions: max 5 actions (submissions + votes) per IP per day.
drop index if exists public.discount_codes_ip_host;
