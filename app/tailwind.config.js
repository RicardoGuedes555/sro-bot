/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        // Paleta escura (fundo quase preto, dourado de destaque).
        ink: {
          900: "#0b0d10",
          800: "#111419",
          700: "#161a21",
          600: "#1d222b",
          500: "#262d38",
        },
        line: "#2a313c",
        gold: {
          DEFAULT: "#d4a017",
          soft: "#e8c35a",
        },
        info: "#3b82f6",
        ok: "#22c55e",
        warn: "#f59e0b",
        danger: "#ef4444",
        muted: "#8b94a3",
      },
      fontFamily: {
        mono: ["Consolas", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
