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

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;

  // ── Core Gemini call — always asks for JSON back ──────────────────────────
  async function scanWithGemini(prompt) {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/jpeg", data: image } }
        ]}],
        generationConfig: { temperature: 0, maxOutputTokens: 100 }
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    // Strip markdown code fences if Gemini wraps it
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(clean);
    } catch {
      return { found: false, error: "Could not parse response", raw: text };
    }
  }

  // ── PLATE ─────────────────────────────────────────────────────────────────
  if (mode === "plate") {
    try {
      const result = await scanWithGemini(`
Read the license plate in this photo.
Return JSON only. No markdown. No explanation.
WA plates are 7 characters. OR plates are 5-7 characters.
If you cannot clearly read the plate set found to false.

{
  "found": true,
  "plate": "",
  "low_confidence": false
}`);
      if (!result.found || !result.plate) {
        return res.json({ found: false, plate: null, raw: result.raw, error: result.error });
      }
      const clean = result.plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (clean.length < 4) {
        return res.json({ found: false, plate: null, raw: result.plate, reason: "too short" });
      }
      return res.json({ found: true, plate: clean, low_confidence: result.low_confidence || false });
    } catch(e) {
      return res.json({ found: false, plate: null, error: e.message });
    }
  }

  // ── UNIT NUMBER ───────────────────────────────────────────────────────────
  if (mode === "unit") {
    try {
      const result = await scanWithGemini(`
Read the fleet unit number from this photo.
It is a 4-digit number painted or stickered on the door, hood, or cab.
It is NOT the license plate and NOT the VIN.
Return JSON only. No markdown. No explanation.
If no clear 4-digit number is visible set found to false.

{
  "found": true,
  "unit_number": "",
  "low_confidence": false
}`);
      if (!result.found || !result.unit_number) {
        return res.json({ found: false, unit: null, raw: result.raw });
      }
      const clean = String(result.unit_number).replace(/\D/g, "").slice(0, 6);
      if (clean.length < 3) {
        return res.json({ found: false, unit: null, raw: result.unit_number, reason: "too short" });
      }
      return res.json({ found: true, unit: clean, low_confidence: result.low_confidence || false });
    } catch(e) {
      return res.json({ found: false, unit: null, error: e.message });
    }
  }

  // ── VIN ───────────────────────────────────────────────────────────────────
  if (mode === "vin") {
    try {
      const result = await scanWithGemini(`
Read the Vehicle Identification Number (VIN) from this photo.
VIN rules: exactly 17 characters, only letters A-H J-N P-Z and digits 0-9. Never I, O, or Q.
Usually on the driver-side door jamb sticker or dashboard plate.
Return JSON only. No markdown. No explanation.
If you cannot clearly read a valid VIN set found to false.

{
  "found": true,
  "vin": "",
  "low_confidence": false
}`);
      if (!result.found || !result.vin) {
        return res.json({ found: false, vin: null, raw: result.raw });
      }
      const clean = result.vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
      if (clean.length !== 17) {
        return res.json({ found: false, vin: null, raw: result.vin, cleanLength: clean.length, reason: "not 17 chars" });
      }
      return res.json({ found: true, vin: clean, low_confidence: result.low_confidence || false });
    } catch(e) {
      return res.json({ found: false, vin: null, error: e.message });
    }
  }

  return res.status(400).json({ error: `Unknown mode: ${mode}` });
}
