import { BetterJSON } from '@jsm-mit/utils-package';
import OpenAI from 'openai';

interface ChannelMessage {
    content: string;
    author: string;
    timestamp: number;
}

export class MessageSummaryService {
    private messagesByChannel: Map<string, ChannelMessage[]> = new Map();

    constructor(private readonly openai: OpenAI) { }

    /**
     * Processes incoming messages from the selfbot listener.
     */
    public handleIncomingMessage(message: any): void {
        console.log(BetterJSON.stringify(message));
        // Selfbots often trigger on their own messages; we skip them if needed 
        // or include them depending on your preference.
        if (!message.content) return;

        const channelId = message.channelId;
        const now = Date.now();

        const newMessage: ChannelMessage = {
            content: message.content,
            author: message.author.username,
            timestamp: now,
        };

        if (!this.messagesByChannel.has(channelId)) {
            this.messagesByChannel.set(channelId, []);
        }

        const history = this.messagesByChannel.get(channelId)!;
        history.push(newMessage);

        // Keep only the last 24 hours of history
        const cutoff = now - 24 * 60 * 60 * 1000;
        const freshMessages = history.filter(msg => msg.timestamp > cutoff);

        this.messagesByChannel.set(channelId, freshMessages);
    }

    /**
     * Generates a summary for the requested channel.
     */
    public async summaryChannelAsyncSafe(channelId: string): Promise<string> {
        const history = this.messagesByChannel.get(channelId) || [];

        if (history.length === 0) {
            return "No messages recorded in the last 24 hours.";
        }

        const transcript = history
            .map(m => `[${m.author}]: ${m.content}`)
            .join('\n');

        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Summarize the following Discord chat logs from the last 24 hours. Be concise and highlight key points."
                    },
                    {
                        role: "user",
                        content: `Logs:\n${transcript}`
                    }
                ],
            });

            return response.choices[0]?.message?.content || "Summary generation failed.";
        } catch (error) {
            console.error("OpenAI Error:", error);
            return "Error connecting to OpenAI.";
        }
    }
}