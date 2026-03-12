Absolutely. Here’s the next piece.

# VIN + 4-digit unit number strategy

Do **not** treat plate, VIN, and unit number as one big scan.

Use a **separate pass for each field**:

1. **Plate scan**

   * crop likely plate area
   * short strict prompt

2. **VIN scan**

   * user points camera at dashboard VIN or door sticker
   * send full image or VIN-focused crop
   * strict VIN validation

3. **Unit number scan**

   * crop likely decal/door area if predictable
   * require exactly 4 digits

That keeps the workflow clean and reduces false positives.

---

# VIN rules that matter

A valid VIN:

* is **17 characters**
* uses **letters and numbers**
* does **not** use **I**, **O**, or **Q**

So validate hard before accepting it.

## VIN validator

```javascript
function normalizeVin(text) {
  if (!text) return "";
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function looksLikeValidVin(vin) {
  if (!vin) return false;
  if (vin.length !== 17) return false;
  if (/[IOQ]/.test(vin)) return false;
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
}
```

---

# 4-digit unit number rules

If your unit number must be exactly 4 digits:

```javascript
function normalizeUnitNumber(text) {
  if (!text) return "";
  return text.replace(/\D/g, "").slice(0, 4);
}

function looksLikeValidUnitNumber(unit) {
  return /^\d{4}$/.test(unit);
}
```

---

# Better prompts

## VIN prompt

```javascript
const vinPrompt = `
Read the VIN from this image.

Rules:
- Return JSON only
- No markdown
- No explanation
- VIN must be 17 characters
- VIN cannot contain I, O, or Q
- If not clearly visible, set found false

Return:
{
  "found": true,
  "vin": "",
  "low_confidence": false
}
`;
```

## Unit number prompt

```javascript
const unitPrompt = `
Read the fleet unit number from this image.

Rules:
- Return JSON only
- No markdown
- No explanation
- Return only a 4-digit unit number
- If no clear 4-digit unit number is visible, set found false

Return:
{
  "found": true,
  "unit_number": "",
  "low_confidence": false
}
`;
```

---

# Reusable Gemini scanner

Use one reusable function for all scans.

```javascript
function stripDataUrlPrefix(dataUrl) {
  return dataUrl.split(",")[1];
}

async function scanImageWithGemini(dataUrl, prompt) {
  const base64Image = stripDataUrlPrefix(dataUrl);
  const model = "gemini-1.5-flash";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0
        }
      })
    }
  );

  const json = await response.json();

  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  try {
    return JSON.parse(text);
  } catch {
    return {
      found: false,
      error: "Could not parse Gemini response",
      raw: text
    };
  }
}
```

---

# VIN scan flow

```javascript
async function runVinScan(file) {
  const originalDataUrl = await imageToBase64DataUrl(file);
  const result = await scanImageWithGemini(originalDataUrl, vinPrompt);

  const cleanVin = normalizeVin(result.vin);

  return {
    ...result,
    vin: cleanVin,
    valid: looksLikeValidVin(cleanVin)
  };
}
```

---

# Unit number scan flow

```javascript
async function runUnitScan(file) {
  const originalDataUrl = await imageToBase64DataUrl(file);
  const result = await scanImageWithGemini(originalDataUrl, unitPrompt);

  const cleanUnit = normalizeUnitNumber(result.unit_number);

  return {
    ...result,
    unit_number: cleanUnit,
    valid: looksLikeValidUnitNumber(cleanUnit)
  };
}
```

---

# Suggested FleetBuddy sequence

## Screen 1

Capture plate
If invalid, manual entry fallback

## Screen 2

Capture VIN
If invalid, retake photo or manual entry

## Screen 3

Capture 4-digit unit number
If invalid, retake or manual entry

## Screen 4

Review screen

* plate
* VIN
* unit number
* confirm submit

That’s field-friendly and dead simple.

---

# Quick coaching note for Claude

Copy and paste this exactly:

```text
I need help improving my FleetBuddy camera workflow.

Current issue:
The Gemini API model name was wrong. I need all scan calls updated from models/gemini-1.5-flash-latest to gemini-1.5-flash using the v1beta generateContent endpoint.

What I want you to build:
1. A crop-first license plate scanner
   - Crop likely plate region from browser image using canvas before sending to Gemini
   - Fallback to full image if cropped scan fails
   - Return strict JSON only:
     {
       "found": true,
       "plate": "",
       "state_guess": "",
       "low_confidence": false
     }

2. A VIN scanner
   - Use Gemini vision on image
   - Return strict JSON only:
     {
       "found": true,
       "vin": "",
       "low_confidence": false
     }
   - Validate VIN:
     - exactly 17 chars
     - uppercase letters/numbers only
     - no I, O, or Q

3. A 4-digit unit number scanner
   - Return strict JSON only:
     {
       "found": true,
       "unit_number": "",
       "low_confidence": false
     }
   - Validate exact 4 digits only

4. Reusable scan helper
   - One reusable function for Gemini image scanning
   - temperature 0
   - parse JSON safely
   - handle bad responses gracefully

5. UI flow
   - Step 1 plate
   - Step 2 VIN
   - Step 3 unit number
   - Step 4 review and confirm
   - manual fallback for each field if scan fails

Technical requirements:
- plain JavaScript
- browser-side canvas crop
- fetch to Gemini v1beta generateContent endpoint
- use process.env.GEMINI_API_KEY
- keep code modular and easy to paste into existing Vercel project

Please give me production-clean code with comments showing exactly where to replace or add functions.
```

That should get Claude marching in the right direction instead of wandering around the pasture eating glue.

When you come back, we can build the rest of FleetBuddy the right way.
