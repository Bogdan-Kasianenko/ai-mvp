export const noStartGuide = {
    "id":  "noStart",
    "instructions":  "AUTO NESTARTUJE\nPokud zákazník popisuje, že auto nejde nastartovat, použij company.symptomGuide.noStart. Cílem je vysvětlit relevantní možnosti podle konkrétního projevu a pomoci s dalším postupem, nikoli automaticky nabídnout objednání.\n\nZačni vstřícně a jednou užitečnou otázkou. Nezačínej větou „bez kontroly nelze příčinu určit“ ani seznamem všech možných závad. Zohledni scope, safetyRules a již známé údaje o vozidle.\n\nU spalovacího vozu použij firstQuestion pouze tehdy, když ještě nevíš, co se při startování děje. Pokud zákazník již napsal „jen to cvaká“, „motor se normálně točí, ale nechytne“ nebo „vůbec nic nereaguje“, tuto informaci přijmi a otázku na stejné možnosti neopakuj.\n\nPokud pohon neznáš a je potřebný pro výběr větve, zjisti značku, model, přibližný rok a druh pohonu jako jeden okruh. Známé údaje znovu nevyžaduj. U elektromobilu a hybridu nepředpokládej běžný startér; zjisti, zda se vůz přepne do stavu připraveného k jízdě a jaké přesné hlášení zobrazuje. Ticho samo o sobě u těchto vozů nepovažuj za závadu.\n\nV possibleCauses vybírej podle appliesWhen a skutečně sdělených projevů. Vysvětli jednu nebo nejvýše dvě relevantní možnosti a proč stojí za prověření. Potom podle potřeby polož jednu distinguishingQuestion, pokud její odpověď ještě neznáš a pomůže rozlišit další postup. Otázky ani celé záznamy z databáze nevypisuj mechanicky.\n\nSamotné „cvaká“ nerozlišuje jedno cvaknutí od rychlého opakovaného cvakání. Pokud je to užitečné, zeptej se pouze na tento rozdíl. Nevracej zákazníka k celé úvodní otázce. Ani podle typu cvakání neoznačuj baterii nebo startér za jistě vadné.\n\nDodrž obecný limit nejvýše dvou upřesňujících otázek k projevu napříč historií. Po odpovědi neopakuj stejnou hypotézu ani obecné upozornění na nejistotu. Uveď novou informaci pouze tehdy, když mění vysvětlení nebo doporučení.\n\nPři návrhu pomoci stručně vysvětli relevantní workshopCheck. Rozlišuj například ověření baterie a napájení od kontroly startéru nebo hledání příčiny u motoru, který se otáčí. Nenahrazuj všechny možnosti univerzálním „uděláme diagnostiku“.\n\nPři skutečném nebezpečí použij safetyRules přednostně a naléhavé pokyny vlož do safetyWarning. Nenaváděj k nebezpečným zásahům, nevyžaduj opakované pokusy o startování a nedávej univerzální postup startování přes kabely.\n\nDo problem ukládej pouze sdělené příznaky, ne hypotézy jako potvrzené závady. Nevytvářej automaticky požadavek na výměnu baterie, startéru nebo jiného dílu. Samotná žádost o radu není souhlas s objednáním. Podle situace nabídni pomoc s kontrolou nebo odtahem; známé informace o kontaktu na odtah znovu nevyžaduj.",
    "knowledge":  {
                      "name":  "Auto nestartuje",
                      "examples":  [
                                       "Auto nejde nastartovat",
                                       "Při startování jen cvaká",
                                       "Startér točí, ale motor nechytne",
                                       "Po stisknutí startu se nic neděje"
                                   ],
                      "scope":  "Základní rozlišení pro spalovací vozidla. U elektromobilu nebo hybridu nejprve zjisti typ vozu a co se zobrazuje na přístrojové desce. Nepředpokládej běžný startér ani závadu spalovacího motoru.",
                      "firstQuestion":  "Co se při pokusu o nastartování děje — motor se otáčí, slyšíte jen cvakání, nebo se vůbec nic neozve?",
                      "possibleCauses":  [
                                             {
                                                 "id":  "low_voltage_supply",
                                                 "name":  "Slabá 12V baterie nebo problém s elektrickým připojením",
                                                 "appliesWhen":  "Motor se neotáčí nebo se otáčí nezvykle pomalu; zákazník popisuje rychlé opakované cvakání, pohasínání nebo nefunkční elektrické vybavení.",
                                                 "explanation":  "Jednou z možností je slabá baterie nebo špatné elektrické připojení. Pro startování pak nemusí být k dispozici dost energie.",
                                                 "distinguishingQuestion":  "Pohasíná při pokusu o nastartování přístrojová deska, nebo svítí stejně jako obvykle?",
                                                 "workshopCheck":  "Ověření stavu a zatížitelnosti 12V baterie, připojení a podle výsledku také dobíjení.",
                                                 "limits":  "Cvakání ani pohasínání samo neurčuje vadný díl. Nenavrhuj automatickou výměnu baterie. Normálně svítící kontrolky nevylučují problém s napájením."
                                             },
                                             {
                                                 "id":  "starter_circuit",
                                                 "name":  "Startér nebo jeho elektrický obvod",
                                                 "appliesWhen":  "U spalovacího vozu se motor neotáčí. Zákazník může popsat jedno výrazné cvaknutí; stav baterie a napájení zatím nemusí být ověřený.",
                                                 "explanation":  "Pokud se motor vůbec neotáčí, stojí za prověření také startér a jeho elektrický obvod. Jedno cvaknutí může tomuto směru odpovídat, ale podobně se může projevit i problém s napájením.",
                                                 "distinguishingQuestion":  "Ozve se jedno cvaknutí, nebo několik rychlých cvaknutí za sebou?",
                                                 "workshopCheck":  "Nejprve ověření napájení, potom elektrického obvodu a funkce startéru.",
                                                 "limits":  "Neoznačuj startér za vadný jen podle zvuku. Nenaváděj zákazníka k propojování kontaktů nebo úderům do startéru."
                                             },
                                             {
                                                 "id":  "key_authorization",
                                                 "name":  "Nerozpoznaný klíč nebo blokování startu",
                                                 "appliesWhen":  "Zákazník uvedl hlášení o nerozpoznaném klíči, imobilizéru nebo podobné upozornění.",
                                                 "explanation":  "Pokud vůz hlásí nerozpoznaný klíč, může být start blokovaný kvůli jeho rozpoznání. Tato informace je užitečnější než automaticky předpokládat vybitou autobaterii.",
                                                 "distinguishingQuestion":  "Jaké přesné hlášení nebo symbol se na přístrojové desce zobrazuje?",
                                                 "workshopCheck":  "Postup podle návodu konkrétního vozu a kontrola klíče či systému autorizace startu.",
                                                 "limits":  "Nevymýšlej univerzální místo pro přiložení klíče ani postup přeprogramování. Nezaměňuj baterii v klíči s 12V baterií vozidla."
                                             },
                                             {
                                                 "id":  "cranks_without_starting",
                                                 "name":  "Motor se otáčí, ale nenaskočí",
                                                 "appliesWhen":  "Je potvrzen spalovací motor a zákazník říká, že jej startér otáčí, ale motor nezačne běžet.",
                                                 "explanation":  "Když startér motor otáčí, je potřeba rozlišit například problém s přívodem paliva a u benzínového motoru také se zapalováním. Bez dalších projevů nelze vybrat konkrétní součást.",
                                                 "distinguishingQuestion":  "Začalo to po tankování, nebo auto předtím normálně jelo a při dalším startu už nenaskočilo?",
                                                 "workshopCheck":  "Podle typu motoru ověření přívodu paliva, případně zapalování a načtení závad včetně údajů při startování.",
                                                 "limits":  "U dieselu nenavrhuj zapalovací svíčky ani cívky. Při záměně paliva přejdi na pravidla pro chybné tankování. Neoznačuj palivové čerpadlo ani jiný díl za potvrzenou příčinu."
                                             }
                                         ],
                      "safetyRules":  [
                                          "Při kouři, požáru, silném zápachu paliva nebo jiném bezprostředním nebezpečí mají přednost bezpečnostní pokyny.",
                                          "Nedoporučuj opakované dlouhé pokusy o startování.",
                                          "Nedávej univerzální návod na startování přes kabely bez znalosti konkrétního vozu a pokynů výrobce.",
                                          "U hybridů a elektromobilů nenaváděj k manipulaci s vysokonapěťovou soustavou."
                                      ],
                      "conversationRules":  [
                                                "Pokud zákazník již popsal, co se při startování děje, první otázku neopakuj.",
                                                "Vyber jen hypotézy odpovídající skutečně známým projevům.",
                                                "Vysvětli možnost a smysl další otázky; nevypisuj všechny varianty najednou.",
                                                "Hypotézy nejsou potvrzené závady a neznamenají automatický výběr opravy."
                                            ]
                  }
};
