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

  // Try models in order until one works — covers both old and new API keys
  const MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-001",
    "gemini-1.5-pro-latest",
  ];

  async function askGemini(prompt, maxTokens = 20) {
    let lastError = "";
    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      try {
        const response = await fetch(url, {
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
        if (data.error) {
          lastError = `${model}: ${data.error.message}`;
          continue; // try next model
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        return { text, model };
      } catch(e) {
        lastError = `${model}: ${e.message}`;
      }
    }
    throw new Error("No working model found. Last error: " + lastError);
  }

  // ── MODE: plate ─────────────────────────────────────────────────────────────
  // WA plates: 7 characters (e.g. D84018 or ABC1234)
  // OR plates: 5–7 characters (e.g. 123ABC or ABC123)
  if (mode === "plate") {
    try {
      const result = await askGemini(
        `Read the license plate in this photo. Return ONLY the plate characters exactly as they appear — no spaces, no state name, no punctuation, no extra words. Washington plates are typically 7 characters. Oregon plates are typically 5-7 characters. If you cannot read the plate, return NOTFOUND.`,
        20
      );
      const raw = result.text;
      const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!clean || clean === "NOTFOUND" || clean.length < 4) {
        return res.json({ found: false, plate: null, raw, clean, model: result.model, reason: "too short or NOTFOUND" });
      }
      return res.json({ found: true, plate: clean, raw, model: result.model });
    } catch (e) {
      return res.json({ found: false, plate: null, error: e.message });
    }
  }

  // ── MODE: unit ──────────────────────────────────────────────────────────────
  // NW Natural fleet unit numbers: 4 digits painted/stickered on door or hood
  if (mode === "unit") {
    try {
      const result = await askGemini(
        `This is a photo of a utility fleet vehicle. Find the unit number — it is a 4-digit number painted or stickered on the door, hood, or cab of the truck. It is NOT the license plate and NOT the VIN. Return ONLY the 4 digits. If you cannot find a 4-digit unit number, return NOTFOUND.`,
        10
      );
      const raw = result.text;
      const clean = raw.replace(/[^0-9]/g, "");
      if (!clean || clean.length < 3 || clean.length > 6) {
        return res.json({ found: false, unit: null, raw, model: result.model });
      }
      return res.json({ found: true, unit: clean, model: result.model });
    } catch (e) {
      return res.json({ found: false, unit: null, error: e.message });
    }
  }

  // ── MODE: vin ───────────────────────────────────────────────────────────────
  // VINs: exactly 17 characters, no I, O, or Q
  if (mode === "vin") {
    try {
      const result = await askGemini(
        `Find the Vehicle Identification Number (VIN) in this photo. The VIN is exactly 17 characters using only letters A-H, J-N, P-Z and digits 0-9 (never I, O, or Q). It is usually on a sticker on the driver-side door jamb or on a plate visible through the windshield. Return ONLY the 17 characters, no spaces or dashes. If you cannot find it, return NOTFOUND.`,
        30
      );
      const raw = result.text;
      const clean = raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
      if (clean.length !== 17) {
        return res.json({ found: false, vin: null, raw, cleanLength: clean.length, model: result.model });
      }
      return res.json({ found: true, vin: clean, model: result.model });
    } catch (e) {
      return res.json({ found: false, vin: null, error: e.message });
    }
  }

  return res.status(400).json({ error: `Unknown mode: ${mode}` });
}
