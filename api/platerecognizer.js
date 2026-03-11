export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { mode, image } = req.body || {};
  if (!image) return res.status(400).json({ error: "No image provided" });

  // ── PLATE (Plate Recognizer) ──────────────────────────────────
  if (mode === "plate") {
    const prKey = process.env.PLATE_RECOGNIZER_KEY;
    if (!prKey) return res.status(500).json({ error: "PLATE_RECOGNIZER_KEY not configured" });
    try {
      const binary = Buffer.from(image, "base64");
      const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
      const parts = [
        `--${boundary}\r\nContent-Disposition: form-data; name="upload"; filename="plate.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
        binary,
        `\r\n--${boundary}--\r\n`
      ];
      const body = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
      const response = await fetch("https://api.platerecognizer.com/v1/plate-reader/", {
        method: "POST",
        headers: {
          "Authorization": `Token ${prKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const data = await response.json();
      const result = data.results?.[0];
      if (result?.plate) {
        return res.json({ found: true, plate: result.plate.toUpperCase(), confidence: result.score });
      }
      return res.json({ found: false, plate: null });
    } catch(e) {
      return res.json({ found: false, plate: null, error: e.message });
    }
  }

  // ── VIN (Gemini) ──────────────────────────────────────────────
  if (mode === "vin") {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    const MODELS = ["gemini-2.0-flash", "gemini-1.5-pro-latest", "gemini-1.5-flash-latest"];
    let lastError = "";
    for (const model of MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: "image/jpeg", data: image } },
              { text: "TASK: Find the 17-character VIN in this image.\nVIN RULES: Exactly 17 chars. Valid: A-H, J-N, P-Z, 0-9. NEVER I, O, or Q.\nLocation: driver-side door jamb sticker or dashboard plate.\nIgnore: license plates, unit numbers, barcodes.\nIf a char is unclear, make your best guess using VIN position rules.\nReturn ONLY the 17 characters. No spaces, dashes, labels.\nIf no VIN found: NOTFOUND" }
            ]}],
            generationConfig: { maxOutputTokens: 30, temperature: 0 }
          }),
        });
        const data = await response.json();
        if (data.error) { lastError = data.error.message; continue; }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        const vin = text.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
        if (vin.length === 17) return res.json({ found: true, vin });
        lastError = "Got " + vin.length + " chars: " + vin;
      } catch(e) { lastError = e.message; }
    }
    return res.json({ found: false, vin: null, error: lastError });
  }

  // ── UNIT NUMBER (Gemini) ──────────────────────────────────────
  if (mode === "unit") {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: "image/jpeg", data: image } },
            { text: "Find the fleet unit number painted or stickered on this vehicle — on the door, hood, or cab. It is a short number (2-6 digits), NOT the license plate and NOT the VIN. Return ONLY the digits. If not found return NOTFOUND." }
          ]}],
          generationConfig: { maxOutputTokens: 10, temperature: 0 }
        }),
      });
      const data = await response.json();
      if (data.error) return res.json({ found: false, unit: null, error: data.error.message });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      const unit = text.replace(/NOTFOUND/i, "").replace(/[^0-9A-Z]/gi, "");
      if (unit.length >= 2 && unit.length <= 6) return res.json({ found: true, unit });
      return res.json({ found: false, unit: null });
    } catch(e) {
      return res.json({ found: false, unit: null, error: e.message });
    }
  }

  return res.status(400).json({ error: "Unknown mode: " + mode });
}
