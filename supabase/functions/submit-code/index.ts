import { createClient } from "jsr:@supabase/supabase-js@2";

const DAILY_LIMIT = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
};

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + (Deno.env.get("IP_SALT") ?? ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function countActionsToday(supabase: ReturnType<typeof createClient>, ipHash: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    supabase.from("discount_codes").select("*", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since),
    supabase.from("code_votes").select("*", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since),
  ]);
  return (c1 ?? 0) + (c2 ?? 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";

  const ipHash = await hashIp(ip);

  let body: { hostname?: string; code?: string; reward?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: corsHeaders });
  }

  const hostname = (body.hostname ?? "").trim().toLowerCase().replace(/^www\./, "");
  const code = (body.code ?? "").trim().toUpperCase();
  const reward = (body.reward ?? "?").trim();

  if (!hostname || !code) {
    return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: corsHeaders });
  }

  if (code.length > 40 || reward.length > 20) {
    return new Response(JSON.stringify({ error: "too long" }), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const actions = await countActionsToday(supabase, ipHash);
  if (actions >= DAILY_LIMIT) {
    return new Response(JSON.stringify({ error: "rate_limit" }), { status: 429, headers: corsHeaders });
  }

  const { data, error } = await supabase.from("discount_codes").insert({
    hostname,
    code,
    reward,
    ip_hash: ipHash,
  }).select("id").single();

  if (error) {
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "duplicate_code" }), { status: 409, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true, id: data.id }), { headers: corsHeaders });
});

