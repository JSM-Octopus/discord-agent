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