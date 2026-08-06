import dotenv from "dotenv";

// Local sandbox entry (deployment injects env via docker-compose env_file instead):
// loads .env and optionally overrides the rabbit canister —
//   npm run sandbox                  -> RABBIT_MOTOKO_CANISTER_ID from .env
//   npm run sandbox -- <canister-id> -> the given canister (e.g. production)
//
// Pigeon reads APP_NAME the moment it is imported, so .env loading and the
// override MUST happen before the dynamic import below — keep this file free
// of any other imports.
dotenv.config();

const canisterIdArg = process.argv[2]?.trim();
if (canisterIdArg) {
    if (!/^([a-z0-9]{5}-)+[a-z0-9]{3}$/.test(canisterIdArg)) {
        console.error(`'${canisterIdArg}' does not look like a canister id.`);
        process.exit(1);
    }
    process.env.RABBIT_MOTOKO_CANISTER_ID = canisterIdArg;
}

console.log(`Sandbox mode — rabbit canister: ${process.env.RABBIT_MOTOKO_CANISTER_ID}`);

await import("../src/index.js").catch((err) => {
    console.error(err);
    process.exit(1);
});
