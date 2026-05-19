import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces (darkest -> lightest)
        sidebar: "#000000",
        canvas: "#070b0d",
        card: "#e5e7eb", // light gray panels for readable dark text
        rule: "#6b7280", // medium gray, visible on both light cards and dark canvas

        // Text (ink on dark surfaces — sidebar/canvas)
        // Text inside .bg-card is overridden in globals.css to dark colors.
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
