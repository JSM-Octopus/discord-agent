import crypto from "crypto";

export function hashTo6Upper(input: string): string {
    const hashHex = crypto.createHash("sha256").update(input, "utf8").digest("hex");
    let value = BigInt("0x" + hashHex);

    const out: string[] = [];
    for (let i = 0; i < 6; i++) {
        const rem = value % 26n; // 0..25
        out.push(String.fromCharCode(Number(rem) + 65)); // 65 == 'A'
        value = value / 26n;
    }

    return out.reverse().join("");
}

export function trimTrailingSlash(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

function safeStringify(obj: any): string {
    const seen = new WeakSet();

    return JSON.stringify(obj, (key, value) => {
        if (typeof value === "bigint") return value.toString();

        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
        }
        return value;
    });
}

export function toJson(data: any): string {
    if (typeof data === "string") {
        try {
            JSON.parse(data);
            return data;
        } catch {
            return JSON.stringify(data);
        }
    }

    if (data instanceof Error) {
        const errorObj = {
            ...data,
            name: data.name,
            message: data.message,
            stack: data.stack,
        };
        return safeStringify(errorObj);
    }

    try {
        return JSON.stringify(data, bigintReplacer);
    } catch {
        return safeStringify(data);
    }
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function bigintReplacer(_key: string, value: any) {
    return typeof value === "bigint" ? value.toString() : value;
}

export function isUON(value: any) {
    if (value === undefined || value === null) {
        return true;
    } else {
        return false;
    }
}