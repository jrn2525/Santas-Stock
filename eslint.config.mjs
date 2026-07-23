// Flat ESLint config for Next.js 16 (ESLint 9). `next lint` was removed in
// Next 16, so `npm run lint` now runs `eslint .` against this config, which
// composes Next's core-web-vitals + TypeScript flat presets.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Allow intentionally-unused args/vars prefixed with _ (e.g. the unused
      // prevState first arg of a form action).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default config;
