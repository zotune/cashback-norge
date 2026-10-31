import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCashbackIndex, type CashbackOffer, decodeHtmlEntities, stripHtml } from "../src/shared/cashback.js";
import { decodeHtmlEntities as decodeFromProductMatch } from "../src/shared/product-match.js";

const offer: CashbackOffer = {
  provider: "studenttorget", merchantName: "B&amp;B Kort &#197;lesund L&amp;#x27;Occitane", domains: ["kort.example"],
  reward: "10&nbsp;%", sourceUrl: "https://studenttorget.no/x", activationUrl: "https://studenttorget.no/x",
  terms: "&bull; Hjem &amp; Hage: 2,5%\r\n&#248;l og H&auml;stens &rarr; &Oslash;st\r\nPris &lt;b&gt;fra&lt;/b&gt; 1 000&euro;",
  discountCode: "SAVE&amp;10", updatedAt: "2026-10-31T00:00:00.000Z",
};

test("the published index has plain offer text: references decoded, Windows line breaks removed, codes untouched", () => {
  const [published] = buildCashbackIndex([offer], "2026-10-31T00:00:00.000Z").offers;
  assert.equal(published!.merchantName, "B&B Kort Ålesund L'Occitane");
  assert.equal(published!.reward, "10 %");
  assert.equal(published!.terms, "• Hjem & Hage: 2,5%\nøl og Hästens → Øst\nPris <b>fra</b> 1 000€");
  // A code is typed by the shopper exactly as the source shows it.
  assert.equal(published!.discountCode, "SAVE&amp;10");
});

test("one shared decoder keeps case, decodes numbers and leaves unknown references", () => {
  assert.equal(decodeHtmlEntities("&Oslash;&oslash; &AElig;&aelig; &#x2713; &#8211; &mdash;"), "Øø Ææ ✓ – —");
  assert.equal(decodeHtmlEntities("Tom &unknown; &#0; & co"), "Tom &unknown; &#0; & co");
  // Decoding happens once: an escaped reference stays visible as a reference.
  assert.equal(decodeHtmlEntities("&amp;nbsp;"), "&nbsp;");
  assert.equal(decodeFromProductMatch, decodeHtmlEntities);
  assert.equal(stripHtml("<p>H&auml;stens &amp; Co</p><ul><li>&bull; 10&nbsp;%</li></ul>"), "Hästens & Co\n- • 10 %");
});
