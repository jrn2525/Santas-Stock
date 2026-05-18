import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
