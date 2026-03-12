export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "Missing GEMINI_API_KEY in Vercel environment variables"
      });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const plateImageBase64 = cleanBase64(
      body.plateImageBase64 || body.plateImage || body.plate || null
    );

    const unitImageBase64 = cleanBase64(
      body.unitImageBase64 || body.unitImage || body.unit || null
    );

    const vinImageBase64 = cleanBase64(
      body.vinImageBase64 || body.vinImage || body.vin || null
    );

    const mimeType = body.mimeType || "image/jpeg";

    const results = {
      ok: true,
      plate: {
        found: false,
        value: null,
        state: null,
        confidence: 0,
        error: null
      },
      unit: {
        found: false,
        value: null,
        confidence: 0,
        error: null
      },
      vin: {
        found: false,
        value: null,
        confidence: 0,
        error: null
      },
      model: "gemini-2.5-flash"
    };

    if (plateImageBase64) {
      results.plate = await scanPlate({ apiKey, imageBase64: plateImageBase64, mimeType });
    }

    if (unitImageBase64) {
      results.unit = await scanUnit({ apiKey, imageBase64: unitImageBase64, mimeType });
    }

    if (vinImageBase64) {
      results.vin = await scanVin({ apiKey, imageBase64: vinImageBase64, mimeType });
    }

    return res.status(200).json(results);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Unknown server error"
    });
  }
}

function cleanBase64(value) {
  if (!value || typeof value !== "string") return null;
  return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

async function callGemini({ apiKey, prompt, imageBase64, mimeType }) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      topP: 0.1,
      topK: 1,
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const apiText = await response.text();

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${apiText}`);
  }

  let apiJson;
  try {
    apiJson = JSON.parse(apiText);
  } catch {
    throw new Error(`Gemini API returned non-JSON: ${apiText}`);
  }

  const modelText =
    apiJson?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

  let parsed;
  try {
    parsed = JSON.parse(modelText);
  } catch {
    const match = modelText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`Could not parse model JSON: ${modelText}`);
    }
    parsed = JSON.parse(match[0]);
  }

  return { parsed, raw: modelText };
}

async function scanPlate({ apiKey, imageBase64, mimeType }) {
  const prompt = `
You are a strict vehicle plate recognition service.

Read the main license plate in this image.

Return ONLY valid JSON.
No markdown.
No code fences.
No explanation.

Format:
{
  "found": true,
  "value": "C26137R",
  "state": "WA",
  "confidence": 0.98
}

Rules:
- value must be uppercase
- value must contain only letters and numbers
- remove spaces, dashes, dots, and decorative text
- if unreadable return:
{"found":false,"value":null,"state":null,"confidence":0}
`;

  try {
    const { parsed } = await callGemini({ apiKey, prompt, imageBase64, mimeType });

    let value = parsed?.value ?? null;
    if (typeof value === "string") {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    }

    return {
      found: Boolean(parsed?.found && value),
      value: value || null,
      state: parsed?.state || null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
      error: null
    };
  } catch (error) {
    return {
      found: false,
      value: null,
      state: null,
      confidence: 0,
      error: error.message
    };
  }
}

async function scanUnit({ apiKey, imageBase64, mimeType }) {
  const prompt = `
You are a strict fleet unit number recognition service.

Read only the large vehicle unit number in this image.
The unit number is usually 3 to 5 digits, most often exactly 4 digits.

Return ONLY valid JSON.
No markdown.
No extra text.

Format:
{
  "found": true,
  "value": "1234",
  "confidence": 0.99
}

Rules:
- value must contain digits only
- prefer 4-digit number if clearly visible
- ignore plates, logos, emblems, decorative text, and background text
- if unreadable return:
{"found":false,"value":null,"confidence":0}
`;

  try {
    const { parsed } = await callGemini({ apiKey, prompt, imageBase64, mimeType });

    let value = parsed?.value ?? null;
    if (typeof value === "string") {
      value = value.replace(/\D/g, "");
    }

    return {
      found: Boolean(parsed?.found && value),
      value: value || null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
      error: null
    };
  } catch (error) {
    return {
      found: false,
      value: null,
      confidence: 0,
      error: error.message
    };
  }
}

async function scanVin({ apiKey, imageBase64, mimeType }) {
  const prompt = `
You are a strict VIN recognition service.

Read the vehicle VIN from this image.

Return ONLY valid JSON.
No markdown.
No extra text.

Format:
{
  "found": true,
  "value": "1FTFW1E50PFA12345",
  "confidence": 0.95
}

Rules:
- VIN must be exactly 17 characters
- VIN uses uppercase letters and numbers only
- do not use I, O, or Q in the VIN
- if uncertain, return best effort only if it is still 17 characters
- if unreadable return:
{"found":false,"value":null,"confidence":0}
`;

  try {
    const { parsed } = await callGemini({ apiKey, prompt, imageBase64, mimeType });

    let value = parsed?.value ?? null;
    if (typeof value === "string") {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      value = value.replace(/[IOQ]/g, "");
    }

    const isValidVin = typeof value === "string" && value.length === 17;

    return {
      found: Boolean(parsed?.found && isValidVin),
      value: isValidVin ? value : null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
      error: null
    };
  } catch (error) {
    return {
      found: false,
      value: null,
      confidence: 0,
      error: error.message
    };
  }
}
