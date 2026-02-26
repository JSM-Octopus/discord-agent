import { OpenAI } from "openai";
import { Client as DiscordClient } from 'discord.js-selfbot-v13';
import pkg from 'whatsapp-web.js';
const { Client: WAClient, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import 'dotenv/config';
import nodemailer from 'nodemailer';

// Importy Twoich serwisów
import { WhatsAppService } from './whatsapp.service.js';
import { ParserService } from './parser.service.js';
import { OctopusService } from './octopus.service.js';

async function bootstrap() {
    const {
        DISCORD_TOKEN,
        OPENAI_API,
        OCTOPUS_URL,
        MY_WHATSAPP_NUMBER,
        BREVO
    } = process.env;

    if (!DISCORD_TOKEN || !OPENAI_API || !OCTOPUS_URL || !BREVO) {
        throw new Error("Brak wymaganych zmiennych w .env");
    }

    const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false, // true dla portu 465, false dla innych
        auth: {
            user: 'michal.s.limeacademy@gmail.com',
            pass: process.env.BREVO,
        },
    });

    const sendEmail = async (transporter: {
        sendMail: (arg0: {
            from: string; // default from
            to: any; subject: any; text: any; html: any;
        }) => any;
    }, to: any, subject: any, text: any, html: any) => {
        const mailOptions = {
            from: '"DISCORD" <michal.s.limeacademy@gmail.com>', // default from
            to,
            subject,
            text,
            html,
        };

        try {
            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Email wysłany: %s', info.messageId);
            return info;
        } catch (error) {
            console.error('❌ Błąd wysyłki maila:', error);
            throw error;
        }
    };

    // 1. Inicjalizacja instancji
    const openai = new OpenAI({ apiKey: OPENAI_API });
    const discordClient = new DiscordClient({ checkUpdate: false } as any);
    const waClient = new WAClient({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // KRYTYCZNE: zapobiega crashom Chrome w kontenerze
                '--disable-gpu'            // Oszczędza zasoby procesora na serwerze
            ]
        }
    });

    // 2. Inicjalizacja serwisów
    const waService = new WhatsAppService(waClient);
    const parser = new ParserService(openai);
    const octopus = new OctopusService(OCTOPUS_URL);

    // 3. Mapa do korelacji sygnałów (ID wiadomości -> Dane pozycji)
    // Zamiast modyfikować obiekt message, trzymamy dane tutaj.
    const activePositions = new Map<string, { coin: string; commonId: string }>();

    // Konfiguracja kanałów
    const CHANNELS = {
        DZIK: '1120791815315001477',
        OGOLNY: '1033122700731887758',
        PATRON: '1459523380452655214',
        KRYPTO: '1033122726967263353'
    };

    const TARGET_WA = MY_WHATSAPP_NUMBER || "48601926367";

    sendEmail(transporter, 'michal.s.limeacademy@gmail.com', 'Octopus Notifier restarted!', '', undefined);

    // --- WHATSAPP SETUP ---
    waClient.on('qr', (qr) => qrcode.generate(qr, { small: true }));
    waClient.on('ready', () => {
        waService.sendMessage(
            TARGET_WA,
            `⚠️ Octopus Notifier restarted!`
        ).catch(() => {
            console.error('Bład przy wysylce whatsapp');
        })
        console.log('✅ WhatsApp gotowy');
    });

    waClient.on('disconnected', () => {
        sendEmail(transporter, 'michal.s.limeacademy@gmail.com', 'Whatsapp disconnected!', '', undefined);
    });

    // --- DISCORD SETUP ---
    discordClient.on('ready', () => console.log(`✅ Discord zalogowany: ${discordClient.user?.tag}`));

    discordClient.on('messageCreate', async (message) => {
        try {
            // SCENARIUSZ A: Sygnały tradingowe na kanale DZIK
            if (message.channel.id === CHANNELS.DZIK) {
                let fullText = '';
                if (message.embeds.length > 0) {
                    const e = message.embeds[0];
                    fullText += ` | Title: ${e?.title} | Desc: ${e?.description || ''}`;
                    e?.fields.forEach(f => fullText += ` | ${f.name}: ${f.value}`);
                }

                const result = await parser.parseSignal(fullText);

                if (result.action === 'OPEN') {
                    const commonId = await octopus.executeNewOrder(result);

                    // Zapisujemy w mapie pod ID wiadomości z Discorda
                    activePositions.set(message.id, {
                        coin: result.coin,
                        commonId
                    });

                    const body = `🚀 *OPEN* | ${result.coin}\nID: ${commonId}`
                    await waService.sendMessage(TARGET_WA, body).catch(() => {
                        sendEmail(transporter, 'michal.s.limeacademy@gmail.com', '[Otwarcie pozycji] Wysyłka przez Whatsapp nie powiodla sie!', body, undefined);
                    });
                }
                else if (['CLOSE_PARTIALLY', 'STOP_LOSS', 'CLOSE'].includes(result.action)) {
                    // Sprawdzamy, czy ta wiadomość jest odpowiedzią na sygnał otwarcia
                    const refId = message.reference?.messageId;
                    const position = refId ? activePositions.get(refId) : null;

                    if (position) {
                        await octopus.handleExistingPosition(
                            result.action,
                            position.coin,
                            position.commonId,
                            result.value
                        );

                        const body = `⚡ *UPDATE* | ${result.action} dla ${position.coin}\nID: ${position.commonId}`;
                        await waService.sendMessage(TARGET_WA, body).catch(() => {
                            sendEmail(transporter, 'michal.s.limeacademy@gmail.com', '[Update pozycji] Wysyłka przez Whatsapp nie powiodla sie!', body, undefined);
                        });
                    }
                }
            }

            // SCENARIUSZ B: Narzekania i szukanie klientów na innych kanałach
            else if (message.channel.id === CHANNELS.OGOLNY || message.channel.id === CHANNELS.KRYPTO || message.channel.id === CHANNELS.PATRON) {
                const complain = await parser.lookForComplains(message.cleanContent);

                if (complain.action === 'CALL') {
                    console.log('Ktoś narzeka: ' + message.cleanContent);
                    const body = `⚠️ *POTENCJALNY KLIENT*\nUżytkownik: ${message.author.tag}\nWiadomość: ${message.cleanContent}\nPowód: ${complain.reasoning}`;
                    await waService.sendMessage(
                        TARGET_WA,
                        body
                    ).catch(() => {
                        sendEmail(transporter, 'michal.s.limeacademy@gmail.com', '[Ktos narzeka] Wysyłka przez Whatsapp nie powiodla sie!', body, undefined);
                    });
                } else {
                    console.log('Nic waznego: ' + message.cleanContent);
                }
            }

        } catch (err: any) {
            console.error("❌ Błąd procesowania wiadomości:", err.message);
        }
    });

    waClient.initialize();
    discordClient.login(DISCORD_TOKEN);
}

bootstrap().catch(console.error);