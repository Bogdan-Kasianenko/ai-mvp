const texts = {
  cs: {
    sent: "Žádost byla odeslána na e-mail servisu. Termín zatím není potvrzen; pracovník se Vám ozve.",
    statusSent:
      "Ano, žádost byla odeslána na e-mail servisu. Termín zatím není potvrzen; pracovník se Vám ozve.",
    notSent: "Tato žádost zatím nebyla odeslána. Termín není rezervován.",
    unknown:
      "Výsledek odeslání nelze spolehlivě ověřit. Aby nevznikla duplicitní žádost, automaticky ji znovu neposílám. Servis musí ověřit přijetí; termín není potvrzen.",
    failed: "Žádost se nepodařilo odeslat. Můžete odeslání zkusit znovu.",
    review: "Zkontrolujte prosím žádost:",
    send: "Mám žádost odeslat servisu?",
    unconfirmed: "Termín zatím není potvrzený; potvrdí ho pracovník servisu.",
    labels: [
      "Požadavek",
      "Vozidlo",
      "Motor",
      "Nájezd",
      "Popis",
      "Díly",
      "Preferovaný termín",
      "Jméno",
      "Telefon",
      "E-mail",
    ],
    parts: [
      "vlastní díly zákazníka",
      "díly zajistí servis",
      "není potřeba / dosud neupřesněno",
    ],
    busy: "Předchozí zpráva se ještě zpracovává. Zkuste to za chvíli.",
    limit: "Příliš mnoho požadavků. Zkuste to prosím za chvíli.",
    unavailable: "AI asistent nyní nemůže odpovědět. Zkuste to prosím později.",
    refusal:
      "S tímto požadavkem Vám nemohu pomoci. Můžete se zeptat na něco jiného.",
  },
  en: {
    sent: "Your request was emailed to the service centre. The appointment is not confirmed; the team will contact you.",
    statusSent:
      "Yes, your request was emailed to the service centre. The appointment is not confirmed yet.",
    notSent:
      "This request has not been sent yet. No appointment has been reserved.",
    unknown:
      "The sending result cannot be verified. To avoid a duplicate, I will not resend automatically. The service centre needs to check receipt; the appointment is not confirmed.",
    failed: "The request could not be sent. You can try sending it again.",
    review: "Please review your request:",
    send: "May I send this request to the service centre?",
    unconfirmed: "The service centre will confirm the appointment.",
    labels: [
      "Request",
      "Vehicle",
      "Engine",
      "Mileage",
      "Description",
      "Parts",
      "Preferred date",
      "Name",
      "Phone",
      "Email",
    ],
    parts: [
      "customer-supplied parts",
      "service-supplied parts",
      "not required / not specified",
    ],
    busy: "Your previous message is still being processed. Please wait a moment.",
    limit: "Too many requests. Please try again shortly.",
    unavailable:
      "The assistant is temporarily unavailable. Please try again later.",
    refusal:
      "I cannot help with this request. You can ask about something else.",
  },
  ru: {
    sent: "Заявка отправлена на почту автосервиса. Дата пока не подтверждена; сотрудник свяжется с Вами.",
    statusSent:
      "Да, заявка отправлена на почту автосервиса. Дата пока не подтверждена.",
    notSent: "Эта заявка пока не отправлена. Дата не забронирована.",
    unknown:
      "Результат отправки пока нельзя проверить. Чтобы не создать дубликат, повторно заявку не отправляю. Сервису нужно проверить получение; дата не подтверждена.",
    failed: "Не удалось отправить заявку. Можно попробовать отправить ещё раз.",
    review: "Проверьте, пожалуйста, заявку:",
    send: "Отправить эту заявку в автосервис?",
    unconfirmed: "Дату подтвердит сотрудник автосервиса.",
    labels: [
      "Услуга",
      "Автомобиль",
      "Двигатель",
      "Пробег",
      "Описание",
      "Детали",
      "Желаемая дата",
      "Имя",
      "Телефон",
      "Электронная почта",
    ],
    parts: [
      "детали клиента",
      "детали предоставляет сервис",
      "не требуются / не уточнено",
    ],
    busy: "Предыдущее сообщение ещё обрабатывается. Подождите немного.",
    limit: "Слишком много запросов. Повторите немного позже.",
    unavailable: "Ассистент временно недоступен. Попробуйте позже.",
    refusal: "С этим запросом я не могу помочь. Можно задать другой вопрос.",
  },
  uk: {
    sent: "Заявку надіслано на пошту автосервісу. Дату ще не підтверджено; працівник зв’яжеться з Вами.",
    statusSent:
      "Так, заявку надіслано до автосервісу. Дату ще не підтверджено.",
    notSent: "Цю заявку ще не надіслано. Дату не заброньовано.",
    unknown:
      "Результат надсилання неможливо перевірити. Щоб уникнути дублювання, повторно не надсилаю. Сервіс має перевірити отримання; дату не підтверджено.",
    failed: "Не вдалося надіслати заявку. Можна спробувати ще раз.",
    review: "Перевірте, будь ласка, заявку:",
    send: "Надіслати цю заявку до автосервісу?",
    unconfirmed: "Дату підтвердить працівник автосервісу.",
    labels: [
      "Послуга",
      "Автомобіль",
      "Двигун",
      "Пробіг",
      "Опис",
      "Деталі",
      "Бажана дата",
      "Ім’я",
      "Телефон",
      "Електронна пошта",
    ],
    parts: [
      "деталі клієнта",
      "деталі надає сервіс",
      "не потрібні / не уточнено",
    ],
  },
  sk: {
    sent: "Žiadosť bola odoslaná na e-mail servisu. Termín zatiaľ nie je potvrdený; pracovník sa Vám ozve.",
    statusSent:
      "Áno, žiadosť bola odoslaná servisu. Termín zatiaľ nie je potvrdený.",
    notSent: "Táto žiadosť zatiaľ nebola odoslaná. Termín nie je rezervovaný.",
    unknown:
      "Výsledok odoslania nemožno overiť. Aby nevznikla duplicitná žiadosť, automaticky ju znova neposielam. Prijatie musí overiť servis.",
    failed: "Žiadosť sa nepodarilo odoslať. Môžete to skúsiť znova.",
    review: "Skontrolujte prosím žiadosť:",
    send: "Mám túto žiadosť odoslať servisu?",
    unconfirmed: "Termín potvrdí pracovník servisu.",
    labels: [
      "Požiadavka",
      "Vozidlo",
      "Motor",
      "Nájazd",
      "Popis",
      "Diely",
      "Preferovaný termín",
      "Meno",
      "Telefón",
      "E-mail",
    ],
    parts: [
      "vlastné diely zákazníka",
      "diely zabezpečí servis",
      "nie je potrebné / neupresnené",
    ],
  },
  de: {
    sent: "Ihre Anfrage wurde an die Werkstatt gesendet. Der Termin ist noch nicht bestätigt; die Werkstatt meldet sich bei Ihnen.",
    statusSent:
      "Ja, Ihre Anfrage wurde an die Werkstatt gesendet. Der Termin ist noch nicht bestätigt.",
    notSent:
      "Diese Anfrage wurde noch nicht gesendet. Es wurde kein Termin reserviert.",
    unknown:
      "Der Versandstatus lässt sich nicht bestätigen. Um Duplikate zu vermeiden, sende ich nicht automatisch erneut. Die Werkstatt muss den Eingang prüfen.",
    failed:
      "Die Anfrage konnte nicht gesendet werden. Sie können es erneut versuchen.",
    review: "Bitte prüfen Sie Ihre Anfrage:",
    send: "Darf ich diese Anfrage an die Werkstatt senden?",
    unconfirmed: "Die Werkstatt bestätigt den Termin.",
    labels: [
      "Anfrage",
      "Fahrzeug",
      "Motor",
      "Kilometerstand",
      "Beschreibung",
      "Teile",
      "Wunschtermin",
      "Name",
      "Telefon",
      "E-Mail",
    ],
    parts: [
      "eigene Teile",
      "Teile von der Werkstatt",
      "nicht erforderlich / nicht angegeben",
    ],
  },
};
const updatedDraftNotSent = {
  cs: "Původní žádost už byla odeslána servisu. Změny v aktuální žádosti zatím odeslané nejsou; termín není potvrzen.",
  sk: "Pôvodná žiadosť už bola odoslaná servisu. Zmeny v aktuálnej žiadosti zatiaľ odoslané nie sú; termín nie je potvrdený.",
  en: "The original request was sent to the service centre. The changes in the current request have not been sent yet; the appointment is not confirmed.",
  ru: "Первоначальная заявка уже отправлена в автосервис. Изменения в текущей заявке пока не отправлены; дата не подтверждена.",
  uk: "Початкову заявку вже надіслано до автосервісу. Зміни в поточній заявці ще не надіслано; дату не підтверджено.",
  de: "Die ursprüngliche Anfrage wurde bereits an die Werkstatt gesendet. Die Änderungen in der aktuellen Anfrage wurden noch nicht gesendet; der Termin ist nicht bestätigt.",
};
const errorKeys = [
  'invalidMessage','invalidConfirmation','invalidMessageId','staleConversation','reusedMessageId',
  'invalidJson','bodyTooLarge','unsupportedEncoding','invalidBody','timeout','requestFailed','crossOrigin',
  'connectionFailed','unreadableReply','restoreFailed','interrupted',
];
const errorTranslations = {
  cs: [
    'Zadejte zprávu o délce 1 až 1000 znaků.','Neplatné potvrzení žádosti.','Neplatný identifikátor zprávy.',
    'Rozhovor se změnil. Obnovte prosím stránku.','Identifikátor zprávy již byl použit.','Neplatný JSON.',
    'Zpráva je příliš dlouhá.','Nepodporované kódování požadavku.','Neplatné tělo požadavku.',
    'Odpověď trvá příliš dlouho. Zkuste to prosím znovu.','Požadavek se nepodařilo zpracovat. Zkuste to prosím znovu.',
    'Požadavek z jiné stránky není povolen.','Nepodařilo se připojit k serveru. Zkuste to prosím později.',
    'Odpověď se nepodařilo načíst. Zkuste to prosím znovu.','Nepodařilo se obnovit rozhovor. Zkuste to znovu.',
    'Odpověď byla přerušena obnovením stránky. Odešlete zprávu prosím znovu.',
  ],
  en: [
    'Enter a message between 1 and 1000 characters.','Invalid request confirmation.','Invalid message identifier.',
    'The conversation has changed. Please reload the page.','This message identifier has already been used.','Invalid JSON.',
    'The message is too long.','Unsupported request encoding.','Invalid request body.',
    'The response is taking too long. Please try again.','The request could not be processed. Please try again.',
    'Requests from another website are not allowed.','Could not connect to the server. Please try again later.',
    'Could not read the response. Please try again.','Could not restore the conversation. Please try again.',
    'The response was interrupted by reloading the page. Please send the message again.',
  ],
  ru: [
    'Введите сообщение длиной от 1 до 1000 символов.','Недействительное подтверждение заявки.','Недействительный идентификатор сообщения.',
    'Разговор изменился. Обновите страницу.','Этот идентификатор сообщения уже использован.','Некорректный JSON.',
    'Сообщение слишком длинное.','Неподдерживаемая кодировка запроса.','Некорректное содержимое запроса.',
    'Ответ занимает слишком много времени. Попробуйте ещё раз.','Не удалось обработать запрос. Попробуйте ещё раз.',
    'Запросы с другого сайта запрещены.','Не удалось подключиться к серверу. Попробуйте позже.',
    'Не удалось прочитать ответ. Попробуйте ещё раз.','Не удалось восстановить разговор. Попробуйте ещё раз.',
    'Обновление страницы прервало получение ответа. Отправьте сообщение ещё раз.',
  ],
  uk: [
    'Введіть повідомлення довжиною від 1 до 1000 символів.','Недійсне підтвердження заявки.','Недійсний ідентифікатор повідомлення.',
    'Розмову змінено. Оновіть сторінку.','Цей ідентифікатор повідомлення вже використано.','Некоректний JSON.',
    'Повідомлення надто довге.','Непідтримуване кодування запиту.','Некоректний вміст запиту.',
    'Відповідь займає надто багато часу. Спробуйте ще раз.','Не вдалося обробити запит. Спробуйте ще раз.',
    'Запити з іншого сайту заборонені.','Не вдалося підключитися до сервера. Спробуйте пізніше.',
    'Не вдалося прочитати відповідь. Спробуйте ще раз.','Не вдалося відновити розмову. Спробуйте ще раз.',
    'Оновлення сторінки перервало отримання відповіді. Надішліть повідомлення ще раз.',
  ],
  sk: [
    'Zadajte správu s dĺžkou 1 až 1000 znakov.','Neplatné potvrdenie žiadosti.','Neplatný identifikátor správy.',
    'Rozhovor sa zmenil. Obnovte prosím stránku.','Tento identifikátor správy už bol použitý.','Neplatný JSON.',
    'Správa je príliš dlhá.','Nepodporované kódovanie požiadavky.','Neplatné telo požiadavky.',
    'Odpoveď trvá príliš dlho. Skúste to prosím znova.','Požiadavku sa nepodarilo spracovať. Skúste to prosím znova.',
    'Požiadavky z inej stránky nie sú povolené.','Nepodarilo sa pripojiť k serveru. Skúste to prosím neskôr.',
    'Odpoveď sa nepodarilo načítať. Skúste to prosím znova.','Nepodarilo sa obnoviť rozhovor. Skúste to znova.',
    'Obnovenie stránky prerušilo načítanie odpovede. Odošlite správu prosím znova.',
  ],
  de: [
    'Geben Sie eine Nachricht mit 1 bis 1000 Zeichen ein.','Ungültige Bestätigung der Anfrage.','Ungültige Nachrichtenkennung.',
    'Das Gespräch wurde geändert. Bitte laden Sie die Seite neu.','Diese Nachrichtenkennung wurde bereits verwendet.','Ungültiges JSON.',
    'Die Nachricht ist zu lang.','Nicht unterstützte Anfragekodierung.','Ungültiger Anfrageinhalt.',
    'Die Antwort dauert zu lange. Bitte versuchen Sie es erneut.','Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.',
    'Anfragen von einer anderen Website sind nicht erlaubt.','Keine Verbindung zum Server. Bitte versuchen Sie es später erneut.',
    'Die Antwort konnte nicht gelesen werden. Bitte versuchen Sie es erneut.','Das Gespräch konnte nicht wiederhergestellt werden. Bitte versuchen Sie es erneut.',
    'Das Neuladen der Seite hat die Antwort unterbrochen. Bitte senden Sie die Nachricht erneut.',
  ],
};
const missingCommonTranslations = {
  uk: {busy:'Попереднє повідомлення ще обробляється. Зачекайте трохи.',limit:'Забагато запитів. Спробуйте пізніше.',unavailable:'Асистент тимчасово недоступний. Спробуйте пізніше.',refusal:'З цим запитом я не можу допомогти. Можна поставити інше запитання.'},
  sk: {busy:'Predchádzajúca správa sa ešte spracováva. Chvíľu počkajte.',limit:'Príliš veľa požiadaviek. Skúste to prosím neskôr.',unavailable:'Asistent je dočasne nedostupný. Skúste to prosím neskôr.',refusal:'S touto požiadavkou Vám nemôžem pomôcť. Môžete sa opýtať na niečo iné.'},
  de: {busy:'Ihre vorherige Nachricht wird noch verarbeitet. Bitte warten Sie kurz.',limit:'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',unavailable:'Der Assistent ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',refusal:'Bei dieser Anfrage kann ich Ihnen nicht helfen. Sie können eine andere Frage stellen.'},
};
export function messages(language = "cs") {
  return {
    ...texts.en,
    ...texts[language],
    ...missingCommonTranslations[language],
    ...Object.fromEntries(errorKeys.map((key,index)=>[key,(errorTranslations[language]??errorTranslations.en)[index]])),
    updatedDraftNotSent: updatedDraftNotSent[language] ?? updatedDraftNotSent.en,
  };
}
export function clientMessages(language) {
  const t=messages(language);
  return Object.fromEntries(['invalidMessage','timeout','requestFailed','connectionFailed','unreadableReply','restoreFailed','interrupted','unavailable'].map(key=>[key,t[key]]));
}
