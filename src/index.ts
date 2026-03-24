import { OpenAI } from "openai";
import { Client as DiscordClient } from 'discord.js-selfbot-v13';
import qrcode from 'qrcode-terminal';
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { ParserService } from './parser.service.js';
import { OctopusService } from './octopus.service.js';
import { RabbitMotokoActor } from "./npm-package-rabbit-motoko/rabbit-motoko-actor.js";

async function bootstrap() {
    const rabbitMotokoActor = new RabbitMotokoActor();

    const {
        DISCORD_TOKEN,
        OPENAI_API,
        OCTOPUS_URL,
        MY_WHATSAPP_NUMBER,
        BREVO
    } = process.env;

    const xMachineIds: string[] = [];

    // xMachineIds.push('YJZCPI'); // inspiredByDzik
    xMachineIds.push('XDRLQO'); // inspiredBySliwa (to tylko nazwa maszyny, tak naprawde oba sa na dziku w tym kodzie)

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

    const welcomeText = 'Octopus Notifier restarted!';

    rabbitMotokoActor.addTask({
        channel: "1",
        payload: welcomeText
    }).catch(() => {
        sendEmail(transporter, 'michal.s.limeacademy@gmail.com', welcomeText, '', undefined);
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
                    // Wysyłamy wszystkie zapytania jednocześnie
                    const results = await Promise.allSettled(
                        xMachineIds.map(async (xMachineId) => {
                            const commonId = await octopus.executeNewOrder(result, xMachineId);
                            return { xMachineId, commonId };
                        })
                    );

                    const successfulPlacements: { xMachineId: string; commonId: string }[] = [];

                    // Iterujemy po wynikach, aby obsłużyć sukcesy i błędy
                    results.forEach((res, index) => {
                        if (res.status === 'fulfilled') {
                            const data = res.value;
                            successfulPlacements.push(data);

                            // Powiadomienie WA wysyłane w tle
                            const body = `🚀 *OPEN* | ${result.coin}\nID: ${data.commonId}\nMachine: ${data.xMachineId}`;

                            rabbitMotokoActor.addTask({
                                channel: "1",
                                payload: body
                            }).catch(() => {
                                sendEmail(transporter, 'michal.s.limeacademy@gmail.com', '[Open] WhatsApp fail!', body);
                            });
                        } else {
                            // Tutaj masz dostęp do powodu błędu: res.reason
                            console.error(`❌ Maszyna ${xMachineIds[index]} zawiodła:`, res.reason?.message || res.reason);
                        }
                    });

                    if (successfulPlacements.length > 0) {
                        activePositions.set(message.id, {
                            coin: result.coin,
                            placements: successfulPlacements
                        });
                    }
                } else if (['CLOSE_PARTIALLY', 'STOP_LOSS', 'CLOSE'].includes(result.action)) {
                    const refId = message.reference?.messageId;
                    const position = refId ? activePositions.get(refId) : null;

                    if (position) {
                        // Równoległy update wszystkich maszyn
                        const updateResults = await Promise.allSettled(
                            position.placements.map(async (placement) => {
                                await octopus.handleExistingPosition(
                                    result.action as any,
                                    position.coin,
                                    placement.commonId,
                                    placement.xMachineId,
                                    result.value
                                );
                                return placement;
                            })
                        );

                        updateResults.forEach((res, index) => {
                            const placement = position.placements[index];
                            if (res.status === 'fulfilled') {
                                const body = `⚡ *UPDATE* | ${result.action} | ${position.coin}\nMachine: ${placement?.xMachineId}`;
                                rabbitMotokoActor.addTask({
                                    channel: "1",
                                    payload: body
                                }).catch(() => {
                                    sendEmail(transporter, 'michal.s.limeacademy@gmail.com', '[Update] WhatsApp fail!', body);
                                });
                            } else {
                                console.error(`❌ Błąd update dla ${placement?.xMachineId}:`, res.reason);
                            }
                        });
                    }
                }
            }
            else if ([CHANNELS.OGOLNY, CHANNELS.KRYPTO, CHANNELS.PATRON].includes(message.channel.id)) {
                const complain = await parser.lookForComplains(message.cleanContent);
                console.log(message.cleanContent);
                if (complain.action === 'CALL') {
                    const body = `⚠️ *POTENCJALNY KLIENT*\nUżytkownik: ${message.author.tag}\nWiadomość: ${message.cleanContent}\nPowód: ${complain.reasoning}`;
                    rabbitMotokoActor.addTask({
                        channel: "1",
                        payload: body
                    }).catch(() => {
                        sendEmail(transporter, 'michal.s.limeacademy@gmail.com', '[Ktos narzeka] WhatsApp fail!', body);
                    });
                }
            }
        } catch (err: any) {
            console.error("❌ Błąd procesowania wiadomości:", err.message);
        }
    });

    discordClient.login(DISCORD_TOKEN);
}

bootstrap().catch(console.error);