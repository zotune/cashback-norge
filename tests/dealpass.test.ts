import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { fetchDealpass } from "../src/backend/providers/dealpass.js";
import { collectProviderOffers } from "../src/backend/provider-offers.js";
import { isCashbackOffer, type CashbackOffer } from "../src/shared/cashback.js";

const generatedAt = "2026-11-12T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };

type Deal = Record<string, unknown>;

function deal(id: number, name: string, options: {
  premium?: string; url?: string | null; code?: string | null; description?: string; disclaimer?: string | null;
  supplier?: string; website?: string | null; type?: string; expires?: string | null;
} = {}): Deal {
  return {
    id, name,
    supplier: { name: options.supplier ?? name, website: options.website ?? null },
    discount: { basic: 0, premium: options.premium ?? "10", platinum: 0 },
    claim: { type: options.type ?? "voucher", voucher: { url: options.url === undefined ? `https://shop${id}.no/` : options.url, code: options.code ?? null } },
    categories: [], description: options.description ?? "", disclaimer: options.disclaimer === undefined ? null : options.disclaimer,
    expires: options.expires ?? null,
  };
}

// Representative rows from tfbank.dealpass.no/ajax/deals (November 2026).
const catalogue: Deal[] = [
  deal(12533, "Booking.com – inntil 4% cashback", {
    premium: "4", url: "https://www.booking.com/gating/authkey?aid=1", supplier: "Booking.com (norway) As",
    description: "Som kortinnehaver kan du motta opptil 4% lommebokkreditt på hver reservasjon.",
    disclaimer: "Bestillinger må gjøres innen 31. desember 2026.",
  }),
  deal(12532, "Lytt og les gratis i 8 uker med Nextory og TF Bank Mastercard", {
    premium: "100", url: "http://nextory.no/tfbank-no", supplier: "Nextory",
    description: "Som TF Bank Mastercard-kunde får du nå muligheten til å teste Nextory helt gratis i 8 uker.",
    disclaimer: "Gjelder ikke dersom du har hatt ett aktivt abonnement de siste 6 månedene.",
  }),
  deal(12503, "Hurtigruten Expeditions 10% + 100€ kreditt om bord", {
    url: "https://www.hurtigruten.com/nb-no/expeditions/", code: "MCPREMIUM", supplier: "Hurtigruten Expeditions",
    disclaimer: "Oppgi koden MCPREMIUM. Tilbudet er gyldig til 31.12.2026.",
  }),
  deal(12460, "Hertz – 10% rabatt på alle Hertz bookinger", {
    url: "https://www.hertz.com/rentacar/", supplier: "Hertz",
    description: "Ny leiebil hver dag.\nFå 10% rabatt på leie av bil. Fordelen gjelder kun for nye reservasjoner.",
  }),
  deal(12457, "Crønch Comedy Club", { premium: "25", url: "https://billetto.no/users/cronch-comedy-club", code: "DP25" }),
  deal(12086, "Sundvolden Hotel", {
    premium: "15", url: "https://be.synxis.com/?chain=9083", code: "2653958 ", website: "https://sundvolden.no",
    description: "Tilbudet fra 10 til 40% rabatt. Dobbeltrom per person kr. 890,- (Kr. 200,- rabatt)",
  }),
  deal(11949, "Feriehus på Kreta", {
    url: "http://www.alargo.no", code: "DEALKRETA\r\n", description: "Nå kan du få opp til 20 % rabatt med DEALPASS!",
    disclaimer: "Rabatten gjelder på alle ordinære priser",
  }),
  deal(12461, "AVIS - Få inntil 20% rabatt på alle bookinger", { premium: "20", url: "https://www.avis.no/", expires: "2026-11-01 00:00:00" }),
  deal(11000, "Butikk uten nettside", { type: "dropin", url: null }),
  deal(11001, "Uten rabatt", { premium: "0" }),
];

async function withDealpass(
  run: (apiUrl: string, requests: string[]) => Promise<void>,
  options: { pages?: Deal[][]; status?: number; transient?: number; disconnect?: boolean; body?: string } = {},
) {
  const pages = options.pages ?? [catalogue];
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    const attempt = requests.length;
    if (options.disconnect && attempt === 1) { request.socket.destroy(); return; }
    if (options.transient !== undefined && attempt <= options.transient) {
      response.writeHead(503, { "Content-Type": "text/plain" }).end("unavailable");
      return;
    }
    if (options.status !== undefined) {
      response.writeHead(options.status, { "Content-Type": "text/plain" }).end("error");
      return;
    }
    const offset = Number(new URL(request.url!, "http://localhost").searchParams.get("offset") ?? 0);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(options.body ?? JSON.stringify({ deals: pages[offset / 50] ?? [], summary: { total_deals_available: 0 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}/ajax/deals`, requests);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function fetchFrom(apiUrl: string, maxPages?: number) {
  return fetchDealpass({
    apiUrl, generatedAt, logger, label: "TF Bank", provider: "tfbank",
    siteBaseUrl: "https://tfbank.dealpass.no", overrides: {}, ...(maxPages === undefined ? {} : { maxPages }),
  });
}

test("Dealpass keeps up-to rates, free trials, clean shop names and own shop domains", async () => {
  await withDealpass(async (apiUrl) => {
    const offers = await fetchFrom(apiUrl);
    assert.ok(offers.every(isCashbackOffer));
    const byName = new Map(offers.map((offer) => [offer.merchantName, offer]));

    // "inntil 4% cashback" is a maximum, not a guaranteed rate.
    assert.equal(byName.get("Booking.com")?.reward, "opptil 4 %");
    // A 100 % deal is a free trial: the shared free-promotion format, never "100 %".
    const nextory = byName.get("Nextory");
    assert.equal(nextory?.reward, "0 kr totalsum");
    assert.deepEqual(nextory?.promotion, { label: "8 uker gratis", priceNok: 0 });
    assert.match(nextory?.terms ?? "", /aktivt abonnement de siste 6 månedene/);
    // Headline names keep the benefit in the terms, not in the shop name.
    const hurtigruten = byName.get("Hurtigruten Expeditions");
    assert.equal(hurtigruten?.reward, "10 %");
    assert.match(hurtigruten?.terms ?? "", /100€ kreditt om bord/);
    assert.equal(hurtigruten?.discountCode, "MCPREMIUM");
    // Without a disclaimer only the description's benefit sentences are kept.
    assert.equal(byName.get("Hertz")?.terms, "Hertz – 10% rabatt på alle Hertz bookinger\nFå 10% rabatt på leie av bil. Fordelen gjelder kun for nye reservasjoner.");
    // A ticket shop is not the club's domain; a booking engine gives way to the hotel's own site.
    assert.equal(byName.has("Crønch Comedy Club"), false);
    const sundvolden = byName.get("Sundvolden Hotel");
    assert.deepEqual(sundvolden?.domains, ["sundvolden.no"]);
    assert.equal(sundvolden?.discountCode, "2653958");
    assert.match(sundvolden?.terms ?? "", /kr\. 890,- \(Kr\. 200,- rabatt\)/);
    // The structured rate wins over a different "opp til 20 %" in the marketing text.
    assert.equal(byName.get("Feriehus på Kreta")?.reward, "10 %");
    assert.equal(byName.get("Feriehus på Kreta")?.discountCode, "DEALKRETA");
    // Expired, in-store and zero-rate deals are not offers.
    for (const name of ["AVIS", "Butikk uten nettside", "Uten rabatt"]) assert.equal(byName.has(name), false, name);
    assert.equal(offers.length, 6);
  });
});

test("Dealpass paginates over HTTP/1.1 until a short page and stops at the page limit", async () => {
  const fullPage = Array.from({ length: 50 }, (_, index) => deal(20000 + index, `Butikk ${index}`));
  await withDealpass(async (apiUrl, requests) => {
    const offers = await fetchFrom(apiUrl);
    assert.equal(offers.length, 53);
    assert.deepEqual(requests.map((url) => new URL(url, "http://x").searchParams.get("offset")), ["0", "50"]);
  }, { pages: [fullPage, [deal(30001, "A"), deal(30002, "B"), deal(30003, "C")]] });

  await withDealpass(async (apiUrl, requests) => {
    await assert.rejects(fetchFrom(apiUrl, 2), /TF Bank API: more than 2 pages of 50 deals/);
    assert.equal(requests.length, 2);
  }, { pages: [fullPage, fullPage, fullPage] });
});

test("Dealpass retries transient failures and names source, request and cause when it gives up", async () => {
  await withDealpass(async (apiUrl, requests) => {
    assert.equal((await fetchFrom(apiUrl)).length, 6);
    assert.equal(requests.length, 3);
  }, { transient: 2 });

  await withDealpass(async (apiUrl, requests) => {
    assert.equal((await fetchFrom(apiUrl)).length, 6);
    assert.equal(requests.length, 2);
  }, { disconnect: true });

  await withDealpass(async (apiUrl, requests) => {
    await assert.rejects(fetchFrom(apiUrl), (error: Error) =>
      /^TF Bank API: http:\/\/127\.0\.0\.1:\d+\/ajax\/deals\?offset=0&limit=50 failed after 3 attempt\(s\): .*503/.test(error.message));
    assert.equal(requests.length, 3);
  }, { transient: 10 });

  await withDealpass(async (apiUrl, requests) => {
    await assert.rejects(fetchFrom(apiUrl), /failed after 1 attempt\(s\): HTTP 404/);
    assert.equal(requests.length, 1);
  }, { status: 404 });

  await withDealpass(async (apiUrl) => {
    await assert.rejects(fetchFrom(apiUrl), /unexpected data format/);
  }, { body: JSON.stringify({ items: [] }) });
});

test("a failed Dealpass source reuses its previous offers with their original updatedAt", async () => {
  const previous: CashbackOffer = {
    provider: "santander", merchantName: "Booking.com", domains: ["booking.com"], reward: "opptil 4 %",
    sourceUrl: "https://santander.dealpass.no/deal/12533", activationUrl: "https://santander.dealpass.no/deal/12533",
    terms: "", updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  };
  await withDealpass(async (apiUrl) => {
    const offers = await collectProviderOffers({
      label: "Santander", logger, provider: "santander", reusePreviousOnFailure: true, maxPreviousOfferAgeDays: 14,
      previousOffersByProvider: new Map([["santander", [previous]]]),
      run: () => fetchDealpass({ apiUrl, generatedAt, logger, label: "Santander", provider: "santander", siteBaseUrl: "https://santander.dealpass.no", overrides: {} }),
    });
    assert.deepEqual(offers, [previous]);
  }, { status: 500 });
});
