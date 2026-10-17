const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(",").map(s => s.trim()) : true }));
app.use(express.json({ limit: "32kb" }));
const PORT = process.env.PORT || 10000;

function parseYouTubeId(input) {
  let u;
  try { u = new URL(input); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/").filter(Boolean)[0] || null;
  else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else { const p = u.pathname.split("/").filter(Boolean); if (["shorts", "embed", "live"].includes(p[0])) id = p[1] || null; }
  } else return null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

app.get("/", (_req, res) => res.json({ name: "YouTube Backend Starter", status: "running", endpoints: ["/health", "/api/resolve"], note: "Validates YouTube URLs and returns official embed metadata; it does not download YouTube video files." }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "youtube-backend-starter" }));

app.post("/api/resolve", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  const videoId = parseYouTubeId(url);
  if (!videoId) return res.status(400).json({ success: false, message: "Please provide a valid YouTube video, Shorts, or youtu.be URL." });
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(422).json({ success: false, message: "YouTube did not return metadata. The video may be private, unavailable, or restricted." });
    const meta = await response.json();
    return res.json({ success: true, videoId, title: meta.title || "YouTube video", authorName: meta.author_name || "", thumbnail: meta.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, watchUrl: `https://www.youtube.com/watch?v=${videoId}`, embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`, message: "Backend connected: URL validated and metadata retrieved. This starter does not download video files." });
  } catch (error) {
    console.error("Resolve error:", error.message);
    return res.status(502).json({ success: false, message: "Could not reach YouTube metadata service. Please try again later." });
  }
});
app.listen(PORT, "0.0.0.0", () => console.log(`API listening on port ${PORT}`));
