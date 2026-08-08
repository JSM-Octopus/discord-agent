import type { Message } from "discord.js-selfbot-v13";

export function getContentFromEmbeds(message: Message<boolean>) {
    let fullText = '';
    if (message.embeds && message.embeds.length > 0) {
        const e = message.embeds[0];
        fullText += ` | Title: ${e?.title} | Desc: ${e?.description || ''}`;
        e?.fields.forEach(f => fullText += ` | ${f.name}: ${f.value}`);
    }

    return fullText;
}

export function getContent(message: Message<boolean>) {
    if (message.content) {
        return message.content;
    } else {
        return getContentFromEmbeds(message);
    }
}

const REPLY_CONTEXT_MAX_LENGTH = 200;

// Wire-contract metadata resolved from a Discord reply reference. Consumed by
// influ-node for coin attribution (replyCoin beats everything else there).
export interface ReplyContext {
    replyCoin?: string;
    replyText?: string;
}

// Best-effort: resolves who the message replies to — a known open-position signal
// (replyCoin, via the activePositions map) or any other quoted message (replyText,
// channel cache first, then one fetchReference API call). Never throws; returns {}
// when the message is not a reply or the quoted message is unavailable.
export async function getReplyContext(
    message: Message<boolean>,
    openedSignals: ReadonlyMap<string, { coin: string }>
): Promise<ReplyContext> {
    const refId = message.reference?.messageId;
    if (!refId) return {};

    const openedSignal = openedSignals.get(refId);
    if (openedSignal) {
        return { replyCoin: openedSignal.coin };
    }

    try {
        const referenced = message.channel.messages.cache.get(refId) ?? await message.fetchReference();
        const referencedText = getContent(referenced).trim();
        if (!referencedText) return {};

        return { replyText: referencedText.slice(0, REPLY_CONTEXT_MAX_LENGTH) };
    } catch {
        return {};
    }
}

// Prefix is Polish on purpose — the string lands in influ-node's Polish-language
// transcript analyzed by Polish prompts.
export function buildEnrichedContent(content: string, ctx: ReplyContext): string {
    if (ctx.replyCoin) {
        return `[odpowiedź na sygnał otwarcia pozycji ${ctx.replyCoin}] ${content}`;
    }

    if (ctx.replyText) {
        return `[odpowiedź na: "${ctx.replyText}"] ${content}`;
    }

    return content;
}