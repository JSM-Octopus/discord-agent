import { pigeon } from "@jsm-mit/pigeon-package";
import { RabbitTaskWorker, type AddTaskInput, type TasksActor } from "@jsm-mit/rabbit-motoko-package";
import { BetterJSON, getEnvVariableUnsafe } from "@jsm-mit/utils-package";
import axios from "axios";
import type { MessageSummaryService } from "./messages-summary.service.js";
import { CHANNELS } from "./globals.js";

const heartbeatUrl = getEnvVariableUnsafe('HEARTBEAT_URL');
const heartbeatPassword = getEnvVariableUnsafe('HEARTBEAT_PASSWORD');

export class WatchdogService {

    private startedAt = Date.now().toString();
    private discordChannelTaskWorker: RabbitTaskWorker;

    constructor(private rabbitTasksActor: TasksActor, private messagesSummaryService: MessageSummaryService) {
        this.discordChannelTaskWorker = new RabbitTaskWorker("discord-channel", 500, rabbitTasksActor);
    }

    run() {
        // not used now - restore for full Octopus working scenario
        // this.heartbeat();

        this.discordChannelTaskWorker.tasks$.subscribe(async task => {
            if (task.payload === "roundtrip test") {
                const args: AddTaskInput = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `roundtrip test successful`
                    })
                };

                this.rabbitTasksActor.addTaskAsyncUnsafe(args).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });
            } else if (task.payload === "summary") {
                const [summaryOgolny, summaryPatron, summaryKrypto, summaryDzik] = await Promise.all([
                    this.messagesSummaryService.summaryChannelAsyncSafe(CHANNELS.OGOLNY),
                    this.messagesSummaryService.summaryChannelAsyncSafe(CHANNELS.PATRON),
                    this.messagesSummaryService.summaryChannelAsyncSafe(CHANNELS.KRYPTO),
                    this.messagesSummaryService.summaryChannelAsyncSafe(CHANNELS.DZIK)
                ]);

                const args: AddTaskInput = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Ogólny: ${summaryOgolny}`
                    })
                };

                await this.rabbitTasksActor.addTaskAsyncUnsafe(args).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });

                const args2: AddTaskInput = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Patron: ${summaryPatron}`
                    })
                };

                await this.rabbitTasksActor.addTaskAsyncUnsafe(args2).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });

                const args3: AddTaskInput = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Krypto: ${summaryKrypto}`
                    })
                };

                await this.rabbitTasksActor.addTaskAsyncUnsafe(args3).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });

                const args4: AddTaskInput = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Dzik: ${summaryDzik}`
                    })
                };

                await this.rabbitTasksActor.addTaskAsyncUnsafe(args4).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });
            }

            await this.rabbitTasksActor.completeTaskAsyncUnsafe({
                id: task.id,
                message: ""
            });
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
                const args: AddTaskInput = {
                    commonId: "",
                    channel: "notifier",
                    payload: BetterJSON.stringify({
                        to: "common-notifier-admin",
                        text: `Heartbeat error from Discord Agent`
                    })
                };

                await this.rabbitTasksActor.addTaskAsyncUnsafe(args).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });

                console.error(BetterJSON.stringify(err));
            }
        }, 20 * 1000);
    }
}



