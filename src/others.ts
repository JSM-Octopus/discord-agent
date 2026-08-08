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

// Best-effort: returns message.content prefixed with the quoted message's context
// when the message is a Discord reply, so downstream AI analysis can attribute the
// action to a coin. Prefix is Polish on purpose — it lands in a Polish-language
// transcript analyzed by Polish prompts. Never throws; falls back to bare content.
export async function enrichWithReplyContext(
    message: Message<boolean>,
    openedSignals: ReadonlyMap<string, { coin: string }>
): Promise<string> {
    const refId = message.reference?.messageId;
    if (!refId) return message.content;

    const openedSignal = openedSignals.get(refId);
    if (openedSignal) {
        return `[odpowiedź na sygnał otwarcia pozycji ${openedSignal.coin}] ${message.content}`;
    }

    try {
        const referenced = message.channel.messages.cache.get(refId) ?? await message.fetchReference();
        const referencedText = getContent(referenced).trim();
        if (!referencedText) return message.content;

        return `[odpowiedź na: "${referencedText.slice(0, REPLY_CONTEXT_MAX_LENGTH)}"] ${message.content}`;
    } catch {
        return message.content;
    }
}