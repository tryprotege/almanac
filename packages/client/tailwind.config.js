/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        success: {
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          800: "#065f46",
        },
        warning: {
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
          800: "#92400e",
        },
        error: {
          100: "#fee2e2",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
        },
      },
    },
  },
  plugins: [],
};
