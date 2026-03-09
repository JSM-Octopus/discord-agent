import { createDefaultPreset } from 'ts-jest';

const defaultPreset = createDefaultPreset();

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
    ...defaultPreset,
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'], // Informujemy Jesta, że pliki .ts to ESM
    moduleNameMapper: {
        // Wsparcie dla rozszerzeń .js w importach TypeScriptowych
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true, // KLUCZOWE: wymuszenie użycia ESM przez ts-jest
            },
        ],
    },
};