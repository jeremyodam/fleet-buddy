const MODELS = [
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash-latest",
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: { message: "GEMINI_API_KEY not configured" } });

  try {
    const body = req.body;
    let lastError = "";

    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (data.error) {
          lastError = data.error.message;
          if (data.error.message.includes("not found") ||
              data.error.message.includes("no longer available") ||
              data.error.message.includes("not supported")) {
            continue;
          }
          return res.status(200).json(data);
        }
        // Success!
        return res.status(200).json(data);
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    return res.status(200).json({ error: { message: "All models failed. Last error: " + lastError } });
  } catch (e) {
    return res.status(500).json({ error: { message: e.message } });
  }
}
