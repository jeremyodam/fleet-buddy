export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { image, mode } = req.body;

  if (!image) {
    return res.status(400).json({ error: "No image provided" });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  const schema = {
    type: "object",
    properties: {
      found: { type: "boolean" },
      plate: { type: "string" },
      unit: { type: "string" },
      vin: { type: "string" }
    }
  };

  let prompt = "";

  if (mode === "plate") {
    prompt = "Extract the license plate text. Return JSON.";
  }

  if (mode === "unit") {
    prompt = "Extract the vehicle unit number. Return JSON.";
  }

  if (mode === "vin") {
    prompt = "Extract the VIN number from the image. Return JSON.";
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

    const data = await response.json();

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.json({ found: false });
    }

    const parsed = JSON.parse(text);

    return res.json(parsed);

  } catch (error) {

    console.error(error);

    return res.json({
      found: false,
      error: error.message
    });
  }
}
