import { pigeon } from "@jsm-mit/pigeon-package";
import { RabbitTaskWorker, type AddTaskArgs, type RabbitMotokoActor } from "@jsm-mit/rabbit-motoko-package";
import { BetterJSON, getEnvVariableUnsafe } from "@jsm-mit/utils-package";
import axios from "axios";
import type { MessageSummaryService } from "./messages-summary.service.js";
import { CHANNELS } from "./globals.js";

const heartbeatUrl = getEnvVariableUnsafe('HEARTBEAT_URL');
const heartbeatPassword = getEnvVariableUnsafe('HEARTBEAT_PASSWORD');

export class WatchdogService {

    private startedAt = Date.now().toString();
    private discordChannelTaskWorker: RabbitTaskWorker;

    constructor(private rabbitMotokoActor: RabbitMotokoActor, private messagesSummaryService: MessageSummaryService) {
        this.discordChannelTaskWorker = new RabbitTaskWorker("discord-channel", 2500, rabbitMotokoActor);
    }

    run() {
        this.heartbeat();

        this.discordChannelTaskWorker.tasks$.subscribe(async task => {
            pigeon.debugLog(BetterJSON.stringify(task), 24);

            if (task.payload === "roundtrip test") {
                const args: AddTaskArgs = {
                    commonId: "",
                    channel: "notifier",
                    payload: `roundtrip test successful`,
                    parentIds: []
                };

                this.rabbitMotokoActor.addTaskAsyncUnsafe(args, false).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });
            } else if (task.payload === "summary") {
                const [summaryOgolny, summaryPatron, summaryKrypto, summaryDzik] = await Promise.all([
                    this.messagesSummaryService.summaryChannelAsyncSafe(CHANNELS.OGOLNY),
                    this.messagesSummaryService.summaryChannelAsyncSafe(CHANNELS.PATRON),
                    this.messagesSummaryService.summaryChannelAsyncSafe(CHANNELS.KRYPTO),
                    this.messagesSummaryService.summaryChannelAsyncSafe(CHANNELS.DZIK)
                ]);

                const args: AddTaskArgs = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Ogólny: ${summaryOgolny}`
                    }),
                    parentIds: []
                };

                await this.rabbitMotokoActor.addTaskAsyncUnsafe(args, false).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });

                const args2: AddTaskArgs = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Patron: ${summaryPatron}`
                    }),
                    parentIds: []
                };

                await this.rabbitMotokoActor.addTaskAsyncUnsafe(args2, false).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });

                const args3: AddTaskArgs = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Krypto: ${summaryKrypto}`
                    }),
                    parentIds: []
                };

                await this.rabbitMotokoActor.addTaskAsyncUnsafe(args3, false).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });

                const args4: AddTaskArgs = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Dzik: ${summaryDzik}`
                    }),
                    parentIds: []
                };

                await this.rabbitMotokoActor.addTaskAsyncUnsafe(args4, false).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });
            }

            await this.rabbitMotokoActor.completeTaskAsyncUnsafe({
                id: task.id,
                message: ""
            }, false);
        });

        this.discordChannelTaskWorker.run();
    }

    private heartbeat() {
        const logObj = {
            machineId: "discord-agent",
        }

        setInterval(async () => {
            try {
                await axios.post(`${heartbeatUrl}/heartbeat`, logObj, { headers: { 'x-password': heartbeatPassword, 'x-app-start-timestamp': this.startedAt } });
            } catch (err) {
                const args: AddTaskArgs = {
                    commonId: "",
                    channel: "notifier",
                    payload: `Heartbeat error from Discord Agent`,
                    parentIds: []
                };

                await this.rabbitMotokoActor.addTaskAsyncUnsafe(args, false).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });

                console.error(BetterJSON.stringify(err));
            }
        }, 20 * 1000);
    }
}



