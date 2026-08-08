import { buildEnrichedContent, getReplyContext } from '../src/others.js';
import type { Message } from 'discord.js-selfbot-v13';

const stubMessage = (overrides: any): Message<boolean> => ({
    content: 'Realizuje kolejne 25%',
    reference: null,
    channel: { messages: { cache: new Map() } },
    fetchReference: async () => { throw new Error('not stubbed'); },
    ...overrides,
} as any);

const noSignals = new Map<string, { coin: string }>();

describe('getReplyContext', () => {
    test('returns empty context when the message is not a reply', async () => {
        const ctx = await getReplyContext(stubMessage({}), noSignals);

        expect(ctx).toEqual({});
    });

    test('returns replyCoin via the opened-signal fast path', async () => {
        const message = stubMessage({ reference: { messageId: 'msg-1' } });
        const signals = new Map([['msg-1', { coin: 'BTC' }]]);

        const ctx = await getReplyContext(message, signals);

        expect(ctx).toEqual({ replyCoin: 'BTC' });
    });

    test('returns replyText from the channel cache when not a known signal', async () => {
        const cache = new Map([['msg-2', { content: 'Otwieram pozycję: BTCUSDT LONG @everyone', embeds: [] }]]);
        const message = stubMessage({
            reference: { messageId: 'msg-2' },
            channel: { messages: { cache } },
        });

        const ctx = await getReplyContext(message, noSignals);

        expect(ctx).toEqual({ replyText: 'Otwieram pozycję: BTCUSDT LONG @everyone' });
    });

    test('falls back to fetchReference when the quoted message is not cached', async () => {
        const message = stubMessage({
            reference: { messageId: 'msg-3' },
            fetchReference: async () => ({ content: 'Otwieram pozycję: ETHUSDT SHORT', embeds: [] }),
        });

        const ctx = await getReplyContext(message, noSignals);

        expect(ctx).toEqual({ replyText: 'Otwieram pozycję: ETHUSDT SHORT' });
    });

    test('reads embeds when the quoted message has no plain content', async () => {
        const message = stubMessage({
            reference: { messageId: 'msg-4' },
            fetchReference: async () => ({
                content: '',
                embeds: [{ title: 'Sygnał', description: 'BTCUSDT LONG', fields: [] }],
            }),
        });

        const ctx = await getReplyContext(message, noSignals);

        expect(ctx).toEqual({ replyText: '| Title: Sygnał | Desc: BTCUSDT LONG' });
    });

    test('truncates long quoted content to 200 characters', async () => {
        const message = stubMessage({
            reference: { messageId: 'msg-5' },
            fetchReference: async () => ({ content: 'x'.repeat(500), embeds: [] }),
        });

        const ctx = await getReplyContext(message, noSignals);

        expect(ctx).toEqual({ replyText: 'x'.repeat(200) });
    });

    test('returns empty context when the quoted message cannot be fetched (deleted)', async () => {
        const message = stubMessage({
            reference: { messageId: 'msg-6' },
            fetchReference: async () => { throw new Error('Unknown Message'); },
        });

        const ctx = await getReplyContext(message, noSignals);

        expect(ctx).toEqual({});
    });
});

describe('buildEnrichedContent', () => {
    test('returns bare content for an empty context', () => {
        expect(buildEnrichedContent('Realizuje kolejne 25%', {})).toBe('Realizuje kolejne 25%');
    });

    test('prefixes with the opened-signal coin', () => {
        expect(buildEnrichedContent('Realizuje kolejne 25%', { replyCoin: 'BTC' }))
            .toBe('[odpowiedź na sygnał otwarcia pozycji BTC] Realizuje kolejne 25%');
    });

    test('prefixes with the quoted text', () => {
        expect(buildEnrichedContent('Realizuje kolejne 25%', { replyText: 'Otwieram pozycję: BTCUSDT LONG @everyone' }))
            .toBe('[odpowiedź na: "Otwieram pozycję: BTCUSDT LONG @everyone"] Realizuje kolejne 25%');
    });

    test('prefers replyCoin over replyText', () => {
        expect(buildEnrichedContent('ok', { replyCoin: 'ETH', replyText: 'cokolwiek' }))
            .toBe('[odpowiedź na sygnał otwarcia pozycji ETH] ok');
    });
});
