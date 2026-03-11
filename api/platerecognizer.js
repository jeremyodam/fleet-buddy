// api/platerecognizer.js
export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { image, mode = "plate", regions } = req.body;
    if (!image) return res.status(400).json({ error: "No image provided" });

    const imageBuffer = Buffer.from(image, "base64");
    const blob = new Blob([imageBuffer], { type: "image/jpeg" });

    // ── PLATE ─────────────────────────────────────────────────────
    if (mode === "plate") {
      const token = process.env.PLATE_RECOGNIZER_TOKEN;
      if (!token) return res.status(500).json({ error: "PLATE_RECOGNIZER_TOKEN not configured" });
      const formData = new FormData();
      formData.append("upload", blob, "plate.jpg");
      formData.append("regions", "us-or");
      formData.append("regions", "us-wa");
      formData.append("regions", "us");
      if (regions) regions.forEach(r => formData.append("regions", r));
      formData.append("config", JSON.stringify({
        mode: "accurate",
        threshold_d: 0.1,
        threshold_o: 0.1,
        max_characters: 8,
        min_characters: 5
      }));
      const response = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
        body: formData,
      });
      if (!response.ok) return res.status(response.status).json({ error: await response.text() });
      const data = await response.json();
      const results = data.results || [];
      if (!results.length) return res.json({ found: false, plate: null });
      results.sort((a, b) => (b.score || 0) - (a.score || 0));
      const best = results[0];
      const plate = best.plate?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
      return res.json({
        found: !!plate,
        plate,
        confidence: Math.round((best.score || 0) * 100),
        region: best.region?.code || null
      });
    }

    // ── VIN ───────────────────────────────────────────────────────
    if (mode === "vin") {
      const token = process.env.PLATE_RECOGNIZER_TOKEN;
      if (!token) return res.status(500).json({ error: "PLATE_RECOGNIZER_TOKEN not configured" });
      const formData = new FormData();
      formData.append("upload", blob, "vin.jpg");
      const response = await fetch("https://api.platerecognizer.com/v1/vin-reader/", {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
        body: formData,
      });
      if (!response.ok) return res.status(response.status).json({ error: await response.text() });
      const data = await response.json();
      const vin = data.results?.[0]?.vin?.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "") || null;
      return res.json({
        found: !!(vin && vin.length === 17),
        vin: vin?.length === 17 ? vin : null,
        confidence: Math.round((data.results?.[0]?.score || 0) * 100)
      });
    }

    // ── UNIT NUMBER (Gemini) ──────────────────────────────────────
    if (mode === "unit") {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: "image/jpeg", data: image } },
              { text: "Find the fleet UNIT NUMBER painted or stickered on this vehicle — a short 2-6 digit number on the door, hood, or cab. It is NOT the license plate and NOT the VIN. Return ONLY the digits. If no unit number is visible, return NOTFOUND." }
            ]}],
            generationConfig: { maxOutputTokens: 20, temperature: 0 }
          }),
        });
        const data = await response.json();
        if (data.error) return res.json({ found: false, unit: null, error: data.error.message });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        const unit = text.toUpperCase().replace(/[^A-Z0-9\-]/g, "");
        if (unit && unit !== "NOTFOUND" && unit.length >= 1) return res.json({ found: true, unit });
        return res.json({ found: false, unit: null });
      } catch(e) {
        return res.json({ found: false, unit: null, error: e.message });
      }
    }

    return res.status(400).json({ error: "Invalid mode. Use 'plate', 'vin', or 'unit'" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
