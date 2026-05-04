import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
};

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + (Deno.env.get("IP_SALT") ?? ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";

  const ipHash = await hashIp(ip);

  let body: { hostname?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: corsHeaders });
  }

  const hostname = (body.hostname ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!hostname) {
    return new Response(JSON.stringify({ error: "missing hostname" }), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Get all code IDs for this hostname, then find this IP's votes among them
  const { data: codes } = await supabase
    .from("discount_codes")
    .select("id")
    .eq("hostname", hostname);

  if (!codes || codes.length === 0) {
    return new Response(JSON.stringify({ votes: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const codeIds = codes.map((c: { id: number }) => c.id);

  const { data: votes } = await supabase
    .from("code_votes")
    .select("code_id, vote")
    .eq("ip_hash", ipHash)
    .in("code_id", codeIds);

  const result = (votes ?? []).map((v: { code_id: number; vote: number }) => ({ code_id: v.code_id, vote: v.vote }));
  return new Response(JSON.stringify({ votes: result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
