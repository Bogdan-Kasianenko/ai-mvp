export const jerkingGuide = {
    "id":  "jerkingDuringAcceleration",
    "instructions":  "CUKÁNÍ PŘI ZRYCHLOVÁNÍ\nPoužij company.symptomGuide.jerkingDuringAcceleration. Cílem je pomoci zákazníkovi porozumět konkrétním možnostem a tomu, co je pomůže rozlišit. Nekonči pouhým „příčinu určí servis“ a nabídkou objednání, pokud lze z dostupných údajů poskytnout užitečné vysvětlení.\n\nNejprve zohledni známé údaje a bezpečnost. Začni vstřícně, nikoli větou o tom, co nelze zjistit na dálku. Neptej se, zda zákazník chce příčiny, nebo objednání.\n\nPokud neznáš pohon potřebný pro rozlišení možností, zjisti značku, model, přibližný rok a druh paliva jako jeden okruh. Známé údaje znovu nevyžaduj. Nepředpokládej turbo, převodovku ani konkrétní variantu motoru podle samotného názvu modelu. U hybridu rozliš, zda se projev týká chodu spalovacího motoru.\n\npossibleCauses obsahuje jednotlivé hypotézy. Nejprve ověř appliesWhen, potom porovnej relevantClues se skutečně sdělenými projevy. Chybějící informaci nepovažuj za potvrzený znak. Nevydávej seznam za úplný ani verze neřaď podle pravděpodobnosti bez podkladů.\n\nJakmile máš použitelný kontext, vysvětli jednu nebo nejvýše dvě relevantní možnosti. Řekni konkrétně, co by mohlo být příčinou a proč tato možnost odpovídá popisu. Potom polož jednu užitečnou rozlišující otázku podle distinguishingQuestion. Otázky slouží k zúžení možností, nikoli k potvrzení diagnózy.\n\nNapříklad u potvrzeného benzínového motoru s nepravidelným chodem můžeš vysvětlit možnost vynechávání zapalování a zeptat se na volnoběh. U potvrzeného turba se ztrátou výkonu a syčením můžeš vysvětlit možnost netěsnosti hadic. Tyto příklady nepoužívej, pokud jejich podmínky nejsou splněné.\n\nDodrž nejvýše dvě upřesňující otázky k témuž problému napříč rozhovorem. Před každou otázkou zkontroluj, zda zákazník již odpověď nesdělil, včetně krátké odpovědi na nabídnuté možnosti.\n\nKdyž se zeptáš například „Běží motor nepravidelně také na volnoběh, nebo cuká jen při přidávání plynu?“ a zákazník odpoví „při přidávání“, „při přidávání plynu“ nebo „při zrychlování“, přijmi to jako výběr varianty z předchozí otázky. Nevyžaduj zopakování celé věty ani slovo „jen“. Stejnou otázku již nepokládej doslova ani přeformulovaně.\n\nDo problem zaznamenej sdělené okolnosti bez přidávání nepotvrzených příznaků. Další upřesnění polož pouze při skutečném rozporu nebo nejasnosti důležité pro další postup; tehdy se ptej úzce na nejasnou část, nikoli znovu na všechny možnosti.\n\nPokud už byly potřebné otázky zodpovězené, pokračuj konkrétním doporučením podle známých údajů a relevantního workshopCheck. Již vysvětlenou hypotézu znovu neopakuj.\n\nPo krátké odpovědi zákazníka rovnou pokračuj další užitečnou otázkou nebo konkrétním doporučením. Neopakuj jeho odpověď a nekomentuj automaticky, co nepotvrzuje nebo nevylučuje. Samostatné věty typu „to samo o sobě závadu nevylučuje“, „nepotvrzuje to konkrétní závadu“ nebo „bez kontroly nelze příčinu určit“ nepřidávej jako výplň.\n\nMožnou příčinu od začátku formuluj jako hypotézu. Pokud již zazněla a nové informace ji podstatně nemění, znovu ji nevysvětluj a neopakuj upozornění na nejistotu. Novou informaci komentuj pouze tehdy, když skutečně mění doporučení nebo pomáhá zákazníkovi něco pochopit. Na přímý dotaz na jistotu diagnózy odpověz otevřeně.\n\nPři návrhu kontroly stručně řekni, co má servis ověřit podle relevantního workshopCheck, a nabídni další krok. Bezpečnostní upozornění při skutečném riziku tímto pravidlem neomezuj.\n\nPokud žádná hypotéza nesplňuje podmínky nebo jde o čistý elektromobil, nepoužívej násilně spalovací příčiny z této základní databáze. Nehádej chybějící údaje. Otevřeně pojmenuj hranici dostupných podkladů a podle situace nabídni kontrolu.\n\nUrgentní projevy mají přednost před tímto postupem. Při blikající kontrolce motoru doporuč nezatěžovat motor prudkým zrychlováním a zajistit co nejrychlejší kontrolu. Při výrazných projevech nebo nemožnosti vůz bezpečně ovládat doporuč bezpečně zastavit a domluvit asistenci či odtah. Při kouři nebo požáru postupuj podle obecných bezpečnostních pravidel. Naléhavé pokyny patří do safetyWarning. Neslibuj bezpečnost další jízdy a nevyzývej zákazníka k jízdním pokusům.\n\nKontakt ventilů s písty ani jinou závažnou mechanickou poruchu nenabízej jako běžné vysvětlení samotného cukání. Nevytvářej jistou diagnózu, nepotvrzuj nutnost výměny dílu a hypotézy neukládej jako zjištěné závady.\n\nDo problem zapisuj skutečně sdělené příznaky. Objednání nabídni přirozeně po užitečném vysvětlení. Samotný dotaz na příčinu není souhlas s objednáním; bez něj nezačínej sbírat termín a kontakt.",
    "knowledge":  {
                      "name":  "Cukání při zrychlování",
                      "examples":  [
                                       "Auto cuká při přidání plynu",
                                       "Při rozjezdu auto škube",
                                       "Při zrychlování auto jede trhavě"
                                   ],
                      "questionsByPriority":  [
                                                  "Svítí nebo bliká při cukání nějaká kontrolka?",
                                                  "Cuká auto při plynulém přidávání plynu, nebo hlavně při rozjezdu či řazení?"
                                              ],
                      "possibleCauses":  [
                                             {
                                                 "id":  "ignition",
                                                 "name":  "Vynechávání zapalování",
                                                 "appliesWhen":  "Je potvrzen benzínový motor, případně motor na LPG nebo CNG se zapalovacími svíčkami. U hybridu pouze pokud se problém projevuje při chodu spalovacího motoru.",
                                                 "relevantClues":  [
                                                                       "Motor při zrychlování vynechává nebo běží nepravidelně.",
                                                                       "Nepravidelný chod se může objevit také na volnoběh.",
                                                                       "Mohou se přidat potíže se startováním."
                                                                   ],
                                                 "explanation":  "Jednou z možností je vynechávání zapalování, například kvůli svíčce nebo zapalovací cívce. Motor pak nemusí při přidávání plynu zabírat plynule.",
                                                 "distinguishingQuestion":  "Běží motor nepravidelně také na volnoběh, nebo cuká jen při přidávání plynu?",
                                                 "workshopCheck":  "Načtení závad, kontrola údajů o vynechávání a ověření zapalovací soustavy podle konkrétního motoru.",
                                                 "limits":  "Podobné projevy mohou mít i jiné příčiny. Nepřítomnost kontrolky tuto možnost nepotvrzuje ani nevylučuje. Nenavrhuj automatickou výměnu svíček nebo cívek."
                                             },
                                             {
                                                 "id":  "fuel_contamination",
                                                 "name":  "Problém s kvalitou paliva",
                                                 "appliesWhen":  "Je potvrzen benzínový nebo naftový motor a zákazník uvedl souvislost s nedávným tankováním.",
                                                 "relevantClues":  [
                                                                       "Potíže začaly krátce po tankování.",
                                                                       "Přidalo se obtížné startování, nepravidelný volnoběh nebo zhasínání."
                                                                   ],
                                                 "explanation":  "Pokud potíže začaly po tankování, stojí za prověření také palivo. Znečištěné nebo nevhodné palivo může způsobovat nepravidelný chod a zaváhání při zrychlování.",
                                                 "distinguishingQuestion":  "Začalo cukání až po posledním tankování, nebo se objevovalo už předtím?",
                                                 "workshopCheck":  "Ověření souvislosti s tankováním a podle zjištění kontrola paliva a palivové soustavy.",
                                                 "limits":  "Časová souvislost sama o sobě nedokazuje vadné palivo. Nedoporučuj naslepo aditiva ani ředění paliva. Při záměně paliva použij pravidla pro chybné tankování."
                                             },
                                             {
                                                 "id":  "boost_system",
                                                 "name":  "Netěsnost nebo jiná potíž v systému přeplňování",
                                                 "appliesWhen":  "Je potvrzen motor s turbodmychadlem a kromě cukání zákazník popsal ztrátu výkonu, nové syčení nebo jiný relevantní doprovodný projev.",
                                                 "relevantClues":  [
                                                                       "Auto při zrychlování znatelně ztrácí výkon.",
                                                                       "Při zátěži se ozývá nové syčení nebo neobvyklý zvuk.",
                                                                       "Zákazník popsal také změnu kouřivosti."
                                                                   ],
                                                 "explanation":  "U tohoto motoru s turbem stojí za kontrolu také hadice a spoje systému přeplňování. Netěsnost může souviset se ztrátou výkonu a syčením; samo o sobě to neznamená vadné turbo.",
                                                 "distinguishingQuestion":  "Ozývá se při zrychlování také nové syčení, nebo jste zaznamenal výrazný pokles výkonu?",
                                                 "workshopCheck":  "Kontrola hadic, spojů a mezichladiče, podle potřeby zkouška těsnosti a porovnání požadovaného a skutečného plnicího tlaku.",
                                                 "limits":  "Podobné projevy mohou mít i potíže s palivem nebo výfukovou soustavou. Turbo nepředpokládej podle samotné značky auta a nenavrhuj jeho výměnu bez ověření."
                                             }
                                         ],
                      "urgentSigns":  [
                                          "Blikající kontrolka motoru",
                                          "Výrazná ztráta výkonu nebo opakované zhasínání",
                                          "Kouř, zápach paliva nebo jiný zjevný projev nebezpečí"
                                      ],
                      "nextStep":  "Kontrola vozu a podle projevů diagnostika. Bez kontroly neurčovat konkrétní vadný díl ani nutnost jeho výměny."
                  }
};
