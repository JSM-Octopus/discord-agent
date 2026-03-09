import { ParserService } from '../src/parser.service.js';
import { OpenAI } from 'openai';
import 'dotenv/config';

describe('ParserService - Real API Integration Tests', () => {
    let service: ParserService;
    let openai: OpenAI;

    beforeAll(() => {
        const apiKey = process.env.OPENAI_API;
        if (!apiKey) {
            throw new Error("Brak klucza OPENAI_API w pliku .env");
        }

        openai = new OpenAI({ apiKey });
        service = new ParserService(openai);
    });

    test('test6 - embed (BTC Short)', async () => {
        const message = "OTWIERAM POZYCJĘ • SHORT BTCUSDT; Trader: Krypto_Dzik; Instrument: BTCUSDT; Wejście: 67846.11; Wielkość kapitału: 1–3% max; Info: Za chwilę zostaną podane poziomy SL / TP; Dźwignia: 5x; ROI: +0.43%;";
        
        const result = await service.parseSignal(message);

        try {
            expect(result.coin).toBe("BTC");
            expect(result.leverage).toBe(5);
            expect(result.side).toBe("SELL");
            expect(result.entryPrice).toBe(67846.11);
            // Logika promptu: BTC = 20, ale w tekście jest "1-3%". 
            // Jeśli model trzyma się sztywno instrukcji "DLA BTC = 20", wynik powinien być 20.
            expect(result.percentage).toBe(20); 
        } catch (error) {
            console.log("Reasoning for failed test:", result.reasoning);
            throw error;
        }
    });

    test('test7 - embed2 (LTC Short)', async () => {
        const message = "OTWIERAM POZYCJĘ • SHORT LTCUSDT; Trader: Krypto_Dzik; Instrument: LTCUSDT; Wielkość kapitału: 1–3% max; Info: Za chwilę zostaną podane poziomy SL / TP; Dźwignia: 15x; ROI: +0.43%;";
        
        const result = await service.parseSignal(message);

        try {
            expect(result.coin).toBe("LTC");
            expect(result.leverage).toBe(15);
            expect(result.side).toBe("SELL");
            expect(result.entryPrice).toBeNull();
            expect(result.percentage).toBe(1); // Inne = 1
        } catch (error) {
            console.log("Reasoning for failed test:", result.reasoning);
            throw error;
        }
    });

    test('test7 - zamykam 25%', async () => {
        const message = " % TP**Zamykam:** 25%; ; Część pozycji została zamknięta i zysk z tego fragmentu został już zrealizowany. Pozostała część pozycji nadal pracuje zgodnie z planem.; ; Użytkownik: <@831919307977130024>";
        
        const result = await service.parseSignal(message);

        try {
            expect(result.action).toBe("CLOSE_PARTIALLY");
            expect(Number(result.value)).toBe(25);
        } catch (error) {
            console.log("Reasoning for failed test:", result.reasoning);
            throw error;
        }
    });

    test('test7 - stop loss na BE', async () => {
        const message = "  BE**BE:** 66964.41; ; Pozycja została zabezpieczona. Od tego momentu transakcja nie powinna już przynieść straty — w najgorszym scenariuszu zakończy się na zero.; ; Autor: <@831919307977130024>";
        
        const result = await service.parseSignal(message);

        try {
            expect(result.action).toBe("STOP_LOSS");
            expect(Number(result.value)).toBe(66964.41);
        } catch (error) {
            console.log("Reasoning for failed test:", result.reasoning);
            throw error;
        }
    });

    test('test7 - ustawienie SL', async () => {
        const message = "Aktualizacja**SL:** 68000; ; Zostały podane poziomy zabezpieczenia (SL) oraz realizacji zysku (TP). To są orientacyjne punkty, w których pozycja może zostać zamknięta automatycznie lub ręcznie.; ; Autor: <@831919307977130024>";
        
        const result = await service.parseSignal(message);

        try {
            expect(result.action).toBe("STOP_LOSS");
            expect(Number(result.value)).toBe(68000);
        } catch (error) {
            console.log("Reasoning for failed test:", result.reasoning);
            throw error;
        }
    });

    test('test7 - pozycja zamknięta', async () => {
        const message = "Pozycja zamkniętaSygnał zamknięty w całości (100%) przez <@831919307977130024>; ; Cała pozycja została zamknięta. Ten sygnał jest zakończony i nie będzie już dalej aktualizowany.";
        
        const result = await service.parseSignal(message);

        try {
            expect(result.action).toBe("CLOSE");
        } catch (error) {
            console.log("Reasoning for failed test:", result.reasoning);
            throw error;
        }
    });
});