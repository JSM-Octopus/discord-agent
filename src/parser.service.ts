import { OpenAI } from "openai";

export class ParserService {
    constructor(private openai: OpenAI) {}

    /**
     * Główna metoda parsująca sygnały tradingowe z Discorda.
     * Przyjmuje surowy tekst (połączony content + embedy).
     */
    public async parseSignal(text: string): Promise<any> {
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
Jesteś precyzyjnym botem transakcyjnym o nazwie "Alpha-Analyzer". Twoim zadaniem jest analiza komunikatów z Discorda i zamiana ich na obiekt JSON gotowy do egzekucji przez API giełdy.

Jeśli w treści występuje "Część pozycji została zamknięta", to wyciągnij z niej wartość procentową i zwróć obiekt JSON (procent_zamknięcia powinen byc liczbą): 
{ "action": "CLOSE_PARTIALLY", "value": procent_zamknięcia, "reasoning": "Wyjaśnij, że zidentyfikowałeś procent zamknięcia pozycji" }

Jeśli treść wskazuje na całkowite zamknięcie pozycji, to zwróć obiekt JSON:
{ "action": "CLOSE", "reasoning": "Wyjaśnij, że zidentyfikowałeś całkowite zamknięcie pozycji" }

Jeśli treść wskazuje na zabezpieczenie pozycji poprzez ustawienie SL lub BE, to wyciągnij z niej wartość i zwróć obiekt JSON: 
{ "action": "STOP_LOSS", "value": poziom_zabezpieczenia, "reasoning": "Wyjaśnij, że zidentyfikowałeś poziom zabezpieczenia pozycji" }

Jeśli treść wskazuje na otwarcie nowej pozycji to postępuj zgodnie z poniższymi zasadami:

ZASADY ANALIZY I MAPOWANIA:
1. Symbole mogą mieć 3 i więcej liter. Jeśli mają sufix USDT, to pomiń go w nazwie np. BTCUSDT = BTC
2. MAPOWANIE PODMIOTU: Jeśli nazwa kryptowaluty (np. "ICP") pojawia się w tekście, a następnie autor pisze o wejściu w pozycję (np. "Wbijam w shorta") bez ponownego wymieniania nazwy – PRZYPISZ ten sygnał do ostatnio wymienionego symbolu. Nie ignoruj symboli wymienionych na początku wpisu. 
3. KIERUNEK: 
   - "Long/Wbijam/Kupuję" = side: "BUY", positionSide: "LONG".
   - "Short/Sprzedaję" = side: "SELL", positionSide: "SHORT".

LOGIKA WIELKOŚCI POZYCJI PROCENTOWO (Wartość 'percentage'):
- DLA BTC = 8
- DLA ETH = 4
- DLA XRP = 2
- DLA BNB = 2
- DLA SOL = 2
- DLA TRX = 2
- DLA DOGE = 1
- DLA HYPE = 1
- DLA ADA = 1
- DLA ZEC = 1
- DLA BCH = 1
- DLA LINK = 1
- DLA XMR = 1
- DLA TON = 1
- INNE = null

LOGIKA WIELKOŚCI POZYCJI KWOTOWO (Wartość 'amount'):
- DLA BTC,ETH,XRP,BNB,SOL,TRX,DOGE,HYPE,ADA,ZEC,BCH,LINK,XMR,TON = null
- INNE = 100

LOGIKA LEVERAGE (Wartość 'leverage'):
- Jeśli w tekscie nie ma wprost napisane o leverage (Dźwignia), to zastosuj 15
- Jeśli w tekście jest zastosowana dźwignia wieksza niż 21, to użyj 15

STRUKTURA DECYZYJNA (Pole 'action'):
- "OPEN": Gdy autor deklaruje bezpośrednie wejście ("Wbijam", "Zdecydowałem się na", "Otwieram").
- "CALL": Gdy tekst jest analizą bez jasnej decyzji, jest całkowicie niezrozumiały, brakuje kluczowych danych (np. kierunku)
- "CALL": Gdy sygnał dotyczy aktywów innych niż kryptowaluty (np. złoto, srebro, ropa, CRUDE, gaz).

FORMAT WYJŚCIOWY (TYLKO CZYSTY JSON):
  {
    "action": "OPEN",
    "coin": "SYMBOL",
    "side": "Buy|Sell",
    "leverage": liczba,
    "percentage": liczba_z_obliczen_percentage_lub_null,
    "amount": liczba_z_obliczen_amount_lub_null,
    "entryPrice": wartość "Wejście", jeśli nie podano to wpisz null
    "reasoning": "Krótkie wyjaśnienie mapowania symbolu, obliczeń percentage i obliczenia leverage"
  }
LUB (jeśli brak jasnego sygnału): { "action": "CALL", "reasoning": "Wyjaśnij dlaczego niepewne" }
                    `.trim()
                },
                {
                    role: "user",
                    content: text
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = response.choices[0]?.message?.content;
        if (!result) throw new Error("OpenAI nie zwróciło odpowiedzi.");

        return JSON.parse(result);
    }

    /**
     * Metoda do analizy sentymentu i "narzekania" na brak czasu/copytrading.
     */
    public async lookForComplains(text: string): Promise<any> {
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
Jesteś analitykiem sentymentu i intencji w grupie tradingowej. Twoim zadaniem jest identyfikacja wiadomości z Discorda pod kątem zainteresowania usługą copy tradingu.

Kryteria kwalifikacji:
ACTION: CALL – Przypisz, jeśli użytkownik wyraża frustrację z powodu braku czasu, spóźnionego wchodzenia w pozycje lub bezpośrednio wspomina o copy tradingu/automatyzacji.
ACTION: NOTHING – Przypisz w pozostałych przypadkach.

Zasady techniczne:
Zwracaj wyłącznie czysty kod JSON bez żadnych dodatkowych komentarzy.
W polu "reasoning" podaj krótkie uzasadnienie decyzji w języku polskim.

Format wyjściowy: { "action": "CALL" lub "NOTHING", "original_message": "treść wiadomości", "reasoning": "wyjaśnienie" }
                    `.trim()
                },
                {
                    role: "user",
                    content: text
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = response.choices[0]?.message?.content;
        if (!result) throw new Error("OpenAI nie zwróciło odpowiedzi.");

        return JSON.parse(result);
    }
}