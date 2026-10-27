export const tiresGuide = {
  id: "tires",
  instructions: `PŘEZUTÍ PNEUMATIK

Rozliš přezutí pneumatik na ráfcích (seasonal_tires) a výměnu kompletních kol (wheel_swap). Jasně uvedený úkon ani počet znovu nepotvrzuj.

Použij známé údaje. Chybějící údaje zjišťuj postupně: počet, průměr ráfků, materiál ráfků. Dvě přední pneumatiky znamenají počet dvě. Při otázce na průměr ponech tires.rimDiameter v pendingDetails. Rozměr lze najít na bočnici: u příkladu 205/55 R16 je průměr 16 palců. Příklad není údaj o zákazníkově autě.

Pokud materiál dosud nezazněl, zeptej se, zda jsou ráfky plechové, nebo hliníkové. Během této otázky ponech tires.rimMaterial v pendingDetails; samotné chybění údaje neznamená, že jej zákazník nezná. Pokud materiál nezná, odmítne ho určovat nebo požádá o obě ceny, použij material=unknown. Známý materiál mapuj na steel nebo alu. Po vyřešení příslušnou položku pendingDetails odstraň; ostatní nevyřešené položky zachovej.

SERVEROVÉ CENY ŠIN
Ceny přezutí a výměny kompletních kol vybírá a zobrazuje server. Při sdělení ceny vyplň tirePriceRequest:
- optionId: seasonal_tires nebo wheel_swap;
- quantity: známý počet 1 až 4;
- rimDiameter: známý průměr v palcích jako číslo;
- material: steel, alu nebo unknown.

Parametry čti ze skutečného rozhovoru, nikoli z příkladů nebo odhadů. Pokud nutný údaj chybí, vrať tirePriceRequest=null a zeptej se na něj. Při počtu mimo 1 až 4 nech cenu upřesnit servisem.

Po vyjasnění parametrů jednou požádej server o cenu před přechodem k údajům vozidla. Na přímý dotaz na cenu nebo „uveď obě“ vyplň tirePriceRequest také opakovaně. Při nezměněné již sdělené ceně bez nového dotazu vrať null.

Když je tirePriceRequest vyplněné, nech v reply krátkou přirozenou reakci bez částek a bez navazující otázky. Částky, vlastní cenovou tabulku ani příslib „uvedu ceny“ do reply nepiš. Jednu navazující otázku napiš do oilPriceFollowUp; navzdory názvu toto pole slouží také pro otázku pod cenami pneumatik. Server připojí tabulku mezi reply a tuto otázku.

Při ceně pouze za pneumatiky nastav oilPriceMode=none a oilPriceRequests=[]. Pokud se zákazník současně ptá také na olej a filtry, vyplň jejich cenové požadavky samostatně. Společnou navazující otázku napiš jen jednou.

Při material=unknown uveď v reply, že materiál ráfků upřesní servis při převzetí, a zachovej tuto poznámku v požadavku. Takové upřesnění servisem neblokuje žádost. Zachovej výměnu oleje, další vybrané práce a známé údaje. Cena nesmí sama přidat službu ani znamenat souhlas s odesláním žádosti.`,
};