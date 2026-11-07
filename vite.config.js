import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The /job, /firm, /tech, and /location pages are static files that
// prerenderSeo.mjs writes into dist/ at build time, so the dev server has no
// routes for them and clicks fall into the SPA fallback. Serve them (and the
// hashed assets they reference) from the last build instead. Dev-only; pages
// are as fresh as the last `bun run build`.
const servePrerendered = () => ({
  name: "serve-prerendered-from-dist",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? "").split("?")[0];
      if (!/^\/quant\/(?:(?:job|firm|tech|location)\/|assets\/)/.test(path)) return next();
      let file = resolve(__dirname, "dist", decodeURIComponent(path.slice(1)));
      if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, "index.html");
      if (!existsSync(file)) return next();
      res.setHeader(
        "content-type",
        file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html",
      );
      res.end(readFileSync(file));
    });
  },
});

// Served at www.kadoa.com/quant via the kadoa dashboard's reverse proxy
// (see kadoa-backend apps/dashboard/next.config.mjs). The site lives
// natively under /quant/: `base` prefixes all asset URLs and the build
// output sits in dist/quant/ so the proxy needs no path rewriting.
export default defineConfig({
  base: "/quant/",
  plugins: [react(), servePrerendered()],
  server: { port: 5181 },
  build: {
    outDir: "dist/quant",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        techStack: resolve(__dirname, "tech-stack.html"),
        stacks: resolve(__dirname, "stacks.html"),
        locations: resolve(__dirname, "locations.html"),
        internships: resolve(__dirname, "internships.html"),
        insights: resolve(__dirname, "insights.html"),
        about: resolve(__dirname, "about.html"),
      },
    },
  },
});
