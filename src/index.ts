import { OpenAI } from "openai";
import { Client as DiscordClient } from 'discord.js-selfbot-v13';
import { ParserService } from './parser.service.js';
import { OctopusService } from './octopus.service.js';
import { RabbitMotokoActor } from "@jsm-mit/rabbit-motoko-package";
import { BetterJSON, getEnvVariableUnsafe, getIdentityFromPem } from "@jsm-mit/utils-package";
import { pigeon } from "@jsm-mit/pigeon-package";
import { WatchdogService } from "./watchdog.service.js";
import { InvestmentsMotokoActor } from "@jsm-mit/investments-motoko-package";
import { MessageSummaryService } from "./messages-summary.service.js";
import { CHANNELS, componentName } from "./globals.js";

async function bootstrap() {
    const rabbitMotokoCanisterId: string = getEnvVariableUnsafe('RABBIT_MOTOKO_CANISTER_ID');
    const investmentsMotokoCanisterId: string = getEnvVariableUnsafe('INVESTMENTS_MOTOKO_CANISTER_ID');
    const identityPem: string = getEnvVariableUnsafe('IDENTITY_PEM');
    const identity = getIdentityFromPem(identityPem);

    const rabbitMotokoActor = new RabbitMotokoActor(rabbitMotokoCanisterId, identity);

    const investmentsMotokoActor = new InvestmentsMotokoActor(investmentsMotokoCanisterId, identity);

    const DISCORD_TOKEN = getEnvVariableUnsafe('DISCORD_TOKEN');
    const OPENAI_API = getEnvVariableUnsafe('OPENAI_API');
    const OCTOPUS_URL = getEnvVariableUnsafe('OCTOPUS_URL');

    const xMachineIds: string[] = [];

    // xMachineIds.push('YJZCPI'); // inspiredByDzik
    xMachineIds.push('XDRLQO'); // inspiredBySliwa (to tylko nazwa maszyny, tak naprawde oba sa na dziku w tym kodzie)

    const openai = new OpenAI({ apiKey: OPENAI_API });
    const discordClient = new DiscordClient({ checkUpdate: false } as any);

    const parser = new ParserService(openai);
    const octopus = new OctopusService(OCTOPUS_URL);

    // Zmieniona struktura Mapy: CommonId wiadomości -> { moneta, tablica par {maszyna, commonId} }
    const activePositions = new Map<string, {
        coin: string;
        placements: { xMachineId: string; commonId: string }[]
    }>();

    

    const handleError = (title: string, err: any) => {
        console.error(title);
        console.log(BetterJSON.stringify(err));

        pigeon.reportUrgentAsyncSafe(componentName, "EJYEO", `${title}`, BetterJSON.stringify(err));
    }

    const welcomeText = 'Octopus Discord Agent restarted!';

    const args = {
        commonId: "",
        channel: "notifier",
        payload: welcomeText,
        parentIds: [] as any
    };

    rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
        handleError('Couldnt add task for Common Notifier, channel notifier', err);
    });

    const messagesSummaryService = new MessageSummaryService(openai);

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


                messagesSummaryService.handleIncomingMessage(message);

                const args = {
                    commonId: "",
                    channel: "notifier",
                    payload: `Wiadomość z discord do analizy:\n\n${fullText}`,
                    parentIds: [] as any
                };

                rabbitMotokoActor.addTaskAsync(args, false);

                const result = await parser.parseSignal(fullText);

                const args2 = {
                    commonId: "",
                    channel: "notifier",
                    payload: `Wynik analizy:\n\n${BetterJSON.stringify(result)}`,
                    parentIds: [] as any
                };

                rabbitMotokoActor.addTaskAsync(args2, false);

                if (result.action === 'OPEN') {
                    // Wysyłamy wszystkie zapytania jednocześnie
                    const results = await Promise.allSettled(
                        xMachineIds.map(async (xMachineId) => {
                            const commonId = await octopus.executeNewOrderAsync(result, xMachineId);
                            return { xMachineId, commonId };
                        })
                    );

                    const successfulPlacements: { xMachineId: string; commonId: string }[] = [];

                    // Iterujemy po wynikach, aby obsłużyć sukcesy i błędy
                    results.forEach((res, index) => {
                        console.log(BetterJSON.stringify(res));
                        if (res.status === 'fulfilled') {
                            const data = res.value;
                            successfulPlacements.push(data);

                            investmentsMotokoActor.addMessageAsync(data.commonId, fullText, false);

                            investmentsMotokoActor.addMessageAsync(data.commonId, BetterJSON.stringify(result), false);

                            // Powiadomienie WA wysyłane w tle
                            const body = `🚀 *OPENING* | ${result.side} | ${result.coin}\nCommonId: ${data.commonId}\nMachine: ${data.xMachineId}\n`;
                            const args = {
                                commonId: data.commonId,
                                channel: "notifier",
                                payload: body,
                                parentIds: [] as any
                            };

                            rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                                handleError('Couldnt add task for Common Notifier, channel notifier', err);
                            });
                        } else {
                            const body = `❌ *OPEN FAILED* | ${result.side} | ${result.coin}\nMachine: ${xMachineIds[index]}\nReason: ${res.reason?.message || res.reason}`;
                            const args = {
                                commonId: "",
                                channel: "notifier",
                                payload: body,
                                parentIds: [] as any
                            };

                            rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                                handleError('Couldnt add task for Common Notifier, channel notifier', err);
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

                            const commonId = placement?.commonId ?? 'NO-COMMON-ID';

                            investmentsMotokoActor.addMessageAsync(commonId, fullText, false);

                            investmentsMotokoActor.addMessageAsync(commonId, BetterJSON.stringify(result), false);

                            if (res.status === 'fulfilled') {
                                const body = `⚡ *UPDATING* | ${result.action} | ${position.coin}\nCommonId: ${placement?.commonId}\nMachine: ${placement?.xMachineId}\n`;
                                const args = {
                                    commonId: placement?.commonId ?? "",
                                    channel: "notifier",
                                    payload: body,
                                    parentIds: [] as any
                                };

                                rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                                    handleError('Couldnt add task for Common Notifier, channel 1', err);
                                });
                            } else {
                                const body = `❌ *UPDATE FAILED* | ${result.action} | ${position.coin}\nCommonId: ${placement?.commonId}\nMachine: ${placement?.xMachineId}\nReason: ${res.reason?.message || res.reason}`;
                                const args = {
                                    commonId: placement?.commonId ?? "",
                                    channel: "notifier",
                                    payload: body,
                                    parentIds: [] as any
                                };

                                rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                                    handleError('Couldnt add task for Common Notifier, channel 1', err);
                                });
                            }
                        });
                    } else {
                        console.log('Brak otwartej pozycji');
                    }
                }
            }
            else if ([CHANNELS.OGOLNY, CHANNELS.KRYPTO, CHANNELS.PATRON].includes(message.channel.id)) {
                messagesSummaryService.handleIncomingMessage(message);
                // disabled for now - we dont look for customers now
                // const complain = await parser.lookForComplains(message.cleanContent);

                // if (complain.action === 'CALL') {
                //     const body = `⚠️ *POTENCJALNY KLIENT*\nUżytkownik: ${message.author.tag}\nWiadomość: ${message.cleanContent}\nPowód: ${complain.reasoning}`;
                //     const args = {
                //         commonId: "",
                //         channel: "notifier",
                //         payload: body,
                //         parentIds: [] as any
                //     };

                //     rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                //         handleError('Couldnt add task for Common Notifier, channel notifier', err);
                //     });
                // }
            }
        } catch (err: any) {
            const body = `❌ *ERROR PROCESSING MESSAGE*\nMessage CommonId: ${message.id}\nChannel: ${message.channel.id}\nReason: ${err.message || err}`;
            const args = {
                commonId: "",
                channel: "notifier",
                payload: body,
                parentIds: [] as any
            };

            rabbitMotokoActor.addTaskAsync(args, true).catch((err) => {
                handleError('Couldnt add task for Common Notifier, channel notifier', err);
            });
        }
    });

    discordClient.login(DISCORD_TOKEN);

    const watchdog = new WatchdogService(rabbitMotokoActor, messagesSummaryService);
    watchdog.run();
}

bootstrap().catch(console.error);