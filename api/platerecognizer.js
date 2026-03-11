// api/platerecognizer.js — FleetBuddy Vercel serverless proxy

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.PLATE_RECOGNIZER_TOKEN;
  if (!token) return res.status(500).json({ error: "PLATE_RECOGNIZER_TOKEN not configured" });

  const contentType = req.headers["content-type"] || "";

  try {
    // Collect raw body
    const rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

    // ── FormData (multipart) → forward directly to Plate Recognizer ──────────
    if (contentType.includes("multipart/form-data")) {
      const response = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": contentType,
        },
        body: rawBody,
      });

      const text = await response.text();
      if (!response.ok) return res.status(response.status).json({ error: text });

      const data = JSON.parse(text);
      const results = data.results || [];
      if (!results.length) return res.json({ found: false, plate: null, score: 0 });

      results.sort((a, b) => (b.score || 0) - (a.score || 0));
      const best = results[0];
      const plate = (best.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

      return res.json({
        found: plate.length >= 2,
        plate: plate.length >= 2 ? plate : null,
        score: best.score || 0,
        region: best.region?.code || null,
      });
    }

    // ── JSON body → base64 image (fallback path) ──────────────────────────────
    if (contentType.includes("application/json")) {
      const { image, mode = "plate" } = JSON.parse(rawBody.toString());
      if (!image) return res.status(400).json({ error: "No image provided" });

      const imageBuffer = Buffer.from(image, "base64");
      const { Blob } = require("buffer");
      const blob = new Blob([imageBuffer], { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("upload", blob, "upload.jpg");

      const endpoint = mode === "vin"
        ? "https://api.platerecognizer.com/v1/vin-reader/"
        : "https://api.platerecognizer.com/v1/plate-reader/";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
        body: formData,
      });

      const text = await response.text();
      if (!response.ok) return res.status(response.status).json({ error: text });
      return res.json(JSON.parse(text));
    }

    return res.status(400).json({ error: "Unsupported content type" });

  } catch (err) {
    console.error("platerecognizer error:", err);
    return res.status(500).json({ error: err.message });
  }
};
