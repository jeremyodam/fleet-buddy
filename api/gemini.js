const GEMINI_KEY = "AIzaSyCLiRUCq4R6n9R61hhNxDjn0E7XisKXFUs";
const MODELS = [
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash-latest",
];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body);
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
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(data),
          };
        }
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(data),
        };
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: { message: "All models failed. Last error: " + lastError } }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: e.message } }),
    };
  }
};
