import { pigeon } from '@jsm-mit/pigeon-package';
import { BetterJSON } from '@jsm-mit/utils-package';
import axios from 'axios';
import { componentName } from './globals.js';

export class OctopusService {
    private readonly headers = {
        'x-password': 'ms',
        'x-machine-id': 'YJZCPI',
        'Content-Type': 'application/json'
    };

    constructor(private readonly baseUrl: string) { }

    /**
     * Otwiera nową pozycję z dynamicznym ID maszyny
     */
    public async executeNewOrderAsync(signal: any, xMachineId: string): Promise<string> {
        try {
            const { data } = await axios.post(
                `${this.baseUrl}/investing/orders/new`,
                signal,
                {
                    headers: {
                        ...this.headers,
                        'x-machine-id': xMachineId
                    }
                }
            );
            return data;
        } catch (error: any) {
            pigeon.reportUrgentAsyncSafe(componentName, "LYCDM", "Couldnt open position", BetterJSON.stringify(error));
            throw error;
        }
    }

    public async sendNonStandardMessageAsyncSafe(body: NonStandardMessageBody, xMachineId: string): Promise<void> {
        try {
            const { data } = await axios.post(
                `${this.baseUrl}/investing/discord/non-standard-message`,
                body,
                {
                    headers: {
                        ...this.headers,
                        'x-machine-id': xMachineId
                    }
                }
            );
            return data;
        } catch (error: any) {
            pigeon.reportUrgentAsyncSafe(componentName, "LFWJI", "Couldnt send non standard message from discord for further analyzing", BetterJSON.stringify(error));
        }
    }
}

// Wire contract shared with octopus-backend (passthrough) and influ-node (consumer).
// `source` absent means 'text' on the influ-node side.
export interface NonStandardMessageBody {
    message: string;
    source?: 'embed' | 'text';
    replyCoin?: string;
    replyText?: string;
    discordMessageId?: string;
}