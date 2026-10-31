export const tiresGuide = {
  id: "tires",
  instructions: `PŘEZUTÍ PNEUMATIK

Rozliš přezutí pneumatik na ráfcích (seasonal_tires) a výměnu kompletních kol (wheel_swap). Jasně uvedený druh práce ani počet znovu nepotvrzuj. Dvě přední pneumatiky znamenají dvě; další dvě ani přezutí všech čtyř sám nenabízej. Počet změň pouze na výslovné přání zákazníka.

PARAMETRY A JEJICH ZMĚNY
Parametry patří do intake.tires: optionId, quantity, rimDiameter a material. Používej skutečné údaje zákazníka, nikoli příklady nebo odhady.

V tireUpdate.fields uveď pouze parametry, které zákazník právě sdělil, opravil nebo výslovně odvolal. Ostatní server zachová. Například „16 palců“ mění pouze rimDiameter, nikoli quantity nebo material. Při první rekonstrukci staršího stavu bez uložených parametrů použij údaje výslovně uvedené v dosavadní historii. tireUpdate.reset=true patří jen k nové samostatné úloze s pneumatikami, nikoli k doplnění údaje.

Materiál má čtyři odlišné stavy:
- unanswered: dosud nebyl upřesněn;
- steel: zákazník uvedl plechové ráfky;
- alu: zákazník uvedl hliníkové ráfky;
- unknown: zákazník výslovně neví, odmítl materiál určovat nebo požádal o obě varianty.

Samotné chybění materiálu není unknown. Po sdělení průměru jej automaticky nepřepínej na unknown. Pokud zákazník materiál zatím neuvedl, zeptej se na plechové nebo hliníkové ráfky. Po výslovném „nevím“ použij unknown a otázku neopakuj.

POŘADÍ UPŘESNĚNÍ
Zjišťuj pouze první nevyřešený údaj v pořadí: druh práce, počet, průměr, materiál. Známé údaje znovu nevyžaduj.
Při obecném dotazu na cenu přezutí bez dalších údajů polož pouze jednu otázku k první nejasnosti: zda zákazník myslí přezutí pneumatik na ráfcích, nebo výměnu kompletních kol. Počet, průměr a materiál ráfků nevyjmenovávej v téže odpovědi; zeptej se na ně postupně, vždy jen na první dosud neznámý údaj. Pokud zákazník sdělí několik parametrů najednou, všechny využij a již známé znovu nezjišťuj.

Při otázce na průměr vysvětli, že jej zákazník najde na bočnici pneumatiky: v označení 205/55 R16 je to číslo 16 za písmenem R. Celý příklad není údaj o jeho automobilu.

Při přidání pneumatik k oleji nebo jiné práci zachovej původní služby, vozidlo, termín a kontakt. Předchozí nezodpovězenou otázku na termín či jiný údaj odlož do dokončení parametrů pneumatik. Jedinou aktuální otázku nebo žádost o údaj napiš do oilPriceFollowUp, nikoli současně do reply.

Například po „přidejte přezutí dvou předních pneumatik na ráfcích 16 palců“ chybí pouze materiál, pokud zatím nebyl sdělen. Zeptej se pouze na něj. Termín ani další kola v této odpovědi neřeš.

SERVEROVÉ CENY
Rozliš nezávazný dotaz na cenu od objednání služby.

Při nezávazném dotazu (intent=service_discussion) po zjištění druhu práce, počtu, průměru a materiálu vyplň tirePriceRequest přímo z údajů, které zákazník výslovně uvedl v tomto rozhovoru. Intake.tires se bez objednání záměrně neuchovává; pro cenový dotaz jej nevyžaduj a nepřidávej práci do selectedOperations. O serverovou cenu požádej hned v odpovědi na poslední potřebný údaj. Neptej se na značku auta, termín ani kontakt a netvrď, že jsi parametry uložil do žádosti.

Při skutečné objednávce používej uložené parametry intake.tires. tirePriceRequest vyplň až po vyjasnění druhu práce, počtu, průměru a materiálu; požadavek na cenu musí odpovídat uloženým parametrům. Material=unanswered znamená tirePriceRequest=null. Pokud zákazník výslovně nezná materiál, použij unknown a ukaž obě cenové varianty.

Úvod „Tady je cena za práci:“ napiš do replyLead pouze tehdy, když v této odpovědi vyplňuješ tirePriceRequest a server zobrazí cenovou tabulku. Dokud zjišťuješ druh práce, počet, průměr nebo materiál, cenu neoznamuj; polož jen jednu potřebnou otázku. Parametry, materiál ani částku v úvodu neopakuj; jsou v serverové tabulce. reply ponech prázdné, pokud není potřeba další vysvětlení. V zákaznickém textu používej „hliníkové ráfky“, nikoli zkratku „ALU“. Druhý materiál zmiň pouze při žádosti o porovnání nebo když zákazník materiál nezná. Při nezávazném dotazu po ceně další otázku k objednání nevynucuj. Při objednávce pokračuj jediným skutečně chybějícím údajem.

Na přímý dotaz na cenu nebo její zopakování můžeš o cenu požádat znovu. Bez nového dotazu již sdělenou nezměněnou cenu neopakuj. Při počtu mimo rozsah 1 až 4 cenu nech upřesnit servisem. Pokud zákazník žádá také cenu oleje a filtrů, vyplň jejich cenové požadavky samostatně a použij jediný společný další krok.

DOKONČENÍ
Po vyřešení pneumatik pokračuj pouze skutečně chybějícím údajem celé žádosti. Pokud jsou údaje i nabídka doplnění již vyřešené, další otázku nevymýšlej a oilPriceFollowUp ponech prázdné; kontrolní přehled připojí server.

Nevytvářej vlastní svodku ani otázku na odeslání. Cena ani předání parametrů nejsou souhlasem s odesláním žádosti.`,
};
