import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInstructions } from "./instructions.mjs";
import { oilFiltersGuide } from "./guides/oil-filters.mjs";
import { tiresGuide } from "./guides/tires.mjs";

const company = JSON.parse(readFileSync(new URL("./company.json", import.meta.url), "utf8"));
const count = (text, heading) => text.split("\n").filter(line => line.trim() === heading).length;
for (const activeGuides of [[], ["tires"], ["oilFilters"], ["oilFilters", "tires"]]) {
  test("oil pricing migration keeps scenario rules conditional: " + JSON.stringify(activeGuides), () => {
    const text = buildInstructions({company, priceBooks:{}, currentPragueDate:"28. října 2026", activeGuides});
    const oilEnabled = activeGuides.includes("oilFilters");
    const common = text.slice(text.indexOf("\nCENY\n"), text.indexOf("\nSBĚR ÚDAJŮ A ZMĚNY\n"));
    assert.ok(common.length > 500, "Locate the common pricing block using both boundaries");
    assert.doesNotMatch(common, /oilPriceMode|oilPriceRequests|oilFilterScopeReviewed|source=compare|U LPG/);
    assert.equal(count(text, "CENY"), 1);
    assert.equal(count(text, "POROVNÁNÍ DODÁNÍ MATERIÁLU"), 1);
    for (const heading of ["SERVEROVÉ CENY OLEJE A FILTRŮ", "NAČASOVÁNÍ A POROVNÁNÍ CEN", "DODÁNÍ OLEJE A FILTRŮ", "MOTOR PŘI VÝMĚNĚ OLEJE"]) {
      assert.equal(count(text, heading), oilEnabled ? 1 : 0, heading);
    }
    assert.equal(text.split(oilFiltersGuide.instructions).length - 1, oilEnabled ? 1 : 0);
    assert.equal(text.split(tiresGuide.instructions).length - 1, activeGuides.includes("tires") ? 1 : 0);
    assert.match(common, /připojený guide; mají přednost/);
    assert.match(common, /partsAction=keep/);
    assert.match(common, /serverContext.priceMemory/);
    assert.match(common, /Tabulku nenahrazuj dlouhým slovním vysvětlením/);
    assert.match(common, /Pokud upozornění nepřipojuje server/);
    assert.match(common, /service_fee_variants/);
    assert.match(common, /timing_service/);
  });
}

test("oil comparison and automatic pricing retain their structured server contract", () => {
  const text = oilFiltersGuide.instructions;
  assert.match(text, /oilPriceMode=automatic a požadavky se source=selected/);
  assert.match(text, /oilPriceMode=requested a pro každý porovnávaný úkon source=compare/);
  assert.match(text, /jednu položku optionId=engine_oil/);
  assert.match(text, /Při porovnání vrať partsAction=keep/);
  assert.match(text, /Interní zachování volby zákazníkovi neoznamuj/);
  assert.match(text, /v oilPriceFollowUp/);
  assert.match(text, /Nezměněné dříve sdělené ceny/);
  assert.match(text, /cenu jednoho filtru nevydávej za cenu výměny obou/);
});
