import { pigeon } from '@jsm-mit/pigeon-package';
import { BetterJSON } from '@jsm-mit/utils-package';
import axios from 'axios';

export class OctopusService {
    private readonly headers = {
        'x-password': 'ms',
        'x-machine-id': 'YJZCPI',
        'Content-Type': 'application/json'
    };

    constructor(private readonly baseUrl: string) {}

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
            pigeon.reportUrgentAsyncSafe("Couldnt open position", BetterJSON.stringify(error));
            throw error;
        }
    }

    /**
     * Uniwersalna metoda do modyfikacji pozycji z dynamicznym ID maszyny
     */
    public async handleExistingPosition(
        action: 'CLOSE_PARTIALLY' | 'STOP_LOSS' | 'CLOSE',
        coin: string,
        commonId: string,
        xMachineId: string,
        value?: number
    ): Promise<void> {
        const urlBase = `${this.baseUrl}/investing/positions/${coin}`;
        const config = { 
            headers: { 
                ...this.headers, 
                'x-machine-id': xMachineId,
                'x-common-id': commonId 
            } 
        };

        try {
            switch (action) {
                case 'CLOSE':
                    await axios.post(`${urlBase}/close`, undefined, config);
                    break;
                case 'CLOSE_PARTIALLY':
                    await axios.post(`${urlBase}/logic-box`, {
                        type: 'CLOSE_POSITION_PARTIALLY',
                        positionClosePercentage: value,
                    }, config);
                    break;
                case 'STOP_LOSS':
                    await axios.post(`${urlBase}/logic-box`, {
                        type: 'STOP_LOSS',
                        stopLoss: value,
                    }, config);
                    break;
            }
        } catch (error: any) {
            console.error(`[Octopus] Error ${action}:`, error.response?.data || error.message);
            throw error;
        }
    }
}