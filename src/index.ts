import { OpenAI } from "openai";
import { Client as DiscordClient } from 'discord.js-selfbot-v13';
import 'dotenv/config';
import { ParserService } from './parser.service.js';
import { OctopusService } from './octopus.service.js';
import { RabbitMotokoActor } from "@jsm-mit/rabbit-motoko-package";
import { getEnvVariableUnsafe, getIdentityFromPem, toJson } from "@jsm-mit/utils-package";
import { Pigeon } from "@jsm-mit/pigeon-package";

async function bootstrap() {
    const brevoPassword = getEnvVariableUnsafe(process.env.BREVO);
    const rabbitMotokoCanisterId: string = getEnvVariableUnsafe(process.env.RABBIT_MOTOKO_CANISTER_ID);
    const identityPem: string = getEnvVariableUnsafe(process.env.IDENTITY_PEM);
    const identity = getIdentityFromPem(identityPem);

    const pigeon = new Pigeon("DISCORD_AGENT", "michal.s.limeacademy@gmail.com", brevoPassword);

    pigeon.reportInfoAsyncSafe("Pigeon ready for Discord Agent!", "");

    const rabbitMotokoActor = new RabbitMotokoActor(rabbitMotokoCanisterId, identity);

    const {
        DISCORD_TOKEN,
        OPENAI_API,
        OCTOPUS_URL,
        BREVO
    } = process.env;

    const xMachineIds: string[] = [];

    // xMachineIds.push('YJZCPI'); // inspiredByDzik
    xMachineIds.push('XDRLQO'); // inspiredBySliwa (to tylko nazwa maszyny, tak naprawde oba sa na dziku w tym kodzie)

    if (!DISCORD_TOKEN || !OPENAI_API || !OCTOPUS_URL || !BREVO) {
        throw new Error("Brak wymaganych zmiennych w .env");
    }

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

    const handleError = (title: string, err: any) => {
        console.error(title);
        console.log(toJson(err));

        pigeon.reportUrgentAsyncSafe(`${title}`, toJson(err));
    }

    const welcomeText = 'Octopus Discord Agent restarted!';

    const args = {
        channel: "1",
        payload: welcomeText,
        parentIds: [] as any
    };

    rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
        handleError('Couldnt add task for Common Notifier, channel 1', err);
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
                            const args = {
                                channel: "1",
                                payload: body,
                                parentIds: [] as any
                            };

                            rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                                handleError('Couldnt add task for Common Notifier, channel 1', err);
                            });
                        } else {
                            const body = `❌ *OPEN FAILED* | ${result.coin}\nMachine: ${xMachineIds[index]}\nReason: ${res.reason?.message || res.reason}`;
                            const args = {
                                channel: "1",
                                payload: body,
                                parentIds: [] as any
                            };

                            rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                                handleError('Couldnt add task for Common Notifier, channel 1', err);
                            });
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
                                const args = {
                                    channel: "1",
                                    payload: body,
                                    parentIds: [] as any
                                };

                                rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                                    handleError('Couldnt add task for Common Notifier, channel 1', err);
                                });
                            } else {
                                const body = `❌ *UPDATE FAILED* | ${result.action} | ${position.coin}\nMachine: ${placement?.xMachineId}\nReason: ${res.reason?.message || res.reason}`;
                                const args = {
                                    channel: "1",
                                    payload: body,
                                    parentIds: [] as any
                                };

                                rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                                    handleError('Couldnt add task for Common Notifier, channel 1', err);
                                });
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
                    const args = {
                        channel: "1",
                        payload: body,
                        parentIds: [] as any
                    };

                    rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                        handleError('Couldnt add task for Common Notifier, channel 1', err);
                    });
                }
            }
        } catch (err: any) {
            const body = `❌ *ERROR PROCESSING MESSAGE*\nMessage ID: ${message.id}\nChannel: ${message.channel.id}\nReason: ${err.message || err}`;
            const args = {
                channel: "1",
                payload: body,
                parentIds: [] as any
            };

            rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                handleError('Couldnt add task for Common Notifier, channel 1', err);
            });
        }
    });

    discordClient.login(DISCORD_TOKEN);
}

bootstrap().catch(console.error);