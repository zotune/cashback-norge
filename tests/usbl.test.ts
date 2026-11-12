import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractDomainsFromText,
  extractHydrationProps,
  extractUsblReward,
} from "../src/backend/providers/usbl.js";

test("USBL: hydration props are read when the hydrateRoot call is wrapped in an event listener", () => {
  // usbl.no/medlemskap/medlemsfordeler (2026-11-12): the call now ends with `}))\n    });`.
  const html = `<script>document.addEventListener("DOMContentLoaded", function () {
      ReactDOMClient.hydrateRoot(react_d914, React.createElement(UsblComponents.PerkListPage,{
  "pageList": { "items": [{ "title": "TusenFryd - Opptil 25 % rabatt", "url": "/medlemskap/medlemsfordeler/tusenfryd", "text": "Tekst med {klammer} og \\"sitat\\"" }] },
  "title": "Medlemsfordeler",
  "pagination": null
}))
    });
</script>`;
  const props = extractHydrationProps(html);
  assert.ok(props);
  const pageList = props.pageList as { items: Array<{ text: string }> };
  assert.equal(pageList.items[0]?.text, 'Tekst med {klammer} og "sitat"');
  assert.equal(extractHydrationProps("<html><body>Ingen data</body></html>"), undefined);
});

test("USBL: rewards keep opptil, savings are not totalsum, monthly savings and waived fees are read correctly", () => {
  assert.equal(extractUsblReward("TusenFryd - Opptil 25 % rabatt\nTa med deg hele familien"), "opptil 25 %");
  // Several stated rates form a range; "opptil 30 %" in the summary is their maximum.
  assert.equal(
    extractUsblReward("Få opptil 30 % rabatt på billetter\n30 % rabatt på billetter i juni og august\n20 % rabatt på billetter i juli"),
    "20-30 %",
  );
  assert.equal(
    extractUsblReward("Som Usbl-medlem kan du spare opptil 1299 kr på 5 matkasser\nSpar opptil 1309,- på dine 5 første matkasser!"),
    "opptil 1 309 kr",
  );
  assert.equal(
    extractUsblReward("1990,- for installasjon av alarm (spar 2990,-)\nSpar 59,- i månedsabonnement (verdi 588,-)"),
    "2 990 kr",
  );
  assert.equal(
    extractUsblReward("Dette får du som Usbl-medlem:\nGratis tinglysningsgebyr, til en verdi av 545 kr\nIngen skjulte gebyrer"),
    "545 kr",
  );
  // An incidental free extra with no stated value is not a reward of its own.
  assert.equal(extractUsblReward("Usbl har inngått en avtale med Telia\nGratis befaring"), "");
});

test("USBL: a domain is not read from the middle of a word with non-ASCII letters", () => {
  assert.deepEqual(extractDomainsFromText("Velg \"Kärcher.no\" og gå til nettbutikken"), []);
  assert.deepEqual(extractDomainsFromText("Handle på jaktogfriluft.no i dag"), ["jaktogfriluft.no"]);
});
