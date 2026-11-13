import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import {
  crawlRabattkode,
  extractCouponMinimumPurchase,
  extractCouponReward,
} from "../src/backend/providers/rabattkode.js";

const generatedAt = "2026-11-13T12:00:00.000Z";
const logger = { info() {}, warn() {}, error() {} };
const COMPANY = "projects/p/databases/(default)/documents/companies/";

function discount(fields: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "boolean") out[key] = { booleanValue: value };
    else if (key === "discount_amount") out[key] = { integerValue: String(value) };
    else if (key === "expiration_ts") out[key] = { timestampValue: value };
    else if (key === "company_id") out[key] = { referenceValue: COMPANY + String(value) };
    else out[key] = { stringValue: value };
  }
  return { fields: out };
}

async function withFirestore(
  pages: Record<string, unknown[]>,
  run: (baseUrl: string, requests: string[]) => Promise<void>,
  status = 200,
): Promise<void> {
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    requests.push(request.url ?? "");
    const url = new URL(request.url ?? "/", "http://localhost");
    const collection = url.pathname.split("/").pop() ?? "";
    const token = url.searchParams.get("pageToken") ?? "";
    const body = pages[`${collection}${token ? `:${token}` : ""}`];
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body ?? { documents: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}/documents`, requests);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("coupon headlines give the code's own reward, not the min. purchase or a sort value", () => {
  assert.equal(extractCouponReward("Få 300kr i avslag på bestillingen"), "300 kr");
  assert.equal(extractCouponReward("Få 100kr avslag ved kjøp over 400kr"), "100 kr");
  assert.equal(extractCouponReward("Få opptil 40% studentrabatt"), "opptil 40 %");
  assert.equal(extractCouponReward("Få opptil 1001kr på de 3 første kasser"), "opptil 1 001 kr");
  assert.equal(extractCouponReward("Bruk vår rabattkode for 40Kr rabatt på din AliExpress-bestilling"), "40 kr");
  assert.equal(extractCouponReward("Få gratis frakt på kjøpet"), "Gratis frakt");
  // A unit price or a free gift is not a discount amount.
  assert.equal(extractCouponReward("Få 20 måltider fra kun 54kr per porsjon"), "");
  assert.equal(extractCouponReward("Få en gratis tannblekingsstrips på kjøp over 300kr"), "");
});

test("minimum purchase keeps over/minst and ignores item counts, other currencies and maximums", () => {
  assert.deepEqual(extractCouponMinimumPurchase("Få 10% på kjøp over 999kr"), { minimumPurchaseNok: 999, minimumPurchaseExclusive: true });
  assert.deepEqual(extractCouponMinimumPurchase("Få 20%\nved kjøp over 1 500 kr"), { minimumPurchaseNok: 1500, minimumPurchaseExclusive: true });
  assert.deepEqual(extractCouponMinimumPurchase("Få 10%\nover min. 799kr"), { minimumPurchaseNok: 799 });
  assert.deepEqual(extractCouponMinimumPurchase("Gjelder kjøp på minst 600 kr"), { minimumPurchaseNok: 600 });
  assert.deepEqual(extractCouponMinimumPurchase("- minimumsbestillingsverdi på NOK130"), { minimumPurchaseNok: 130 });
  assert.equal(extractCouponMinimumPurchase("Få 10%\nVed minst 2 varer"), undefined);
  assert.equal(extractCouponMinimumPurchase("10% + en gratis gave på bestillinger over 25 €"), undefined);
  assert.equal(extractCouponMinimumPurchase("10% rabatt på alle ordinære priser under 1000,-"), undefined);
  // Two different thresholds are ambiguous.
  assert.equal(extractCouponMinimumPurchase("Kjøp over 500 kr gir 10%. Kjøp over 1000 kr gir 20%"), undefined);
});

test("Rabattkode reads the reward from the title, skips expired and foreign codes, and paginates", async () => {
  const pages = {
    discounts: {
      nextPageToken: "p2",
      documents: [
        discount({ is_published: true, title: "Få 300kr i avslag på bestillingen", subtitle: "Ved kjøp over 1000kr", discount_amount: 15, discount_code: "LKJAGNWO", url_plugin: "https://www.trademax.no", company_id: "trademax" }),
        discount({ is_published: true, title: "Få 25% på ordinære varer", subtitle: "Ekskl. salg", discount_amount: 25, discount_code: "OLD25", url_plugin: "https://shop.no", expiration_ts: "2026-11-12T10:00:00Z" }),
        discount({ is_published: true, title: "Få 20% på ordinære varer", subtitle: "Gjelder i Sverige", discount_amount: 20, discount_code: "SE20", url_plugin: "https://russemerch.com", country: "Sverige" }),
        discount({ is_published: true, is_reported: true, title: "Få 10%", discount_amount: 10, discount_code: "BAD", url_plugin: "https://shop.no" }),
      ],
    },
    "discounts:p2": {
      documents: [
        discount({ is_published: true, title: "Få gratis frakt på kjøpet", subtitle: "ukjent utløpsdato", discount_amount: 5, discount_code: "FREESHIPPING", url_plugin: "https://www.reima.com/nb-NO", company_id: "reima" }),
        discount({ is_published: true, title: "Få 20 måltider fra kun 54kr per porsjon", discount_amount: 30, discount_code: "FRESH", url_plugin: "www.hellofresh.no/", expiration_ts: "2026-12-31T12:00:00Z" }),
        discount({ is_published: false, title: "Få 50%", discount_amount: 50, discount_code: "HIDDEN", url_plugin: "https://shop.no" }),
      ],
    },
    companies: {
      documents: [
        { name: `${COMPANY}trademax`, fields: { name: { stringValue: "Trademax" } } },
        { name: `${COMPANY}reima`, fields: { name: { stringValue: "Reima" } } },
      ],
    },
  };

  await withFirestore(pages, async (firestoreBaseUrl, requests) => {
    const offers = await crawlRabattkode({ firestoreBaseUrl, generatedAt, logger });
    assert.ok(requests.some((url) => url.includes("pageToken=p2")));
    assert.deepEqual(offers.map((offer) => offer.discountCode), ["LKJAGNWO", "FREESHIPPING", "FRESH"]);

    const [trademax, reima, hellofresh] = offers;
    assert.equal(trademax?.reward, "300 kr");
    assert.equal(trademax?.merchantName, "Trademax");
    assert.deepEqual(trademax?.rewardCalculation, { minimumPurchaseNok: 1000, minimumPurchaseExclusive: true });
    assert.equal(reima?.reward, "Gratis frakt");
    assert.equal(hellofresh?.reward, "Rabattkode");
    assert.deepEqual(hellofresh?.domains, ["hellofresh.no"]);
    assert.match(hellofresh?.terms ?? "", /Gyldig til 31\.12\.2026/);
    assert.ok(offers.every((offer) => offer.updatedAt === generatedAt));
  });
});

test("Rabattkode names the request and status when Firestore fails", async () => {
  await withFirestore({}, async (firestoreBaseUrl) => {
    await assert.rejects(
      crawlRabattkode({ firestoreBaseUrl, generatedAt, logger }),
      /Rabattkode Firestore request http:\/\/127\.0\.0\.1:\d+\/documents\/discounts\?pageSize=\d+ responded HTTP 503/,
    );
  }, 503);
});
