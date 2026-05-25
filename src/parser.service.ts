import { OpenAI } from "openai";

export class ParserService {
    constructor(private openai: OpenAI) { }

    /**
     * Główna metoda parsująca sygnały tradingowe z Discorda.
     * Przyjmuje surowy tekst (połączony content + embedy).
     */
    public async parseSignal(text: string): Promise<any> {
        const results = await Promise.allSettled([
            this.getAction(text),
            this.getEntry(text),
            this.getSide(text),
            this.getTradingPair(text),
            this.getLeverage(text)
        ]);

        // Map and extract values safely, default to empty object if rejected
        const actionResult = results[0].status === 'fulfilled' ? results[0].value : {};
        const entryResult = results[1].status === 'fulfilled' ? results[1].value : {};
        const sideResult = results[2].status === 'fulfilled' ? results[2].value : {};
        const pairResult = results[3].status === 'fulfilled' ? results[3].value : {};
        const leverageResult = results[4].status === 'fulfilled' ? results[4].value : {};

        if (actionResult.action !== 'OPEN') {
            return actionResult;
        } else if (actionResult.action === 'OPEN') {
            actionResult.entryPrice = entryResult.relevant ? (entryResult.entryPrice ? Number(entryResult.entryPrice) : null) : 0;
            actionResult.side = sideResult.side;
            actionResult.coin = pairResult.coin;

            if (leverageResult.relevant) {
                if (leverageResult.leverage >= 21) {
                    actionResult.leverage = 15;
                } else {
                    actionResult.leverage = Number(leverageResult.leverage);
                }
            }

            if (actionResult.coin === "BTC") {
                actionResult.percentage = 8;
                actionResult.amount = null;
            } else if (actionResult.coin === "ETH") {
                actionResult.percentage = 4;
                actionResult.amount = null;
            } else if (["XRP", "BNB", "SOL", "TRX"].includes(actionResult.coin)) {
                actionResult.percentage = 2;
                actionResult.amount = null;
            } else if (
                [
                    "DOGE", "HYPE", "ADA", "ZEC", "BCH", "LINK", "LNK", "XMR", "TON", "ZEC", "XLM", "SUI", "LTC",
                    "AVAX", "HBAR", "NEAR", "CRO", "TAO", "DOT", "ONDO", "OKB", "SKY", "ICP", "AAVE", "POL", "KAS"
                ].includes(actionResult.coin)
            ) {
                actionResult.percentage = 1;
                actionResult.amount = null;
            } else {
                actionResult.percentage = null;
                actionResult.amount = 100;
            }

            return actionResult;
        }

        return {};
    }

    public async getAction(text: string): Promise<any> {
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
                        Jesteś precyzyjnym botem transakcyjnym o nazwie "Alpha-Analyzer". 
                        Twoim zadaniem jest wyciągniecie rodzaju akcji, ktora została podana w tekscie.
                        
                        { "action": "OPEN" } Gdy autor deklaruje bezpośrednie wejście ("Wbijam", "Zdecydowałem się na", "Otwieram").

                        Jeśli w treści występuje "Część pozycji została zamknięta", to wyciągnij z niej wartość procentową i zwróć obiekt JSON (procent_zamknięcia powinen byc liczbą): 
                        { "action": "CLOSE_PARTIALLY", "value": procent_zamknięcia }

                        Jeśli treść wskazuje na całkowite zamknięcie pozycji, to zwróć obiekt JSON:
                        { "action": "CLOSE" }

                        Jeśli treść wskazuje na zabezpieczenie pozycji poprzez ustawienie SL lub BE, to wyciągnij z niej wartość i zwróć obiekt JSON: 
                        { "action": "STOP_LOSS", "value": poziom_zabezpieczenia }

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

    public async getLeverage(text: string): Promise<any> {
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
                        Jesteś precyzyjnym botem transakcyjnym o nazwie "Alpha-Analyzer". 
                        Twoim zadaniem jest wyciągniecie ile wynosi dźwignia.
                        Jeśli treść nie wskazuje na otwarcie nowej pozycji to zwróc obiekt json { "relevant": "false" }

                        Jeśli treść wskazuje na otwarcie nowej pozycji, to postępuj wyszukaj wartość dźwigni jako liczba w tekście i zwróć json:
                        {
                            "relevant": "true",
                            "leverage": "znaleziona wartość"
                        }
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

    public async getEntry(text: string): Promise<any> {
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
                        Jesteś precyzyjnym botem transakcyjnym o nazwie "Alpha-Analyzer". 
                        Twoim zadaniem jest wyciągniecie wartości wejściowej.
                        Jeśli treść nie wskazuje na otwarcie nowej pozycji to zwróc obiekt json { "relevant": "false" }

                        Jeśli treść wskazuje na otwarcie nowej pozycji, to postępuj wyszukaj wartość wejściową w tekście i zwróć json:
                        {
                            "relevant": "true",
                            "entryPrice" "znaleziona wartość"
                        }
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

    public async getSide(text: string): Promise<any> {
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
                        Jesteś precyzyjnym botem transakcyjnym o nazwie "Alpha-Analyzer". 
                        Jeśli treść nie wskazuje na otwarcie nowej pozycji to zwróc obiekt json { "relevant": "false" }
                        Jeśli treść wskazuje na otwarcie nowej pozycji to twoim zadaniem jest wyciągniecie kierunku pozycji. 
                        SHORT = Sell
                        LONG = Buy

                        Pisz CamelCase

                        FORMAT WYJŚCIOWY (TYLKO CZYSTY JSON):
                        {
                            "side": "Kierunek",
                        }
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

    public async getTradingPair(text: string): Promise<any> {
        const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `
                        Jesteś precyzyjnym botem transakcyjnym o nazwie "Alpha-Analyzer". 
                        Twoim zadaniem jest wyciągniecie symbolu kryptowaluty do tradingu. 
                        Symbole mogą mieć 3 i więcej liter. 
                        Jeśli mają sufix USDT, to pomiń go w nazwie np. BTCUSDT = BTC.

                        FORMAT WYJŚCIOWY (TYLKO CZYSTY JSON):
                        {
                            "coin": "SYMBOL",
                        }
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