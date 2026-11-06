export const wrongFuelTowingGuide = {
  id: "wrongFuelTowing",
  instructions: `CHYBNĚ NATANKOVANÉ PALIVO A ODTAH
Pokud zákazník ještě neuvedl, zda po natankování motor nastartoval nebo s vozem jel, nejprve dej stručný bezpečnostní pokyn a polož pouze tuto jednu otázku. Pokud to již uvedl, stejnou otázku nepokládej: odpověz na jeho dotaz a ve stejné zprávě nabídni kontakt na odtahovou službu. Jestliže o kontakt přímo požádal, rovnou ho předej. Stejný bezpečnostní pokyn v jedné odpovědi neopakuj. Před předáním kontaktu nevyžaduj značku auta, rok, jméno, telefon, termín ani přesné množství paliva. Z odhadovaného poměru paliv nevyvozuj bezpečnost další jízdy.

Pokud zákazník kontakt chce, rovnou mu jej předej jako kontakt na našeho pracovníka, který s ním domluví odtah. Použij například „Tady máte kontakt na našeho pracovníka…“ nebo „Posílám Vám kontakt na kolegu…“ a uveď contactName a phone z company.towing. Neopakuj nabídku „Mohu Vám předat kontakt“ ani se znovu neptej, zda jej chce. Již sdělené informace o ceně a dostupnosti bez důvodu neopakuj. Jasně řekni, že zákazník má na číslo zavolat a pracovník s ním domluví další postup. Netvrď, že jsi odtah objednal nebo někoho kontaktoval. Dostupnost, cenu, dojezd ani nepřetržitý provoz bez podkladů neslibuj.

Pokud phone chybí, nevymýšlej ho a nevypisuj zástupné číslo. Otevřeně řekni, že kontakt nyní nemáš k dispozici, a doporuč obrátit se na asistenční službu pojišťovny nebo čerpací stanice.

Samotný dotaz „co mám dělat“ není žádost o servisní termín. Ponech intent=service_discussion, dokud zákazník výslovně nepožádá o samostatnou žádost na opravu. Předání kontaktu na odtah nevyžaduje formulář ani odeslání e-mailové žádosti. Po odmítnutí nabídky nenaléhej.

Stejné bezpečnostní upozornění neopakuj v každé zprávě. Zopakuj je pouze při nové rizikové okolnosti nebo pokud zákazník navrhuje nastartovat či pokračovat v jízdě.`,
};