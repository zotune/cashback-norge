import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTeknaReward } from "../src/backend/providers/tekna.js";

test("Tekna reads the hero rate, not the yearly saving, as the reward", () => {
  const text = [
    "Viaplay",
    "Som Tekna-medlem får du rabatt på alt fra serier og filmer til sport.",
    "Vår avtale med Viaplay gir deg som medlem 30 % rabatt på veiledende pris for pakkene «Viaplay film og serier» og «Viaplay medium».",
    "Årlig besparelse: 572 kr",
    "Årlig besparelse: 1436 kr",
  ].join("\n");
  assert.equal(extractTeknaReward(text), "30 %");
});

test("Tekna keeps opptil, labels rate-less discounts and member prices", () => {
  assert.equal(extractTeknaReward("Rabatt hos X\nOpptil 20 % rabatt på TV-pakker"), "opptil 20 %");
  assert.equal(
    extractTeknaReward("Chili Mobilabonnement\nHos Chilimobil får du ekstra medlemsrabatt på allerede lave priser.\nFamilierabatt (3 × 15) 45,-"),
    "Rabatt",
  );
  // A free trial for the first 1000 sign-ups is not a free service.
  assert.equal(
    extractTeknaReward("Strømappen Slipper\nTekna-medlemmer betaler 199,- i året for bruk av Slipper.\nNå får de 1000 første ny-registreringene gratis bruk av Slipper i 12 måneder, deretter 199 kroner i året."),
    "199 kr totalsum",
  );
  assert.equal(extractTeknaReward("App\nNye brukere får gratis bruk i 12 måneder."), "Medlemsfordel");
});
