// api/platerecognizer.js
// Vercel serverless proxy for Plate Recognizer Snapshot Cloud API
// Handles both license plate reading and VIN OCR

export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.PLATE_RECOGNIZER_TOKEN;
  if (!token) return res.status(500).json({ error: "PLATE_RECOGNIZER_TOKEN not configured" });

  try {
    const { image, mode = "plate", regions } = req.body;
    if (!image) return res.status(400).json({ error: "No image provided" });

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(image, "base64");
    const blob = new Blob([imageBuffer], { type: "image/jpeg" });

    if (mode === "plate") {
      // ── License Plate Recognition ──────────────────────────────
      const formData = new FormData();
      formData.append("upload", blob, "plate.jpg");
      // Bias toward OR and WA plates
      formData.append("regions", "us-or");
      formData.append("regions", "us-wa");
      if (regions) regions.forEach(r => formData.append("regions", r));
      formData.append("config", JSON.stringify({ mode: "fast" }));

      const response = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();

      // Extract best result
      const results = data.results || [];
      if (!results.length) return res.json({ found: false, plate: null });

      // Sort by confidence, take best
      results.sort((a, b) => (b.score || 0) - (a.score || 0));
      const best = results[0];
      const plate = best.plate?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
      const confidence = Math.round((best.score || 0) * 100);

      return res.json({
        found: !!plate,
        plate,
        confidence,
        region: best.region?.code || null,
        raw: best,
      });

    } else if (mode === "vin") {
      // ── VIN OCR ────────────────────────────────────────────────
      const formData = new FormData();
      formData.append("upload", blob, "vin.jpg");

      const response = await fetch("https://api.platerecognizer.com/v1/vin-reader/", {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();

      // Extract VIN from response
      const vin = data.results?.[0]?.vin?.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "") || null;
      const confidence = Math.round((data.results?.[0]?.score || 0) * 100);

      return res.json({
        found: !!(vin && vin.length === 17),
        vin: vin && vin.length === 17 ? vin : null,
        vinRaw: vin,
        confidence,
      });
    }

    return res.status(400).json({ error: "Invalid mode. Use 'plate' or 'vin'" });

  } catch (err) {
    console.error("platerecognizer error:", err);
    return res.status(500).json({ error: err.message });
  }
}
