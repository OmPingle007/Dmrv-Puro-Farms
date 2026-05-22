import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import apiRouter from "./server/api.js";
import { initDb, seedDb } from "./server/db.js";

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let dbInitPromise: Promise<void> | null = null;
app.use("/api", async (req, res, next) => {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        await initDb();
        await seedDb();
      } catch (e) {
        console.error("DB Init Error:", e);
        // Clear promise so we can retry on next request
        dbInitPromise = null;
        throw e;
      }
    })();
  }
  try {
    await dbInitPromise;
    next();
  } catch (e) {
    res.status(500).json({ error: "DB Init failed. Check Vercel Env Vars for TURSO_DATABASE_URL and TURSO_AUTH_TOKEN." });
  }
}, apiRouter);

// Export app for Vercel
export default app;

// Only start the server if we are NOT in a serverless environment like Vercel
if (!process.env.VERCEL) {
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    (async () => {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    })();
  } else {
    // Production (non-Vercel, like Render or Cloud Run)
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}
