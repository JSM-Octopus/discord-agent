import { Actor, HttpAgent, type ActorSubclass } from "@dfinity/agent";
import { idlFactory } from "./declarations/service.did.js";
import type { 
    _SERVICE, 
    AddTaskArgs, 
    ClaimTaskArgs, 
    CompleteTaskArgs, 
    Task 
} from "./declarations/service.did.js";

export class RabbitMotokoActor {
    private readonly canisterId: string = "f4wje-maaaa-aaaag-axpnq-cai";
    private readonly host: string = "https://icp0.io";
    private readonly actor: ActorSubclass<_SERVICE>;

    constructor() {
        const agent = new HttpAgent({ host: this.host });

        // In local development uncomment this:
        // if (this.host.includes("localhost") || this.host.includes("127.0.0.1")) {
        //   agent.fetchRootKey().catch(console.error);
        // }

        this.actor = Actor.createActor<_SERVICE>(idlFactory, {
            agent,
            canisterId: this.canisterId,
        });
    }

    /**
     * Adds a new task to the queue.
     */
    public async addTask(args: AddTaskArgs): Promise<bigint> {
        return await this.actor.addTask(args);
    }

    /**
     * Claims a task for a specific worker.
     */
    public async claimTask(args: ClaimTaskArgs): Promise<[] | [Task]> {
        return await this.actor.claimTask(args);
    }

    /**
     * Completes a previously claimed task.
     */
    public async completeTask(args: CompleteTaskArgs): Promise<boolean> {
        return await this.actor.completeTask(args);
    }

    /**
     * Fetches IDs of tasks available in a specific channel.
     */
    public async getAvailableTaskIds(channel: string): Promise<bigint[]> {
        return await this.actor.getAvailableTaskIds(channel);
    }

    /**
     * Returns a list of all tasks.
     */
    public async getTasks(): Promise<Task[]> {
        return await this.actor.getTasks();
    }

    /**
     * Alternative method to fetch tasks.
     */
    public async getTasks2(): Promise<Task[]> {
        return await this.actor.getTasks2();
    }
}