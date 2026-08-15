import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        orange: "rgb(var(--orange) / <alpha-value>)",
        green: "rgb(var(--green) / <alpha-value>)",
      },
      fontFamily: {
        display: [
          "ui-rounded",
          "SF Pro Rounded",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        body: ["Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "22px",
      },
    },
  },
  plugins: [],
};

export default config;
