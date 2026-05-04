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

async function getVoteTotals(supabase: ReturnType<typeof createClient>, codeId: number): Promise<{ upvotes: number; downvotes: number }> {
  const { data } = await supabase.from("code_votes").select("vote").eq("code_id", codeId);
  const upvotes = (data ?? []).filter((r: { vote: number }) => r.vote === 1).length;
  const downvotes = (data ?? []).filter((r: { vote: number }) => r.vote === -1).length;
  return { upvotes, downvotes };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";

  const ipHash = await hashIp(ip);

  let body: { code_id?: number; vote?: number; code?: string; reward?: string; hostname?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: corsHeaders });
  }

  let codeId = body.code_id;
  const vote = body.vote; // 1 or -1

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!codeId && body.code && body.hostname) {
    // Static code: get-or-create without counting toward rate limit
    const hostname = body.hostname.trim().toLowerCase().replace(/^www\./, "");
    const code = body.code.trim().toUpperCase();
    const reward = (body.reward ?? "?").trim();
    const { data: existing } = await supabase
      .from("discount_codes")
      .select("id")
      .eq("hostname", hostname)
      .eq("code", code)
      .maybeSingle();
    if (existing !== null) {
      codeId = existing.id;
    } else {
      const { data: inserted } = await supabase
        .from("discount_codes")
        .insert({ hostname, code, reward, ip_hash: "__static__" })
        .select("id")
        .single();
      if (inserted) codeId = inserted.id;
    }
  }

  if (!codeId || (vote !== 1 && vote !== -1)) {
    return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: corsHeaders });
  }

  // Check if this IP has already voted on this code
  const { data: existing } = await supabase
    .from("code_votes")
    .select("id, vote, created_at")
    .eq("code_id", codeId)
    .eq("ip_hash", ipHash)
    .maybeSingle();

  if (existing !== null) {
    if (existing.vote === vote) {
      // Toggle off: delete the vote (free action, refunds 1 if within 24h)
      await supabase.from("code_votes").delete().eq("id", existing.id);
      const totals = await getVoteTotals(supabase, codeId);
      // If static code now has zero votes, remove it entirely from DB
      if (totals.upvotes === 0 && totals.downvotes === 0) {
        const { data: dc } = await supabase.from("discount_codes").select("ip_hash").eq("id", codeId).maybeSingle();
        if (dc?.ip_hash === "__static__") {
          await supabase.from("discount_codes").delete().eq("id", codeId);
          return new Response(JSON.stringify({ ok: true, toggled_off: true, deleted: true, upvotes: 0, downvotes: 0 }), { headers: corsHeaders });
        }
      }
      return new Response(JSON.stringify({ ok: true, toggled_off: true, registered_id: codeId, ...totals }), { headers: corsHeaders });
    }
    // Changing vote direction: upsert without counting as new action
    await supabase.from("code_votes").update({ vote }).eq("id", existing.id);
    const totals = await getVoteTotals(supabase, codeId);
    return new Response(JSON.stringify({ ok: true, registered_id: codeId, ...totals }), { headers: corsHeaders });
  }

  // New vote: check rate limit
  const actions = await countActionsToday(supabase, ipHash);
  if (actions >= DAILY_LIMIT) {
    return new Response(JSON.stringify({ error: "rate_limit" }), { status: 429, headers: corsHeaders });
  }

  const { error } = await supabase.from("code_votes").insert({ code_id: codeId, ip_hash: ipHash, vote });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const totals = await getVoteTotals(supabase, codeId);
  return new Response(JSON.stringify({ ok: true, registered_id: codeId, ...totals }), { headers: corsHeaders });
});

