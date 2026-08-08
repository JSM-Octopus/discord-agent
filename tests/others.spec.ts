import { enrichWithReplyContext } from '../src/others.js';
import type { Message } from 'discord.js-selfbot-v13';

const stubMessage = (overrides: any): Message<boolean> => ({
    content: 'Realizuje kolejne 25%',
    reference: null,
    channel: { messages: { cache: new Map() } },
    fetchReference: async () => { throw new Error('not stubbed'); },
    ...overrides,
} as any);

const noSignals = new Map<string, { coin: string }>();

describe('enrichWithReplyContext', () => {
    it('returns bare content when the message is not a reply', async () => {
        const result = await enrichWithReplyContext(stubMessage({}), noSignals);

        expect(result).toBe('Realizuje kolejne 25%');
    });

    it('uses the opened-signal fast path when the replied-to message opened a position', async () => {
        const message = stubMessage({ reference: { messageId: 'msg-1' } });
        const signals = new Map([['msg-1', { coin: 'BTC' }]]);

        const result = await enrichWithReplyContext(message, signals);

        expect(result).toBe('[odpowiedź na sygnał otwarcia pozycji BTC] Realizuje kolejne 25%');
    });

    it('inlines the quoted message from the channel cache when it is not a known signal', async () => {
        const cache = new Map([['msg-2', { content: 'Otwieram pozycję: BTCUSDT LONG @everyone', embeds: [] }]]);
        const message = stubMessage({
            reference: { messageId: 'msg-2' },
            channel: { messages: { cache } },
        });

        const result = await enrichWithReplyContext(message, noSignals);

        expect(result).toBe('[odpowiedź na: "Otwieram pozycję: BTCUSDT LONG @everyone"] Realizuje kolejne 25%');
    });

    it('falls back to fetchReference when the quoted message is not cached', async () => {
        const message = stubMessage({
            reference: { messageId: 'msg-3' },
            fetchReference: async () => ({ content: 'Otwieram pozycję: ETHUSDT SHORT', embeds: [] }),
        });

        const result = await enrichWithReplyContext(message, noSignals);

        expect(result).toBe('[odpowiedź na: "Otwieram pozycję: ETHUSDT SHORT"] Realizuje kolejne 25%');
    });

    it('reads embeds when the quoted message has no plain content', async () => {
        const message = stubMessage({
            reference: { messageId: 'msg-4' },
            fetchReference: async () => ({
                content: '',
                embeds: [{ title: 'Sygnał', description: 'BTCUSDT LONG', fields: [] }],
            }),
        });

        const result = await enrichWithReplyContext(message, noSignals);

        expect(result).toBe('[odpowiedź na: "| Title: Sygnał | Desc: BTCUSDT LONG"] Realizuje kolejne 25%');
    });

    it('truncates long quoted content to 200 characters', async () => {
        const longText = 'x'.repeat(500);
        const message = stubMessage({
            reference: { messageId: 'msg-5' },
            fetchReference: async () => ({ content: longText, embeds: [] }),
        });

        const result = await enrichWithReplyContext(message, noSignals);

        expect(result).toBe(`[odpowiedź na: "${'x'.repeat(200)}"] Realizuje kolejne 25%`);
    });

    it('returns bare content when the quoted message cannot be fetched (deleted)', async () => {
        const message = stubMessage({
            reference: { messageId: 'msg-6' },
            fetchReference: async () => { throw new Error('Unknown Message'); },
        });

        const result = await enrichWithReplyContext(message, noSignals);

        expect(result).toBe('Realizuje kolejne 25%');
    });
});
