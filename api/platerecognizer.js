export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { image, mode } = req.body;

  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    console.error("[FleetBuddy] GEMINI_API_KEY environment variable is not set");
    return res.status(500).json({ found: false, error: "Server configuration error — API key missing. Contact your administrator." });
  }

  let schema, prompt;

  if (mode === "plate") {
    schema = {
      type: "object",
      properties: {
        found: { type: "boolean", description: "true if a license plate was detected" },
        plate: { type: "string", description: "The license plate text, uppercase, no spaces or dashes" }
      },
      required: ["found"]
    };
    prompt = "Look at this image and find any vehicle license plate. Extract the plate text exactly as printed — uppercase letters and numbers only, no spaces or dashes. Set found=true if you can read a plate, false otherwise. Return JSON with {found, plate}.";
  } else if (mode === "unit") {
    schema = {
      type: "object",
      properties: {
        found: { type: "boolean", description: "true if a unit number was detected" },
        unit: { type: "string", description: "The vehicle unit number" }
      },
      required: ["found"]
    };
    prompt = "Look at this image and find a vehicle unit number (typically a 3-6 digit number printed on the door, hood, or bumper of a fleet vehicle). Set found=true if you can read a unit number, false otherwise. Return JSON with {found, unit}.";
  } else if (mode === "vin") {
    schema = {
      type: "object",
      properties: {
        found: { type: "boolean", description: "true if a VIN was detected" },
        vin: { type: "string", description: "The 17-character VIN" }
      },
      required: ["found"]
    };
    prompt = "Look at this image and find the Vehicle Identification Number (VIN). A VIN is exactly 17 characters long, using uppercase letters (excluding I, O, Q) and digits. Set found=true if you can read a valid 17-character VIN, false otherwise. Return JSON with {found, vin}.";
  } else {
    return res.status(400).json({ error: `Unknown mode: ${mode}` });
  }

  try {

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[FleetBuddy] Gemini API returned HTTP ${response.status}:`, errBody);

      if (response.status === 429) {
        return res.status(429).json({ found: false, error: "AI service is busy. Please wait a moment and try again." });
      }
      if (response.status === 403) {
        return res.status(500).json({ found: false, error: "AI service access denied. The API key may be invalid or expired." });
      }
      return res.status(502).json({ found: false, error: `AI service error (HTTP ${response.status}). Try again shortly.` });
    }

    const data = await response.json();

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      const blockReason = data?.candidates?.[0]?.finishReason;
      console.warn("[FleetBuddy] Gemini returned no text. Finish reason:", blockReason);
      return res.json({ found: false, error: "AI could not process this image. Try a clearer photo." });
    }

    const parsed = JSON.parse(text);

    return res.json(parsed);

  } catch (error) {

    console.error("[FleetBuddy] Unexpected error:", error);

    if (error instanceof SyntaxError) {
      return res.json({ found: false, error: "AI returned an unexpected response. Please try again." });
    }

    return res.status(500).json({
      found: false,
      error: "Something went wrong processing your image. Please try again."
    });
  }
}
