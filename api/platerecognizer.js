export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { mode, image } = req.body || {};
  if (!image) return res.status(400).json({ error: "No image provided" });
  if (!mode) return res.status(400).json({ error: "No mode provided" });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({
      found: false,
      error: "GEMINI_API_KEY not configured",
      errorType: "missing_api_key",
    });
  }

  const GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ];

  async function callGemini(model, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 120,
        },
      }),
    });

    const rawText = await response.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Gemini returned non-JSON: ${rawText.slice(0, 500)}`);
    }

    if (!response.ok || data.error) {
      const message = data?.error?.message || `Gemini HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.raw = data;
      throw err;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return { text, raw: data };
  }

  async function scanWithGemini(prompt) {
    let lastError = null;

    for (const model of GEMINI_MODELS) {
      try {
        const { text, raw } = await callGemini(model, prompt);
        const clean = text.replace(/```json|```/g, "").trim();

        try {
          const parsed = JSON.parse(clean);
          parsed._debugModel = model;
          return parsed;
        } catch {
          return {
            found: false,
            error: "Could not parse response",
            raw: text,
            _debugModel: model,
            _debugRaw: raw,
          };
        }
      } catch (err) {
        lastError = err;

        const msg = String(err.message || "").toLowerCase();
        const shouldTryNextModel =
          msg.includes("not found") ||
          msg.includes("not supported") ||
          msg.includes("model") ||
          err.status === 404;

        if (!shouldTryNextModel) break;
      }
    }

    const msg = String(lastError?.message || "Unknown Gemini error").toLowerCase();

    let errorType = "gemini_error";
    if (msg.includes("api key")) errorType = "missing_api_key";
    else if (
      msg.includes("quota") ||
      msg.includes("rate limit") ||
      lastError?.status === 429
    ) {
      errorType = "quota_exceeded";
    } else if (
      msg.includes("not found") ||
      msg.includes("not supported") ||
      msg.includes("model")
    ) {
      errorType = "invalid_model";
    }

    return {
      found: false,
      error: lastError?.message || "Unknown Gemini error",
      errorType,
    };
  }

  if (mode === "plate") {
    try {
      const result = await scanWithGemini(`
Read the license plate in this photo.
Return JSON only. No markdown. No explanation.
WA plates are usually 7 characters. OR plates are usually 5-7 characters.
Prefer the clearest full plate text visible.
If you cannot clearly read the plate, set found to false.

{
  "found": true,
  "plate": "",
  "low_confidence": false
}`);

      if (!result.found || !result.plate) {
        return res.json({
          found: false,
          plate: null,
          error: result.error || null,
          errorType: result.errorType || null,
          raw: result.raw || null,
          model: result._debugModel || null,
        });
      }

      const clean = result.plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (clean.length < 4) {
        return res.json({
          found: false,
          plate: null,
          reason: "too_short",
          raw: result.plate,
          model: result._debugModel || null,
        });
      }

      return res.json({
        found: true,
        plate: clean,
        low_confidence: !!result.low_confidence,
        model: result._debugModel || null,
      });
    } catch (e) {
      return res.json({
        found: false,
        plate: null,
        error: e.message,
        errorType: "server_error",
      });
    }
  }

  if (mode === "unit") {
    try {
      const result = await scanWithGemini(`
Read the fleet unit number from this photo.
It is a 4-digit number painted or stickered on the door, hood, or cab.
It is NOT the license plate and NOT the VIN.
Return JSON only. No markdown. No explanation.
If no clear unit number is visible, set found to false.

{
  "found": true,
  "unit_number": "",
  "low_confidence": false
}`);

      if (!result.found || !result.unit_number) {
        return res.json({
          found: false,
          unit: null,
          error: result.error || null,
          errorType: result.errorType || null,
          raw: result.raw || null,
          model: result._debugModel || null,
        });
      }

      const clean = String(result.unit_number).replace(/\D/g, "").slice(0, 6);
      if (clean.length < 3) {
        return res.json({
          found: false,
          unit: null,
          reason: "too_short",
          raw: result.unit_number,
          model: result._debugModel || null,
        });
      }

      return res.json({
        found: true,
        unit: clean,
        low_confidence: !!result.low_confidence,
        model: result._debugModel || null,
      });
    } catch (e) {
      return res.json({
        found: false,
        unit: null,
        error: e.message,
        errorType: "server_error",
      });
    }
  }

  if (mode === "vin") {
    try {
      const result = await scanWithGemini(`
Read the Vehicle Identification Number (VIN) from this photo.
VIN rules: exactly 17 characters, using letters A-H, J-N, P, R-Z and digits 0-9.
Never include I, O, or Q.
Usually on the driver-side door jamb sticker or dashboard plate.
Return JSON only. No markdown. No explanation.
If you cannot clearly read a valid VIN, set found to false.

{
  "found": true,
  "vin": "",
  "low_confidence": false
}`);

      if (!result.found || !result.vin) {
        return res.json({
          found: false,
          vin: null,
          error: result.error || null,
          errorType: result.errorType || null,
          raw: result.raw || null,
          model: result._debugModel || null,
        });
      }

      const clean = result.vin
        .toUpperCase()
        .replace(/[^A-HJ-NPR-Z0-9]/g, "");

      if (clean.length !== 17) {
        return res.json({
          found: false,
          vin: null,
          reason: "not_17_chars",
          raw: result.vin,
          cleanLength: clean.length,
          model: result._debugModel || null,
        });
      }

      return res.json({
        found: true,
        vin: clean,
        low_confidence: !!result.low_confidence,
        model: result._debugModel || null,
      });
    } catch (e) {
      return res.json({
        found: false,
        vin: null,
        error: e.message,
        errorType: "server_error",
      });
    }
  }

  return res.status(400).json({ error: `Unknown mode: ${mode}` });
}
