import { OpenAI } from "openai";
import { Client as DiscordClient } from 'discord.js-selfbot-v13';
import { ParserService } from './parser.service.js';
import { OctopusService } from './octopus.service.js';
import { TasksActor } from "@jsm-mit/rabbit-motoko-package";
import { BetterJSON, getEnvVariableUnsafe, getIdentityFromPem } from "@jsm-mit/utils-package";
import { pigeon } from "@jsm-mit/pigeon-package";
import { WatchdogService } from "./watchdog.service.js";
import { InvestmentsMotokoActor } from "@jsm-mit/investments-motoko-package";
import { MessageSummaryService } from "./messages-summary.service.js";
import { CHANNELS, componentName } from "./globals.js";
import { buildEnrichedContent, getContentFromEmbeds, getReplyContext } from "./others.js";

async function bootstrap() {
    const rabbitMotokoCanisterId: string = getEnvVariableUnsafe('RABBIT_MOTOKO_CANISTER_ID');
    const investmentsMotokoCanisterId: string = getEnvVariableUnsafe('INVESTMENTS_MOTOKO_CANISTER_ID');
    const identityPem: string = getEnvVariableUnsafe('IDENTITY_PEM');
    const identity = getIdentityFromPem(identityPem);

    // Logged so the principal can be enrolled on rabbit channels (grant/signup) — the
    // deployed identity of this agent is not known locally (placeholder PEM in .env),
    // and under the v2 permission model it needs canAddTasks on `notifier` and
    // canWorkOnTasks on `discord-channel` unless it is an admin.
    console.log(`Rabbit identity principal: ${identity.getPrincipal().toText()}`);

    const rabbitTasksActor = new TasksActor(rabbitMotokoCanisterId, identity);

    const investmentsMotokoActor = new InvestmentsMotokoActor(investmentsMotokoCanisterId, identity);

    const DISCORD_TOKEN = getEnvVariableUnsafe('DISCORD_TOKEN');
    const OPENAI_API = getEnvVariableUnsafe('OPENAI_API');
    const OCTOPUS_URL = getEnvVariableUnsafe('OCTOPUS_URL');

    const xMachineIds: string[] = [];

    // xMachineIds.push('YJZCPI'); // inspiredByDzik
    xMachineIds.push('INFLU1'); // inspiredBySliwa (to tylko nazwa maszyny, tak naprawde oba sa na dziku w tym kodzie)

    const openai = new OpenAI({ apiKey: OPENAI_API });
    const discordClient = new DiscordClient({ checkUpdate: false } as any);

    const parser = new ParserService(openai);
    const octopus = new OctopusService(OCTOPUS_URL);

    // Zmieniona struktura Mapy: CommonId wiadomości -> { moneta, tablica par {maszyna, commonId} }
    const activePositions = new Map<string, {
        coin: string;
        placements: { xMachineId: string; commonId: string; timestamp: number }[]
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
        payload: BetterJSON.stringify({
            to: "common-notifier-admin",
            text: welcomeText
        })
    };

    rabbitTasksActor.addTaskAsyncUnsafe(args).catch((err) => {
        handleError('Couldnt add task for Common Notifier, channel notifier', err);
    });

    const messagesSummaryService = new MessageSummaryService(openai);

    discordClient.on('ready', () => console.log(`✅ Discord zalogowany: ${discordClient.user?.tag}`));

    discordClient.on('messageCreate', async (message) => {
        try {
            if (message.channel.id === CHANNELS.DZIK) {
                let embedsText = getContentFromEmbeds(message);

                if (!embedsText) {
                    messagesSummaryService.handleIncomingMessage(message);

                    const ctx = await getReplyContext(message, activePositions);
                    const enriched = buildEnrichedContent(message.content, ctx);

                    xMachineIds.map(async (xMachineId) => {
                        await octopus.sendNonStandardMessageAsyncSafe({
                            message: enriched,
                            source: 'text',
                            ...ctx,
                            discordMessageId: message.id,
                        }, xMachineId);
                    });
                    return;
                }

                // Routing gate, not analysis: opening positions is the only action this
                // agent still owns — every other embed goes raw to influ-node. On gate
                // failure we forward too; influ-node refuses an OPEN parse visibly.
                let actionResult: any = {};
                try {
                    actionResult = await parser.getAction(embedsText);
                } catch (err) {
                    handleError('Couldnt classify embed action - forwarding to influ-node', err);
                }

                if (actionResult.action === 'OPEN') {
                    const result = await parser.parseSignal(embedsText, actionResult);

                    // if (['ADA', 'ICP'].includes(result.coin)) return;

                    // Wysyłamy wszystkie zapytania jednocześnie
                    const results = await Promise.allSettled(
                        xMachineIds.map(async (xMachineId) => {
                            const commonId = await octopus.executeNewOrderAsync(result, xMachineId);
                            return { xMachineId, commonId, timestamp: Date.now() };
                        })
                    );

                    const successfulPlacements: { xMachineId: string; commonId: string; timestamp: number }[] = [];

                    // Iterujemy po wynikach, aby obsłużyć sukcesy i błędy
                    results.forEach((res, index) => {
                        if (res.status === 'fulfilled') {
                            const data = res.value;
                            successfulPlacements.push(data);

                            investmentsMotokoActor.addMessageAsyncUnsafe(data.commonId, embedsText).catch(err => {
                                handleError("Cannot add message", err);
                            });

                            investmentsMotokoActor.addMessageAsyncUnsafe(data.commonId, BetterJSON.stringify(result)).catch(err => {
                                handleError("Cannot add message", err);
                            });

                            // Powiadomienie WA wysyłane w tle
                            const body = `🚀 *OPENING* | ${result.side} | ${result.coin}\nCommonId: ${data.commonId}\nMachine: ${data.xMachineId}\n`;
                            const args = {
                                commonId: data.commonId,
                                channel: "notifier",
                                payload: BetterJSON.stringify({
                                    to: "common-notifier-admin",
                                    text: body
                                })
                            };

                            rabbitTasksActor.addTaskAsyncUnsafe(args).catch((err) => {
                                handleError('Couldnt add task for Common Notifier, channel notifier', err);
                            });
                        } else {
                            const body = `❌ *OPEN FAILED* | ${result.side} | ${result.coin}\nMachine: ${xMachineIds[index]}\nReason: ${res.reason?.message || res.reason}`;
                            const args = {
                                commonId: "",
                                channel: "notifier",
                                payload: BetterJSON.stringify({
                                    to: "common-notifier-admin",
                                    text: body
                                })
                            };

                            rabbitTasksActor.addTaskAsyncUnsafe(args).catch((err) => {
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
                } else {
                    // Everything except opening a position is influ-node's job now
                    // (execution, guards, on-chain audit and WhatsApp notifications
                    // all moved there) — forward the raw embed with reply metadata.
                    const ctx = await getReplyContext(message, activePositions);

                    xMachineIds.map(async (xMachineId) => {
                        await octopus.sendNonStandardMessageAsyncSafe({
                            message: embedsText,
                            source: 'embed',
                            ...ctx,
                            discordMessageId: message.id,
                        }, xMachineId);
                    });
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

                //     rabbitTasksActor.addTaskAsync(args, true).catch((err) => {
                //         handleError('Couldnt add task for Common Notifier, channel notifier', err);
                //     });
                // }
            }
        } catch (err: any) {
            const body = `❌ *ERROR PROCESSING MESSAGE*\nMessage CommonId: ${message.id}\nChannel: ${message.channel.id}\nReason: ${err.message || err}`;
            const args = {
                commonId: "",
                channel: "notifier",
                payload: BetterJSON.stringify({
                    to: "common-notifier-admin",
                    text: body
                })
            };

            rabbitTasksActor.addTaskAsyncUnsafe(args).catch((err) => {
                handleError('Couldnt add task for Common Notifier, channel notifier', err);
            });
        }
    });

    discordClient.login(DISCORD_TOKEN);

    const watchdog = new WatchdogService(rabbitTasksActor, messagesSummaryService);
    watchdog.run();
}

bootstrap().catch(console.error);