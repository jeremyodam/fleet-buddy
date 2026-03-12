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
        found: false,
        plate: null,
        error: "Missing GEMINI_API_KEY in Vercel environment variables"
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    let imageBase64 =
      body.imageBase64 ||
      body.base64 ||
      body.image ||
      body.photo ||
      null;

    const mimeType =
      body.mimeType ||
      body.type ||
      "image/jpeg";

    if (!imageBase64) {
      return res.status(400).json({
        found: false,
        plate: null,
        error: "No image received"
      });
    }

    // Remove data URL prefix if present
    imageBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

    const prompt = `
You are a vehicle license plate recognition system.

Look at the image and read the license plate.

Return ONLY JSON.

Example:
{
 "found": true,
 "plate": "C26137R",
 "state": "WA",
 "confidence": 0.97
}

Rules:
- plate must be uppercase
- letters and numbers only
- remove spaces or dashes
- if plate cannot be read return:
{"found":false,"plate":null,"state":null,"confidence":0}
`;

    const geminiURL =
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
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(`${geminiURL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const apiText = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        found: false,
        plate: null,
        error: "Gemini request failed",
        raw: apiText
      });
    }

    let apiJSON;

    try {
      apiJSON = JSON.parse(apiText);
    } catch {
      return res.status(500).json({
        found: false,
        plate: null,
        error: "Gemini response not valid JSON",
        raw: apiText
      });
    }

    const modelText =
      apiJSON?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";

    let parsed;

    try {
      parsed = JSON.parse(modelText);
    } catch {

      const match = modelText.match(/\{[\s\S]*\}/);

      if (!match) {
        return res.status(200).json({
          found: false,
          plate: null,
          error: "Could not parse model JSON",
          raw: modelText
        });
      }

      parsed = JSON.parse(match[0]);
    }

    let plate = parsed.plate;

    if (typeof plate === "string") {
      plate = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    }

    return res.status(200).json({
      found: parsed.found && plate ? true : false,
      plate: plate || null,
      state: parsed.state || null,
      confidence: parsed.confidence || null,
      model: "gemini-2.5-flash",
      raw: modelText
    });

  } catch (error) {

    return res.status(500).json({
      found: false,
      plate: null,
      error: error.message
    });

  }
}
