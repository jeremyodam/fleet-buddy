export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { mode, image } = req.body || {};
  if (!image) return res.status(400).json({ error: "No image provided" });
  if (!mode)  return res.status(400).json({ error: "No mode provided" });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

  async function askGemini(prompt, maxTokens = 30) {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: "image/jpeg", data: image } },
          { text: prompt }
        ]}],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0 }
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  }

  // ── PLATE ────────────────────────────────────────────────────────────────────
  if (mode === "plate") {
    try {
      const raw = await askGemini(
        `Read the license plate in this photo. Return ONLY the plate characters — no spaces, no state name, no punctuation. WA plates = 7 chars. OR plates = 5-7 chars. If unreadable return NOTFOUND.`
      );
      const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!clean || clean === "NOTFOUND" || clean.length < 4)
        return res.json({ found: false, plate: null, raw, clean, reason: "too short or NOTFOUND" });
      return res.json({ found: true, plate: clean, raw });
    } catch(e) {
      return res.json({ found: false, plate: null, error: e.message });
    }
  }

  // ── UNIT NUMBER ──────────────────────────────────────────────────────────────
  if (mode === "unit") {
    try {
      const raw = await askGemini(
        `Find the fleet unit number on this vehicle. It is a 4-digit number painted or stickered on the door, hood, or cab. NOT the license plate. NOT the VIN. Return ONLY the digits. If not found return NOTFOUND.`,
        10
      );
      const clean = raw.replace(/[^0-9]/g, "");
      if (!clean || clean.length < 3 || clean.length > 6)
        return res.json({ found: false, unit: null, raw });
      return res.json({ found: true, unit: clean });
    } catch(e) {
      return res.json({ found: false, unit: null, error: e.message });
    }
  }

  // ── VIN ──────────────────────────────────────────────────────────────────────
  if (mode === "vin") {
    try {
      const raw = await askGemini(
        `Find the VIN in this photo. Exactly 17 characters, only A-H, J-N, P-Z and 0-9 (never I, O, or Q). Usually on door jamb sticker or dashboard plate. Return ONLY the 17 characters. If not found return NOTFOUND.`,
        30
      );
      const clean = raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
      if (clean.length !== 17)
        return res.json({ found: false, vin: null, raw, cleanLength: clean.length });
      return res.json({ found: true, vin: clean });
    } catch(e) {
      return res.json({ found: false, vin: null, error: e.message });
    }
  }

  return res.status(400).json({ error: `Unknown mode: ${mode}` });
}
