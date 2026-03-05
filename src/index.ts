import { OpenAI } from "openai";
import { Client as DiscordClient } from 'discord.js-selfbot-v13';
import pkg from 'whatsapp-web.js';
const { Client: WAClient, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import 'dotenv/config';
import nodemailer from 'nodemailer';

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

    const xMachineIds = ['XDRLQO', 'YJZCPI'];

    if (!DISCORD_TOKEN || !OPENAI_API || !OCTOPUS_URL || !BREVO) {
        throw new Error("Brak wymaganych zmiennych w .env");
    }

    const transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
            user: 'michal.s.limeacademy@gmail.com',
            pass: process.env.BREVO,
        },
    });

    const sendEmail = async (transporter: any, to: string, subject: string, text: string, html?: string) => {
        const mailOptions = {
            from: '"DISCORD" <michal.s.limeacademy@gmail.com>',
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

    const openai = new OpenAI({ apiKey: OPENAI_API });
    const discordClient = new DiscordClient({ checkUpdate: false } as any);
    const waClient = new WAClient({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        }
    });

    const waService = new WhatsAppService(waClient);
    const parser = new ParserService(openai);
    const octopus = new OctopusService(OCTOPUS_URL);

    // Zmieniona struktura Mapy: ID wiadomości -> { moneta, tablica par {maszyna, commonId} }
    const activePositions = new Map<string, { 
        coin: string; 
        placements: { xMachineId: string; commonId: string }[] 
    }>();

    const CHANNELS = {
        DZIK: '1120791815315001477',
        OGOLNY: '1033122700731887758',
        PATRON: '1459523380452655214',
        KRYPTO: '1033122726967263353'
    };

    const TARGET_WA = MY_WHATSAPP_NUMBER || "48601926367";

    sendEmail(transporter, 'michal.s.limeacademy@gmail.com', 'Octopus Notifier restarted!', '', undefined);

    waClient.on('qr', (qr) => qrcode.generate(qr, { small: true }));
    waClient.on('ready', () => {
        waService.sendMessage(TARGET_WA, `⚠️ Octopus Notifier restarted!`).catch(console.error);
        console.log('✅ WhatsApp gotowy');
    });

    discordClient.on('ready', () => console.log(`✅ Discord zalogowany: ${discordClient.user?.tag}`));

    discordClient.on('messageCreate', async (message) => {
        try {
            if (message.channel.id === CHANNELS.DZIK) {
                let fullText = '';
                if (message.embeds.length > 0) {
                    const e = message.embeds[0];
                    fullText += ` | Title: ${e?.title} | Desc: ${e?.description || ''}`;
                    e?.fields.forEach(f => fullText += ` | ${f.name}: ${f.value}`);
                }

                const result = await parser.parseSignal(fullText);

                if (result.action === 'OPEN') {
                    const placements: { xMachineId: string; commonId: string }[] = [];

                    // Otwieramy pozycję na każdej maszynie
                    for (const xMachineId of xMachineIds) {
                        try {
                            const commonId = await octopus.executeNewOrder(result, xMachineId);
                            placements.push({ xMachineId, commonId });

                            const body = `🚀 *OPEN* | ${result.coin}\nID: ${commonId}\nMachine: ${xMachineId}`;
                            await waService.sendMessage(TARGET_WA, body);
                        } catch (err) {
                            console.error(`Błąd otwierania dla ${xMachineId}:`, err);
                        }
                    }

                    if (placements.length > 0) {
                        activePositions.set(message.id, {
                            coin: result.coin,
                            placements
                        });
                    }
                }
                else if (['CLOSE_PARTIALLY', 'STOP_LOSS', 'CLOSE'].includes(result.action)) {
                    const refId = message.reference?.messageId;
                    const position = refId ? activePositions.get(refId) : null;

                    if (position) {
                        // Aktualizujemy pozycję na wszystkich maszynach, które ją otworzyły
                        for (const placement of position.placements) {
                            try {
                                await octopus.handleExistingPosition(
                                    result.action as any,
                                    position.coin,
                                    placement.commonId,
                                    placement.xMachineId,
                                    result.value
                                );

                                const body = `⚡ *UPDATE* | ${result.action} dla ${position.coin}\nID: ${placement.commonId}\nMachine: ${placement.xMachineId}`;
                                await waService.sendMessage(TARGET_WA, body);
                            } catch (err) {
                                console.error(`Błąd update dla ${placement.xMachineId}:`, err);
                            }
                        }
                    }
                }
            }
            else if ([CHANNELS.OGOLNY, CHANNELS.KRYPTO, CHANNELS.PATRON].includes(message.channel.id)) {
                const complain = await parser.lookForComplains(message.cleanContent);
                if (complain.action === 'CALL') {
                    const body = `⚠️ *POTENCJALNY KLIENT*\nUżytkownik: ${message.author.tag}\nWiadomość: ${message.cleanContent}\nPowód: ${complain.reasoning}`;
                    await waService.sendMessage(TARGET_WA, body).catch(() => {
                        sendEmail(transporter, 'michal.s.limeacademy@gmail.com', '[Ktos narzeka] WhatsApp fail!', body);
                    });
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