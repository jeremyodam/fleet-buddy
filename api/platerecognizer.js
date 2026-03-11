// api/platerecognizer.js — FleetBuddy Vercel serverless proxy
// Plate Recognizer: plates via FormData passthrough, VIN via base64 JSON

export const config = {
  api: {
    bodyParser: false, // We handle raw body ourselves
    sizeLimit: "10mb",
  },
};

// Read raw body as buffer
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.PLATE_RECOGNIZER_TOKEN;
  if (!token) return res.status(500).json({ error: "PLATE_RECOGNIZER_TOKEN not configured" });

  const contentType = req.headers["content-type"] || "";

  try {
    // ── FormData (multipart) → plate scan ─────────────────────────────────────
    // Client sends FormData directly. We forward it with auth header injected.
    if (contentType.includes("multipart/form-data")) {
      const rawBody = await getRawBody(req);

      const response = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": contentType, // preserve multipart boundary
        },
        body: rawBody,
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();

      // Sort by confidence, return best result
      const results = data.results || [];
      if (!results.length) return res.json({ found: false, plate: null, results: [] });

      results.sort((a, b) => (b.score || 0) - (a.score || 0));
      const best = results[0];
      const plate = best.plate?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;

      return res.json({
        found: !!plate && plate.length >= 2,
        plate,
        score: best.score || 0,
        region: best.region?.code || null,
        results,
      });
    }

    // ── JSON body → VIN or plate via base64 (fallback path) ──────────────────
    if (contentType.includes("application/json")) {
      const rawBody = await getRawBody(req);
      const { image, mode = "vin" } = JSON.parse(rawBody.toString());
      if (!image) return res.status(400).json({ error: "No image provided" });

      const imageBuffer = Buffer.from(image, "base64");
      const blob = new Blob([imageBuffer], { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("upload", blob, "upload.jpg");

      const endpoint = mode === "plate"
        ? "https://api.platerecognizer.com/v1/plate-reader/"
        : "https://api.platerecognizer.com/v1/vin-reader/";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      return res.json(await response.json());
    }

    return res.status(400).json({ error: "Unsupported content type" });

  } catch (err) {
    console.error("platerecognizer error:", err);
    return res.status(500).json({ error: err.message });
  }
}
