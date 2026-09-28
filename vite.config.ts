/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  base: "./",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
