import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        santa: {
          red: "#c8102e",
          green: "#0b6623",
          gold: "#d4af37",
        },
      },
    },
  },
  plugins: [],
};

export default config;
