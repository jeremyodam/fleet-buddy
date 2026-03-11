// ── VIN (Gemini) ──────────────────────────────────────────────
    if (mode === "vin") {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: "image/jpeg", data: image } },
              { text: "Find the VIN in this image. It will be labeled 'VIN' and is exactly 17 characters using only letters A-H, J-N, P-Z and digits 0-9 (never I, O, or Q). Return ONLY the 17 characters, no spaces, no dashes, no label. If not found return NOTFOUND." }
            ]}],
            generationConfig: { maxOutputTokens: 30, temperature: 0 }
          }),
        });
        const data = await response.json();
        if (data.error) return res.json({ found: false, vin: null, error: data.error.message });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        const vin = text.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
        if (vin.length === 17) return res.json({ found: true, vin });
        return res.json({ found: false, vin: null });
      } catch(e) {
        return res.json({ found: false, vin: null, error: e.message });
      }
    }

    // ── UNIT NUMBER (Gemini) ──────────────────────────────────────
    if (mode === "unit") {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: "image/jpeg", data: image } },
              { text: "Find the 4-digit fleet unit number painted or stickered on this vehicle — on the door, hood, or cab. It is NOT the license plate and NOT the VIN. Return ONLY the 4 digits. If not found return NOTFOUND." }
            ]}],
            generationConfig: { maxOutputTokens: 10, temperature: 0 }
          }),
        });
        const data = await response.json();
        if (data.error) return res.json({ found: false, unit: null, error: data.error.message });
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        const unit = text.replace(/[^0-9]/g, "");
        if (unit.length === 4) return res.json({ found: true, unit });
        return res.json({ found: false, unit: null });
      } catch(e) {
        return res.json({ found: false, unit: null, error: e.message });
      }
    }
