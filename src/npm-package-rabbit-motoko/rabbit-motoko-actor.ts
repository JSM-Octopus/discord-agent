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
    private readonly host: string = "https://icp0.io";
    private actor!: ActorSubclass<_SERVICE>;
    private agent: HttpAgent;

    constructor(private readonly canisterId: string) {
        // 1. Tworzymy agenta
        this.agent = new HttpAgent({
            host: this.host,
            // Opcjonalnie: można zwiększyć margines akceptacji czasu (retryDelay), 
            // ale syncTime() jest skuteczniejszym rozwiązaniem.
        });

        // 2. Inicjalizujemy aktora
        this.initActor();

        // 3. Odpalamy asynchroniczną synchronizację
        this.setupAgent();
    }

    private initActor() {
        this.actor = Actor.createActor<_SERVICE>(idlFactory, {
            agent: this.agent,
            canisterId: this.canisterId,
        });
    }

    private async setupAgent() {
        try {
            // Synchronizacja czasu z siecią IC - rozwiązuje błąd "certificate is still too far in the future"
            await this.agent.syncTime();

            console.log("✅ Agent IC zsynchronizowany pomyślnie.");
        } catch (err) {
            console.error("❌ Błąd podczas konfiguracji Agenta:", err);
        }
    }

    private async checkError(error: unknown): Promise<void> {
        const errorMsg = error?.toString() || "";
        if (errorMsg.includes("certificate") || errorMsg.includes("TrustError")) {
            console.warn("⚠️ Wykryto problem z zaufaniem/czasem. Próbuję synchronizacji...");
            await this.sync();
        }
    }

    public async sync(): Promise<void> {
        try {
            await this.agent.syncTime();
            console.log("🔄 Czas agenta został zsynchronizowany ponownie.");
        } catch (err) {
            console.error("❌ Nie udało się zsynchronizować czasu:", err);
        }
    }

    /**
     * Adds a new task to the queue.
     */
    public async addTask(args: AddTaskArgs): Promise<bigint> {
        try {
            return await this.actor.addTask(args);
        } catch (error) {
            await this.checkError(error);
            console.error(`❌ Błąd podczas dodawania zadania:`, error);
            throw error;
        }
    }

    /**
     * Claims a task for a specific worker.
     */
    public async claimTask(args: ClaimTaskArgs): Promise<[] | [Task]> {
        try {
            return await this.actor.claimTask(args);
        } catch (error) {
            await this.checkError(error);
            console.error(`❌ Błąd podczas pobierania zadania (claimTask):`, error);
            throw error;
        }
    }

    /**
     * Completes a previously claimed task.
     */
    public async completeTask(args: CompleteTaskArgs): Promise<boolean> {
        try {
            return await this.actor.completeTask(args);
        } catch (error) {
            await this.checkError(error);
            console.error(`❌ Błąd podczas zakończenia zadania:`, error);
            throw error;
        }
    }

    /**
     * Fetches IDs of tasks available in a specific channel.
     */
    public async getAvailableTaskIds(channel: string): Promise<bigint[]> {
        try {
            return await this.actor.getAvailableTaskIds(channel);
        } catch (error) {
            await this.checkError(error);
            console.error(`❌ Błąd podczas pobierania ID zadań (Kanał: ${channel}):`, error);
            throw error;
        }
    }

    /**
     * Returns a list of all tasks.
     */
    public async getTasks(): Promise<Task[]> {
        try {
            return await this.actor.getTasks();
        } catch (error) {
            await this.checkError(error);
            console.error(`❌ Błąd podczas pobierania wszystkich zadań (getTasks):`, error);
            throw error;
        }
    }

    /**
     * Alternative method to fetch tasks.
     */
    public async getTasks2(): Promise<Task[]> {
        try {
            return await this.actor.getTasks2();
        } catch (error) {
            await this.checkError(error);
            console.error(`❌ Błąd podczas pobierania wszystkich zadań (getTasks2):`, error);
            throw error;
        }
    }
}