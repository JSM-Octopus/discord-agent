export class WhatsAppService {
    /**
     * Konstruktor przyjmuje zainicjalizowanego klienta WhatsApp.
     */
    constructor(private client: any) { }

    /**
     * Wysyła wiadomość tekstową do określonego numeru.
     * @param to Numer telefonu (np. "48601926367")
     * @param body Treść wiadomości
     */
    public async sendMessage(to: string, body: string): Promise<void> {
        try {
            // Dodanie sufiksu WhatsApp, jeśli użytkownik podał sam numer
            const chatId = to.includes('@c.us') ? to : `${to}@c.us`;

            await this.client.sendMessage(chatId, body);
            
            console.log(`[WhatsApp] Wiadomość wysłana pomyślnie do: ${to}`);
        } catch (err: any) {
            console.error(`[WhatsApp] Błąd podczas wysyłania do ${to}:`, err.message);
            // Nie rzucamy błędu dalej, aby nie przerywać pętli głównej bota
        }
    }

    /**
     * Opcjonalna metoda do sprawdzania, czy numer jest zarejestrowany w WhatsApp
     */
    public async isRegistered(number: string): Promise<boolean> {
        try {
            const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
            return await this.client.isRegisteredUser(chatId);
        } catch {
            return false;
        }
    }
}