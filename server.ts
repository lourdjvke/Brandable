import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API proxy route
  app.post("/api/link-preview", async (req, res) => {
    try {
      const { url } = req.body;
      const apiKey = "6deecf06e6abcbcdcdffee2d7c77f845";

      const response = await fetch("https://api.linkpreview.net", {
        method: "POST",
        mode: "cors",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: apiKey, q: url })
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Link preview error:", error);
      res.status(500).json({ error: "Failed to fetch link preview" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve dist or handle as needed
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
