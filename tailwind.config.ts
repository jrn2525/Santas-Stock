import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        // Bumped scale: xs/sm/base all collapse to 16px for readability.
        xs: ["1rem", { lineHeight: "1.5rem" }],
        sm: ["1rem", { lineHeight: "1.5rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
      },
      colors: {
        // Surfaces (darkest -> lightest)
        sidebar: "#000000",
        canvas: "#070b0d",
        card: "#41494f",
        rule: "#6d7c83",

        // Text (ink on dark surfaces)
        ink: {
          DEFAULT: "#ffffff",
          dim: "#6d7c83",
          muted: "#41494f",
        },

        // Brand reds — all derived from the logo wordmark
        brand: {
          DEFAULT: "#db2d2b",
          hover: "#a41715",
          deep: "#40080a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
