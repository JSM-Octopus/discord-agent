import { RabbitTaskWorker, type AddTaskArgs, type RabbitMotokoActor } from "@jsm-mit/rabbit-motoko-package";
import { BetterJSON, getEnvVariableUnsafe } from "@jsm-mit/utils-package";
import axios from "axios";

const heartbeatUrl = getEnvVariableUnsafe('HEARTBEAT_URL');
const heartbeatPassword = getEnvVariableUnsafe('HEARTBEAT_PASSWORD');

export class WatchdogService {

    private startedAt = Date.now().toString();
    private discordChannelTaskWorker: RabbitTaskWorker;

    constructor(private rabbitMotokoActor: RabbitMotokoActor) { 
        this.discordChannelTaskWorker = new RabbitTaskWorker("discord-channel", 2500, rabbitMotokoActor);
    }

    run() {
        this.heartbeat();

        this.discordChannelTaskWorker.tasks$.subscribe(task => {
            if (task.payload === "ping") {
                const args: AddTaskArgs = {
                    commonId: "",
                    channel: "notifier",
                    payload: `pong from Discord Agent`,
                    parentIds: []
                };

                this.rabbitMotokoActor.addTaskAsync(args, false).catch((err) => {
                    console.error(BetterJSON.stringify(err));
                });
            }
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

                await this.rabbitMotokoActor.addTaskAsync(args, false);
                console.error(BetterJSON.stringify(err));
            }
        }, 20 * 1000);
    }
}



