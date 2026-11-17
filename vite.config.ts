/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  base: "./",
  server: {
    // The Go API (server/) runs on :8080; proxying keeps it same-origin, so session cookies just work.
    proxy: { "/api": "http://localhost:8080" },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
