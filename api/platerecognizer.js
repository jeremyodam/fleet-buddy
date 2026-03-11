<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<title>FleetBuddy</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Barlow+Condensed:wght@400;600;700;800&display=swap" rel="stylesheet" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js"></script>
<style>
  :root {
    --cyan:    #00d4ff;
    --amber:   #ffb800;
    --green:   #00e87a;
    --red:     #ff4444;
    --bg:      #07090d;
    --surface: #0c1018;
    --surface2:#111823;
    --border:  #1c2636;
    --border2: #243044;
    --text:    #d8e4f0;
    --muted:   #4a6180;
    --mono:    'IBM Plex Mono', monospace;
    --display: 'Barlow Condensed', sans-serif;
    --body:    'Rajdhani', sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: var(--bg);
    min-height: 100vh;
    font-family: var(--body);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(0,212,255,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,212,255,0.02) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }
  #root { position: relative; z-index: 1; }
  select option { background: #111823; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }
  input, select, textarea { -webkit-appearance: none; appearance: none; }
  input::placeholder, textarea::placeholder { color: var(--muted); }

  @keyframes scanline {
    0%   { transform: translateY(-100%); opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { transform: translateY(500%); opacity: 0; }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes decode {
    0%  { letter-spacing: 0.4em; opacity: 0.3; }
    100%{ letter-spacing: 0.08em; opacity: 1; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .animate-in { animation: slide-up 0.3s ease forwards; }
  .decode-anim { animation: decode 0.5s ease forwards; }

  .field-input {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: 4px;
    padding: 13px 16px;
    color: var(--text);
    font-size: 15px;
    font-family: var(--body);
    font-weight: 500;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .field-input:focus {
    border-color: var(--cyan);
    box-shadow: 0 0 0 3px rgba(0,212,255,0.07);
  }
  .field-input.filled { border-color: rgba(0,212,255,0.3); }
  select.field-input { cursor: pointer; }
  .field-label {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    display: block;
    margin-bottom: 7px;
  }
</style>
</head>
<body>
<div id="root"></div>

<script type="text/babel">
const { useState, useRef, useEffect } = React;

const SHEET_URL = "https://script.google.com/macros/s/AKfycbyS0eSQyY-08N1DeU-WyNEmMlFOazenEH24NNbbZ8qvmFCpAXYShHSQBFN_6pGs0a53/exec";

const DEFAULT_DEPARTMENTS = [
  "Construction","Contract Management","Engineering","Facilities",
  "Office Services","Operational Support Services",
  "Operations Technical Services (OTS)","Purchasing & Stores","RMC","Safety",
  "Spare / Awaiting Redeployment","System Operations (SysOps)","Training",
  "Transportation","Utility Field Services (UFS)",
];
const DEFAULT_LOCATIONS = [
  "Albany Resource Center","Central Resource Center","Coos Bay Resource Center",
  "Eugene Resource Center","Lincoln City Resource Center","Mt Scott Resource Center",
  "Parkrose Resource Center","Salem Resource Center","Sherwood OTC",
  "Sunset Resource Center","The Dalles Resource Center","Warrenton Resource Center",
  "Clark County Resource Center","Transportation","Spare / Pool Vehicle",
  "250 Taylor (Corporate)","Portland LNG Plant","Newport LNG Plant",
  "Miller Station","Off-Site / Unassigned","Dear Friends and Family",
];

const steps = [
  { id:"plate",   label:"License Plate", short:"PLATE",  num:"01" },
  { id:"unit",    label:"Unit Number",   short:"UNIT #", num:"02" },
  { id:"vin",     label:"VIN",           short:"VIN",    num:"03" },
  { id:"details", label:"Details",       short:"DETAILS",num:"04" },
];

// ── Image / API helpers ──────────────────────────────────────────────────────

// Higher resolution for better OCR — 1600px preserves text detail
const toBase64 = (file, maxPx = 1600) => new Promise((res, rej) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    let w = img.width, h = img.height;
    if (w > maxPx || h > maxPx) {
      if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
      else       { w = Math.round(w * maxPx / h); h = maxPx; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    res(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
  };
  img.onerror = () => rej(new Error("Image load failed"));
  img.src = url;
});

const GEMINI_URL = "/api/gemini";
let lastGeminiError = "";

async function geminiVision(file, prompt, maxTokens = 80) {
  try {
    const b64 = await toBase64(file);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const resp = await fetch(GEMINI_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: file.type || "image/jpeg", data: b64 } },
          { text: prompt }
        ]}],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0 }
      })
    });
    clearTimeout(timeoutId);
    const data = await resp.json();
    if (data.error) { lastGeminiError = "API ERR: " + data.error.message; return ""; }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || JSON.stringify(data).substring(0, 150);
      lastGeminiError = "Blocked: " + reason; return "";
    }
    lastGeminiError = ""; return text.trim();
  } catch(e) {
    lastGeminiError = e.name === "AbortError" ? "TIMEOUT — try again" : "FETCH ERR: " + e.message;
    return "";
  }
}

// Retry wrapper — tries up to `attempts` times before giving up
async function geminiWithRetry(file, prompt, attempts = 2, maxTokens = 80) {
  for (let i = 0; i < attempts; i++) {
    const result = await geminiVision(file, prompt, maxTokens);
    if (result) return result;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, 1200)); // brief pause before retry
  }
  return "";
}

const PR_URL = "/api/platerecognizer";

// Plate Recognizer for plates — purpose-built, most accurate for this task
async function readPlateFromImage(file) {
  try {
    const formData = new FormData();
    formData.append("upload", file);
    formData.append("regions", "us-or");
    formData.append("regions", "us-wa");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(PR_URL, {
      method: "POST",
      signal: controller.signal,
      body: formData,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error("PR HTTP " + resp.status);
    const data = await resp.json();

    const result = data.results?.[0];
    if (!result) {
      lastGeminiError = "No plate detected by Plate Recognizer";
      // Fallback: try Gemini
      return await readPlateGeminiFallback(file);
    }

    const plate = result.plate?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const confidence = result.score || 0;

    // If confidence is low, also try Gemini and pick the better result
    if (confidence < 0.7) {
      const geminiPlate = await readPlateGeminiFallback(file);
      if (geminiPlate) return geminiPlate; // trust Gemini when PR is unsure
    }

    return plate && plate.length >= 2 ? plate : null;
  } catch(e) {
    lastGeminiError = e.name === "AbortError" ? "TIMEOUT" : e.message;
    // Fallback to Gemini on any error
    return await readPlateGeminiFallback(file);
  }
}

// Gemini fallback for plates when Plate Recognizer fails or is low-confidence
async function readPlateGeminiFallback(file) {
  const prompt = `You are reading a US vehicle license plate.
Look carefully at the plate in this image.
Return ONLY the alphanumeric plate characters, no spaces, no dashes, no state name, no punctuation.
Examples of correct output: "ABC1234" or "1ABC234" or "123ABC"
If you cannot read a plate clearly, return the word NOTFOUND.`;
  const raw = await geminiWithRetry(file, prompt, 2);
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean || clean === "NOTFOUND" || clean.length < 2) {
    if (!lastGeminiError) lastGeminiError = raw ? ("Got: " + raw.substring(0, 80)) : "No text in response";
    return null;
  }
  return clean;
}

// Returns { vin, partial } — partial=true means we got 14-16 chars, user should verify
async function readVinFromImage(file) {
  const prompt = `You are reading a Vehicle Identification Number (VIN) from a vehicle document or sticker.
A VIN is exactly 17 characters using only letters A-H, J-N, P-Z and digits 0-9 (no I, O, or Q).
Look carefully at every character. Common confusions: 0 vs O, 1 vs I, 8 vs B, 5 vs S.
Return ONLY the 17 VIN characters, no spaces, no dashes, no other text.
If you can see a VIN but are unsure of some characters, still return your best 17-character reading.
If no VIN is visible at all, return NOTFOUND.`;

  const raw = await geminiWithRetry(file, prompt, 2, 100);
  // Strip invalid VIN chars (I, O, Q not allowed in real VINs)
  const clean = raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");

  if (clean.length === 17) return { vin: clean, partial: false };
  // Partial — between 14 and 16 chars: return it so user can correct
  if (clean.length >= 14) return { vin: clean, partial: true };
  return null;
}

async function readUnitNumberFromImage(file) {
  const prompt = `This image shows a fleet or utility vehicle or its documents.
Find the fleet unit number, truck number, or asset number.
This is typically a short number (2-6 digits, sometimes with letters) painted or stickered on the door, hood, cab, or registration card.
Return ONLY that number, no other text.
If not found, return NOTFOUND.`;

  const raw = await geminiWithRetry(file, prompt, 2);
  const clean = raw.toUpperCase().replace(/[^A-Z0-9\-]/g, "").replace(/^NOTFOUND$/, "");
  if (!clean || clean.length < 1) {
    if (!lastGeminiError) lastGeminiError = raw ? ("Got: " + raw.substring(0, 80)) : "No text in response";
    return null;
  }
  return clean;
}

async function decodeVin(vin) {
  const resp = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${vin}?format=json`);
  const data = await resp.json();
  const r = data.Results?.[0]||{};
  return {
    year: r.ModelYear||"", make:r.Make||"", model:r.Model||"", trim:r.Trim||"",
    body:r.BodyClass||"", engine:r.DisplacementL?`${parseFloat(r.DisplacementL).toFixed(1)}L`:"",
    cylinders:r.EngineCylinders||"", drive:r.DriveType||"", fuel:r.FuelTypePrimary||"",
  };
}

// ── UI Primitives ─────────────────────────────────────────────────────────────

function BracketCard({ children, accent="cyan", style={} }) {
  const c = { cyan:"#00d4ff", amber:"#ffb800", green:"#00e87a", red:"#ff4444" }[accent]||"#00d4ff";
  return (
    <div style={{ position:"relative", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:4, padding:"18px 20px", ...style }}>
      <span style={{ position:"absolute", top:-1, left:-1, width:14, height:14, borderTop:`2px solid ${c}`, borderLeft:`2px solid ${c}`, opacity:0.65 }} />
      <span style={{ position:"absolute", top:-1, right:-1, width:14, height:14, borderTop:`2px solid ${c}`, borderRight:`2px solid ${c}`, opacity:0.65 }} />
      <span style={{ position:"absolute", bottom:-1, left:-1, width:14, height:14, borderBottom:`2px solid ${c}`, borderLeft:`2px solid ${c}`, opacity:0.65 }} />
      <span style={{ position:"absolute", bottom:-1, right:-1, width:14, height:14, borderBottom:`2px solid ${c}`, borderRight:`2px solid ${c}`, opacity:0.65 }} />
      {children}
    </div>
  );
}

function DataTag({ label, value, color="var(--cyan)" }) {
  return (
    <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:4, padding:"10px 12px" }}>
      <div style={{ fontFamily:"var(--mono)", fontSize:9, letterSpacing:"0.1em", color:"var(--muted)", textTransform:"uppercase", marginBottom:4 }}>{label}</div>
      <div style={{ fontFamily:"var(--mono)", fontSize:13, fontWeight:600, color, letterSpacing:"0.06em", wordBreak:"break-all" }}>{value||"—"}</div>
    </div>
  );
}

function StatusPill({ color, label }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:`${color}14`, border:`1px solid ${color}40`, borderRadius:2, padding:"4px 12px" }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:color, boxShadow:`0 0 6px ${color}` }} />
      <span style={{ fontFamily:"var(--mono)", fontSize:10, color, letterSpacing:"0.08em", textTransform:"uppercase" }}>{label}</span>
    </span>
  );
}

// ── Camera Capture ────────────────────────────────────────────────────────────

function CameraCapture({ label, hint, onCapture, captured }) {
  const ref = useRef();
  const onChange = e => { const f=e.target.files[0]; if(f) onCapture({file:f, url:URL.createObjectURL(f)}); };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <p style={{ fontFamily:"var(--body)", fontSize:13, color:"var(--muted)", lineHeight:1.6, margin:0 }}>{hint}</p>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={onChange} />
      {captured ? (
        <div style={{ position:"relative" }}>
          <img src={captured.url} alt={label} style={{ width:"100%", borderRadius:4, maxHeight:220, objectFit:"cover", border:"1px solid var(--border2)", display:"block" }} />
          <span style={{ position:"absolute", top:8, left:8, width:18, height:18, borderTop:"2px solid var(--green)", borderLeft:"2px solid var(--green)" }} />
          <span style={{ position:"absolute", top:8, right:8, width:18, height:18, borderTop:"2px solid var(--green)", borderRight:"2px solid var(--green)" }} />
          <span style={{ position:"absolute", bottom:8, left:8, width:18, height:18, borderBottom:"2px solid var(--green)", borderLeft:"2px solid var(--green)" }} />
          <span style={{ position:"absolute", bottom:8, right:8, width:18, height:18, borderBottom:"2px solid var(--green)", borderRight:"2px solid var(--green)" }} />
          <div style={{ position:"absolute", top:10, left:10, background:"var(--green)", color:"#000", fontFamily:"var(--mono)", fontSize:9, fontWeight:700, padding:"3px 10px", borderRadius:2, letterSpacing:"0.1em" }}>CAPTURED ✓</div>
          <button onClick={()=>ref.current.click()} style={{ position:"absolute", bottom:10, right:10, background:"rgba(7,9,13,0.88)", color:"var(--muted)", border:"1px solid var(--border2)", borderRadius:2, padding:"5px 12px", fontFamily:"var(--mono)", fontSize:10, cursor:"pointer", letterSpacing:"0.08em" }}>RETAKE</button>
        </div>
      ) : (
        <button onClick={()=>ref.current.click()} style={{
          background:"var(--surface2)", border:"1px dashed var(--border2)", borderRadius:4,
          padding:"42px 20px", cursor:"pointer", display:"flex", flexDirection:"column",
          alignItems:"center", gap:14, color:"#fff", width:"100%", position:"relative", overflow:"hidden",
          transition:"all 0.2s"
        }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor="rgba(0,212,255,0.4)"; e.currentTarget.style.background="rgba(0,212,255,0.04)"; }}
          onMouseLeave={e=>{ e.currentTarget.style.borderColor="var(--border2)"; e.currentTarget.style.background="var(--surface2)"; }}
        >
          <div style={{ position:"absolute", left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,var(--cyan),transparent)", animation:"scanline 2.8s ease-in-out infinite", opacity:0.35 }} />
          <span style={{ position:"absolute", top:10, left:10, width:16, height:16, borderTop:"1px solid var(--cyan)", borderLeft:"1px solid var(--cyan)", opacity:0.4 }} />
          <span style={{ position:"absolute", top:10, right:10, width:16, height:16, borderTop:"1px solid var(--cyan)", borderRight:"1px solid var(--cyan)", opacity:0.4 }} />
          <span style={{ position:"absolute", bottom:10, left:10, width:16, height:16, borderBottom:"1px solid var(--cyan)", borderLeft:"1px solid var(--cyan)", opacity:0.4 }} />
          <span style={{ position:"absolute", bottom:10, right:10, width:16, height:16, borderBottom:"1px solid var(--cyan)", borderRight:"1px solid var(--cyan)", opacity:0.4 }} />
          <div style={{ fontSize:34 }}>📷</div>
          <div style={{ fontFamily:"var(--display)", fontSize:20, fontWeight:700, letterSpacing:"0.15em", color:"var(--text)" }}>TAP TO CAPTURE</div>
          <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>{label}</div>
        </button>
      )}
    </div>
  );
}

// ── Scan Status ───────────────────────────────────────────────────────────────

function ScanStatus({ state, label, value, isVin }) {
  if (state==="idle") return null;
  if (state==="reading") return (
    <div className="animate-in" style={{ background:"rgba(255,184,0,0.05)", border:"1px solid rgba(255,184,0,0.18)", borderRadius:4, padding:"14px 16px", marginTop:12, display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ width:16, height:16, border:"2px solid var(--amber)", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.75s linear infinite", flexShrink:0 }} />
      <div>
        <div style={{ fontFamily:"var(--display)", fontSize:16, fontWeight:700, letterSpacing:"0.1em", color:"var(--amber)" }}>SCANNING {label.toUpperCase()}</div>
        <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)", marginTop:3 }}>Gemini AI analyzing — may retry once for accuracy...</div>
      </div>
    </div>
  );
  if (state==="decoding") return (
    <div className="animate-in" style={{ background:"rgba(0,212,255,0.05)", border:"1px solid rgba(0,212,255,0.18)", borderRadius:4, padding:"14px 16px", marginTop:12, display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ width:16, height:16, border:"2px solid var(--cyan)", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.75s linear infinite", flexShrink:0 }} />
      <div>
        <div style={{ fontFamily:"var(--display)", fontSize:16, fontWeight:700, letterSpacing:"0.1em", color:"var(--cyan)" }}>DECODING VIN</div>
        <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)", marginTop:3 }}>Querying NHTSA database...</div>
      </div>
    </div>
  );
  if (state==="done"&&value) return (
    <div className="animate-in" style={{ background:"rgba(0,232,122,0.05)", border:"1px solid rgba(0,232,122,0.22)", borderRadius:4, padding:"14px 16px", marginTop:12, display:"flex", alignItems:"center", gap:14 }}>
      <span style={{ fontSize:20, flexShrink:0, color:"var(--green)" }}>✓</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>{label} DETECTED</div>
        <div className="decode-anim" style={{ fontFamily:"var(--mono)", fontSize:isVin?11:20, fontWeight:700, color:"var(--green)", letterSpacing:isVin?"0.1em":"0.2em", wordBreak:"break-all" }}>{value}</div>
      </div>
    </div>
  );
  return null;
}

// ── Vehicle Card ──────────────────────────────────────────────────────────────

function VehicleCard({ info, vin }) {
  if (!info) return null;
  const specs = [info.body, info.engine&&`${info.engine}${info.cylinders?" · "+info.cylinders+"cyl":""}`, info.drive, info.fuel].filter(Boolean);
  return (
    <BracketCard accent="green" style={{ marginTop:12 }}>
      <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--green)", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:8 }}>VEHICLE DECODED ✓</div>
      <div style={{ fontFamily:"var(--display)", fontSize:26, fontWeight:800, letterSpacing:"0.04em", color:"var(--text)", marginBottom:4 }}>
        {info.year} {info.make} {info.model}
      </div>
      {info.trim && <div style={{ fontFamily:"var(--body)", fontSize:14, color:"var(--muted)", marginBottom:10 }}>{info.trim}</div>}
      {specs.length>0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {specs.map(s => (
            <span key={s} style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:2, padding:"3px 9px", fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)", letterSpacing:"0.05em" }}>{s}</span>
          ))}
        </div>
      )}
      {vin && <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"rgba(0,232,122,0.35)", letterSpacing:"0.1em", borderTop:"1px solid var(--border)", paddingTop:10 }}>{vin}</div>}
    </BracketCard>
  );
}

// ── Manual Entry ──────────────────────────────────────────────────────────────

function ManualEntry({ label, value, setValue, onSubmit, btnLabel, maxLen }) {
  return (
    <div className="animate-in" style={{ background:"rgba(255,68,68,0.04)", border:"1px solid rgba(255,68,68,0.18)", borderRadius:4, padding:"16px", marginTop:12 }}>
      <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--red)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>⚠ SCAN FAILED — ENTER MANUALLY</div>
      <input value={value} onChange={e=>setValue(e.target.value.toUpperCase())} placeholder={`Enter ${label}`} maxLength={maxLen}
        className="field-input" style={{ marginBottom:10, fontFamily:"var(--mono)", fontSize:14, letterSpacing:"0.1em" }} />
      <button onClick={onSubmit} disabled={!value.trim()} style={{
        width:"100%", border:"none", borderRadius:3, padding:"11px",
        background: value.trim()?"linear-gradient(90deg,#00d4ff,#0099cc)":"var(--surface2)",
        color: value.trim()?"#000":"var(--muted)",
        fontFamily:"var(--display)", fontSize:17, fontWeight:700, letterSpacing:"0.12em",
        cursor: value.trim()?"pointer":"not-allowed",
      }}>{btnLabel}</button>
    </div>
  );
}

// ── Confirmation ──────────────────────────────────────────────────────────────

function ConfirmationCard({ data, sheetStatus, sheetAction, onReset }) {
  const vi = data.vehicleInfo;
  return (
    <div className="animate-in" style={{ paddingBottom:40 }}>
      <BracketCard accent="green" style={{ textAlign:"center", padding:"32px 24px", marginBottom:14 }}>
        <div style={{ fontSize:50, marginBottom:12 }}>✅</div>
        <div style={{ fontFamily:"var(--display)", fontSize:40, fontWeight:800, letterSpacing:"0.1em", color:"var(--green)", lineHeight:1 }}>VEHICLE LOGGED</div>
        <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)", marginTop:8, marginBottom:18 }}>{new Date().toLocaleString()}</div>
        {sheetAction && (
          <div style={{ marginBottom:10 }}>
            <StatusPill color={sheetAction==="NEW VEHICLE"?"var(--cyan)":"var(--amber)"} label={sheetAction==="NEW VEHICLE"?"NEW RECORD ADDED":"RECORD UPDATED"} />
          </div>
        )}
        <StatusPill
          color={sheetStatus==="synced"?"var(--green)":sheetStatus==="pending"?"var(--amber)":sheetStatus==="error"?"var(--red)":"var(--muted)"}
          label={sheetStatus==="synced"?"Synced to Google Sheets":sheetStatus==="pending"?"Syncing...":sheetStatus==="error"?"Sync Failed":"No Sheet"}
        />
      </BracketCard>

      {vi && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:4, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ fontFamily:"var(--display)", fontSize:22, fontWeight:800, letterSpacing:"0.04em", marginBottom:4 }}>{vi.year} {vi.make} {vi.model} {vi.trim}</div>
          <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)" }}>{[vi.body, vi.engine, vi.drive, vi.fuel].filter(Boolean).join("  ·  ")}</div>
          {data.vin && <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"rgba(0,212,255,0.3)", marginTop:6 }}>{data.vin}</div>}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12 }}>
        {[{label:"License Plate",img:data.platePhoto?.url},{label:"Unit Number",img:data.truckPhoto?.url},{label:"VIN Photo",img:data.vinPhoto?.url}].map(({label,img})=>(
          <div key={label}>
            <img src={img} alt={label} style={{ width:"100%", aspectRatio:"1", objectFit:"cover", borderRadius:4, border:"1px solid var(--border)", display:"block" }} />
            <p style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--muted)", marginTop:5, textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</p>
          </div>
        ))}
      </div>

      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:4, padding:"14px 16px", marginBottom:14 }}>
        {[["PLATE",data.plate],["UNIT #",data.unitNumber],["DEPARTMENT",data.department],["LOCATION",data.location],...(data.submittedBy?[["SUBMITTED BY",data.submittedBy]]:[]),...(data.assignedTo?[["ASSIGNED TO",data.assignedTo]]:[]),...(data.notes?[["NOTES",data.notes]]:[])].filter(([,v])=>v).map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
            <span style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em", flexShrink:0, marginRight:16 }}>{k}</span>
            <span style={{ fontFamily:k==="PLATE"?"var(--mono)":"var(--body)", fontSize:k==="PLATE"?13:15, fontWeight:600, color:"var(--text)", textAlign:"right" }}>{v}</span>
          </div>
        ))}
      </div>

      <button onClick={onReset} style={{
        width:"100%", border:"none", borderRadius:3, padding:"16px",
        background:"linear-gradient(90deg,#00d4ff,#0099cc)", color:"#000",
        fontFamily:"var(--display)", fontSize:20, fontWeight:800, letterSpacing:"0.15em", cursor:"pointer",
        boxShadow:"0 4px 24px rgba(0,212,255,0.25)"
      }}>LOG ANOTHER VEHICLE</button>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [departments,  setDepartments]  = useState(DEFAULT_DEPARTMENTS);
  const [locations,    setLocations]    = useState(DEFAULT_LOCATIONS);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [step,         setStep]         = useState(0);
  const [platePhoto,   setPlatePhoto]   = useState(null);
  const [plateError,   setPlateError]   = useState("");
  const [vinPhoto,     setVinPhoto]     = useState(null);
  const [truckPhoto,   setTruckPhoto]   = useState(null);
  const [truckError,   setTruckError]   = useState("");
  const [plateScanState, setPlateScanState] = useState("idle");
  const [detectedPlate,  setDetectedPlate]  = useState("");
  const [manualPlate,    setManualPlate]    = useState("");
  const [truckScanState, setTruckScanState] = useState("idle");
  const [detectedTruck,  setDetectedTruck]  = useState("");
  const [manualTruck,    setManualTruck]    = useState("");
  const [vinScanState, setVinScanState] = useState("idle");
  const [detectedVin,  setDetectedVin]  = useState("");
  const [vehicleInfo,  setVehicleInfo]  = useState(null);
  const [manualVin,    setManualVin]    = useState("");
  const [vinPartial,   setVinPartial]   = useState(false);
  const [submittedBy,  setSubmittedBy]  = useState("");
  const [department,   setDepartment]   = useState("");
  const [location,     setLocation]     = useState("");
  const [assignedTo,   setAssignedTo]   = useState("");
  const [notes,        setNotes]        = useState("");
  const [submitted,    setSubmitted]    = useState(false);
  const [sheetStatus,  setSheetStatus]  = useState("no-sheet");
  const [sheetAction,  setSheetAction]  = useState("");
  const [existingRecord, setExistingRecord] = useState(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const res  = await fetch(`${SHEET_URL}?action=getConfig`);
        const json = await res.json();
        if (json.departments?.length) setDepartments(json.departments);
        if (json.locations?.length)   setLocations(json.locations);
      } catch {}
      finally { setConfigLoaded(true); }
    }
    loadConfig();
  }, []);

  const canAdvance = [
    plateScanState==="done" || (plateScanState==="no_read" && manualPlate.trim().length >= 2),
    truckScanState==="done" || (truckScanState==="no_read" && manualTruck.trim().length >= 1),
    vinScanState==="done"   || (vinScanState==="no_read"   && manualVin.trim().replace(/[^A-HJ-NPR-Z0-9]/g,"").length === 17),
    !!(submittedBy&&department&&location),
  ][step]??false;

  const handlePlateCapture = async data => {
    setPlatePhoto(data); setPlateScanState("reading"); setDetectedPlate(""); setManualPlate(""); setPlateError("");
    try {
      const plate = await readPlateFromImage(data.file);
      plate ? (setDetectedPlate(plate),setPlateScanState("done")) : (setPlateError(lastGeminiError),setPlateScanState("no_read"));
    } catch(e) { setPlateError(e.message); setPlateScanState("no_read"); }
  };

  const handleTruckCapture = async data => {
    setTruckPhoto(data); setTruckScanState("reading"); setDetectedTruck(""); setManualTruck(""); setTruckError("");
    try {
      const unit = await readUnitNumberFromImage(data.file);
      unit ? (setDetectedTruck(unit), setTruckScanState("done")) : (setTruckError(lastGeminiError), setTruckScanState("no_read"));
    } catch(e) { setTruckError(e.message); setTruckScanState("no_read"); }
  };

  const handleManualTruck = () => {
    if (!manualTruck.trim()) return;
    setDetectedTruck(manualTruck.trim().toUpperCase()); setTruckScanState("done");
  };

  const handleVinCapture = async data => {
    setVinPhoto(data); setVinScanState("reading"); setDetectedVin(""); setVehicleInfo(null); setManualVin(""); setVinPartial(false); setExistingRecord(null);
    try {
      const result = await readVinFromImage(data.file);
      if (!result) { setVinScanState("no_read"); return; }
      if (result.partial) {
        // Got 14-16 chars — pre-fill manual entry so user can fix it
        setManualVin(result.vin);
        setVinPartial(true);
        setVinScanState("no_read");
        return;
      }
      setDetectedVin(result.vin); setVinScanState("decoding");
      const info = await decodeVin(result.vin);
      setVehicleInfo(info); setVinScanState("done");
      checkForDuplicate(result.vin, detectedPlate||manualPlate);
    } catch { setVinScanState("no_read"); }
  };

  const handleManualPlate = () => {
    if (!manualPlate.trim()) return;
    setDetectedPlate(manualPlate.trim()); setPlateScanState("done");
  };

  const handleManualVin = async () => {
    const sanitized = manualVin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,"");
    if (sanitized.length!==17) return;
    setVinScanState("decoding"); setDetectedVin(sanitized); setExistingRecord(null);
    try {
      const info = await decodeVin(sanitized);
      setVehicleInfo(info); setVinScanState("done");
      checkForDuplicate(sanitized, detectedPlate||manualPlate);
    } catch { setVinScanState("no_read"); }
  };

  const checkForDuplicate = async (vin, plate) => {
    try {
      const res  = await fetch(`${SHEET_URL}?action=checkVehicle&vin=${encodeURIComponent(vin)}&plate=${encodeURIComponent(plate||"")}`);
      const json = await res.json();
      if (json.found) setExistingRecord(json);
    } catch {}
  };

  const reset = () => {
    setStep(0); setPlatePhoto(null); setVinPhoto(null); setTruckPhoto(null);
    setPlateScanState("idle"); setDetectedPlate(""); setManualPlate(""); setPlateError("");
    setTruckScanState("idle"); setDetectedTruck(""); setManualTruck(""); setTruckError("");
    setVinScanState("idle");   setDetectedVin("");   setVehicleInfo(null); setManualVin(""); setVinPartial(false);
    setSubmittedBy(""); setDepartment(""); setLocation(""); setAssignedTo(""); setNotes("");
    setSubmitted(false); setSheetStatus("no-sheet"); setSheetAction(""); setExistingRecord(null);
  };

  const handleSubmit = async () => {
    setSubmitted(true); setSheetStatus("pending");
    try {
      const res = await fetch(SHEET_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          entryId:      "FB-"+Date.now(),
          timestamp:    new Date().toLocaleString(),
          vin:          detectedVin  ||manualVin  ||"",
          licensePlate: detectedPlate||manualPlate||"",
          unitNumber:   detectedTruck||manualTruck||"",
          year:         vehicleInfo?.year||"",      make:vehicleInfo?.make||"",
          model:        vehicleInfo?.model||"",     trim:vehicleInfo?.trim||"",
          body:         vehicleInfo?.body||"",      engine:vehicleInfo?.engine||"",
          cylinders:    vehicleInfo?.cylinders||"", drive:vehicleInfo?.drive||"",
          fuel:         vehicleInfo?.fuel||"",
          submittedBy, department, location, assignedTo, notes,
          platePhotoUrl:"Captured on device", vinPhotoUrl:"Captured on device",
          source:"FleetBuddy v2.0",
        })
      });
      const json = await res.json();
      setSheetStatus(json.success?"synced":"error");
      if (json.action) setSheetAction(json.action);
    } catch { setSheetStatus("error"); }
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center" }}>

      {/* Header */}
      <div style={{
        width:"100%", background:"rgba(7,9,13,0.94)", backdropFilter:"blur(20px)",
        borderBottom:"1px solid var(--border)", padding:"0 20px",
        position:"sticky", top:0, zIndex:100,
        display:"flex", alignItems:"center", justifyContent:"space-between"
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"11px 0" }}>
          <div style={{ background:"rgba(0,212,255,0.08)", border:"1px solid rgba(0,212,255,0.25)", borderRadius:4, padding:"8px 11px", fontSize:20 }}>🚗</div>
          <div>
            <div style={{ fontFamily:"var(--display)", fontSize:28, fontWeight:800, letterSpacing:"0.1em", lineHeight:1, color:"var(--cyan)" }}>FleetBuddy</div>
            <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--muted)", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:2 }}>BuddySuite · Vehicle Tracking</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--green)", boxShadow:"0 0 8px var(--green)", animation:"blink 2.5s ease-in-out infinite" }} />
          <span style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)", letterSpacing:"0.08em" }}>LIVE</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ width:"100%", maxWidth:480, padding:"20px 16px 48px" }}>

        {submitted ? (
          <ConfirmationCard
            data={{ platePhoto, vinPhoto, truckPhoto, plate:detectedPlate||manualPlate, unitNumber:detectedTruck||manualTruck, vin:detectedVin||manualVin, vehicleInfo, submittedBy, department, location, assignedTo, notes }}
            sheetStatus={sheetStatus} sheetAction={sheetAction} onReset={reset}
          />
        ) : (
          <>
            {/* Step tracker */}
            <div style={{ display:"flex", alignItems:"center", marginBottom:24 }}>
              {steps.map((s,i) => {
                const done=i<step, cur=i===step;
                return (
                  <React.Fragment key={s.id}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                      <div style={{
                        width:38, height:38, borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center",
                        fontFamily:"var(--mono)", fontSize:done?16:11, fontWeight:700, transition:"all 0.3s",
                        background:cur?"var(--cyan)":done?"rgba(0,212,255,0.12)":"var(--surface2)",
                        border:cur?"none":done?"1px solid rgba(0,212,255,0.35)":"1px solid var(--border)",
                        color:cur?"#000":done?"var(--cyan)":"var(--muted)",
                        boxShadow:cur?"0 0 20px rgba(0,212,255,0.3)":"none"
                      }}>{done?"✓":s.num}</div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:9, letterSpacing:"0.07em", textTransform:"uppercase", whiteSpace:"nowrap", color:cur?"var(--cyan)":done?"rgba(0,212,255,0.45)":"var(--muted)", fontWeight:cur?600:400 }}>{s.short}</div>
                    </div>
                    {i<steps.length-1 && (
                      <div style={{ flex:1, height:1, margin:"0 6px", marginBottom:20, background:done?"rgba(0,212,255,0.35)":"var(--border)", transition:"background 0.3s" }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Step card */}
            <BracketCard style={{ marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:18 }}>
                <div style={{ fontFamily:"var(--display)", fontSize:32, fontWeight:800, letterSpacing:"0.08em", color:"var(--text)", lineHeight:1 }}>
                  {steps[step].label.toUpperCase()}
                </div>
                <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)", letterSpacing:"0.1em" }}>STEP {step+1}/{steps.length}</div>
              </div>

              {/* STEP 0 — Plate */}
              {step===0 && (
                <div className="animate-in">
                  <div style={{ background:"rgba(0,212,255,0.04)", border:"1px solid rgba(0,212,255,0.1)", borderRadius:3, padding:"10px 14px", marginBottom:16, display:"flex", gap:10 }}>
                    <span style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--cyan)", letterSpacing:"0.08em", flexShrink:0, marginTop:1 }}>AI</span>
                    <p style={{ fontFamily:"var(--body)", fontSize:13, color:"var(--muted)", lineHeight:1.6, margin:0 }}>
                      AI vision reads the plate directly from your photo. OR and WA plates supported.
                    </p>
                  </div>
                  <CameraCapture label="License Plate" hint="Fill the frame with the plate — stand 2-4 feet away, good lighting, hold phone steady" onCapture={handlePlateCapture} captured={platePhoto} />
                  <ScanStatus state={plateScanState} label="License Plate" value={detectedPlate} />
                  {plateScanState==="no_read" && <ManualEntry label="license plate" value={manualPlate} setValue={setManualPlate} onSubmit={handleManualPlate} btnLabel="CONFIRM PLATE →" maxLen={10} />}
                  {plateScanState==="no_read"&&plateError && <p style={{ fontFamily:"var(--mono)", color:"var(--red)", fontSize:10, marginTop:8, wordBreak:"break-all" }}>{plateError}</p>}
                </div>
              )}

              {/* STEP 1 — Unit Number */}
              {step===1 && (
                <div className="animate-in">
                  <div style={{ background:"rgba(255,184,0,0.04)", border:"1px solid rgba(255,184,0,0.12)", borderRadius:3, padding:"10px 14px", marginBottom:16, display:"flex", gap:10 }}>
                    <span style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--amber)", letterSpacing:"0.08em", flexShrink:0, marginTop:1 }}>AI</span>
                    <p style={{ fontFamily:"var(--body)", fontSize:13, color:"var(--muted)", lineHeight:1.6, margin:0 }}>
                      AI vision reads the unit number painted or stickered on the truck. Usually 2–6 digits on the door, hood, or cab.
                    </p>
                  </div>
                  <CameraCapture label="Unit Number" hint="Capture the truck number on the door or hood — number only, no background clutter" onCapture={handleTruckCapture} captured={truckPhoto} />
                  <ScanStatus state={truckScanState} label="Unit Number" value={detectedTruck} />
                  {truckScanState==="no_read" && <ManualEntry label="unit number" value={manualTruck} setValue={setManualTruck} onSubmit={handleManualTruck} btnLabel="CONFIRM UNIT # →" maxLen={10} />}
                  {truckScanState==="no_read"&&truckError && <p style={{ fontFamily:"var(--mono)", color:"var(--red)", fontSize:10, marginTop:8, wordBreak:"break-all" }}>{truckError}</p>}
                </div>
              )}

              {/* STEP 2 — VIN */}
              {step===2 && (
                <div className="animate-in">
                  {/* Best source tip */}
                  <div style={{ background:"rgba(0,232,122,0.05)", border:"1px solid rgba(0,232,122,0.2)", borderRadius:3, padding:"10px 14px", marginBottom:10, display:"flex", gap:10, alignItems:"flex-start" }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>📋</span>
                    <p style={{ fontFamily:"var(--body)", fontSize:13, color:"var(--text)", lineHeight:1.6, margin:0 }}>
                      <strong>Best result:</strong> Photograph the <span style={{color:"var(--green)"}}>vehicle registration card</span> — the VIN is printed large and flat. Much easier to read than the dashboard stamp.
                    </p>
                  </div>
                  <div style={{ background:"rgba(0,212,255,0.04)", border:"1px solid rgba(0,212,255,0.1)", borderRadius:3, padding:"8px 14px", marginBottom:14, display:"flex", gap:10 }}>
                    <span style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--cyan)", letterSpacing:"0.08em", flexShrink:0, marginTop:1 }}>AI</span>
                    <p style={{ fontFamily:"var(--body)", fontSize:12, color:"var(--muted)", lineHeight:1.6, margin:0 }}>
                      AI reads the VIN → NHTSA decodes year, make, model, trim, engine &amp; drivetrain.
                    </p>
                  </div>
                  <CameraCapture label="VIN" hint="📋 Registration card (best) · dashboard plate near windshield · or door jamb sticker" onCapture={handleVinCapture} captured={vinPhoto} />
                  <ScanStatus state={vinScanState} label="VIN" value={detectedVin} isVin />
                  {vinScanState==="done" && <VehicleCard info={vehicleInfo} vin={detectedVin} />}
                  {vinScanState==="no_read" && (
                    <div>
                      {vinPartial && (
                        <div style={{ background:"rgba(255,184,0,0.07)", border:"1px solid rgba(255,184,0,0.25)", borderRadius:4, padding:"10px 14px", marginTop:12, marginBottom:0 }}>
                          <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--amber)", letterSpacing:"0.1em", marginBottom:4 }}>⚠ PARTIAL READ — VERIFY &amp; CORRECT</div>
                          <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--text)", letterSpacing:"0.12em" }}>{manualVin}</div>
                          <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--muted)", marginTop:4 }}>Edit below to complete the full 17 characters</div>
                        </div>
                      )}
                      <ManualEntry label="VIN (17 characters)" value={manualVin} setValue={setManualVin} onSubmit={handleManualVin} btnLabel="DECODE VIN →" maxLen={17} />
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3 — Details */}
              {step===3 && (
                <div className="animate-in" style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                    <DataTag label="License Plate" value={detectedPlate||manualPlate} color="var(--cyan)" />
                    <DataTag label="Unit #" value={detectedTruck||manualTruck} color="var(--amber)" />
                    <DataTag label="VIN" value={(detectedVin||manualVin)?.length>9?(detectedVin||manualVin).slice(0,9)+"…":(detectedVin||manualVin)} color="var(--green)" />
                  </div>

                  {vehicleInfo && (
                    <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:4, padding:"12px 14px" }}>
                      <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Decoded Vehicle</div>
                      <div style={{ fontFamily:"var(--display)", fontSize:20, fontWeight:700, letterSpacing:"0.04em" }}>{vehicleInfo.year} {vehicleInfo.make} {vehicleInfo.model}</div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)", marginTop:3 }}>{[vehicleInfo.trim,vehicleInfo.body,vehicleInfo.engine,vehicleInfo.fuel].filter(Boolean).join("  ·  ")}</div>
                    </div>
                  )}

                  <div>
                    <label className="field-label">Your Name <span style={{ color:"var(--red)" }}>*</span></label>
                    <input value={submittedBy} onChange={e=>setSubmittedBy(e.target.value)} placeholder="First and last name" className={`field-input ${submittedBy?"filled":""}`} />
                  </div>
                  <div>
                    <label className="field-label">Department <span style={{ color:"var(--red)" }}>*</span></label>
                    <select value={department} onChange={e=>setDepartment(e.target.value)} className={`field-input ${department?"filled":""}`} style={{ color:department?"var(--text)":"var(--muted)" }}>
                      <option value="">Select department...</option>
                      {departments.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Resource Center / Location <span style={{ color:"var(--red)" }}>*</span></label>
                    <select value={location} onChange={e=>setLocation(e.target.value)} className={`field-input ${location?"filled":""}`} style={{ color:location?"var(--text)":"var(--muted)" }}>
                      <option value="">Select location...</option>
                      {locations.map(l=><option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Assigned To <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional)</span></label>
                    <input value={assignedTo} onChange={e=>setAssignedTo(e.target.value)} placeholder="Driver or employee name" className="field-input" />
                  </div>
                  <div>
                    <label className="field-label">Notes <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional)</span></label>
                    <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Damage, odometer, special instructions..." rows={3} className="field-input" style={{ resize:"none" }} />
                  </div>

                  {existingRecord && (
                    <BracketCard accent="amber">
                      <div style={{ fontFamily:"var(--display)", fontSize:15, fontWeight:700, letterSpacing:"0.1em", color:"var(--amber)", marginBottom:8 }}>⚠ EXISTING RECORD FOUND</div>
                      <div style={{ fontFamily:"var(--body)", fontSize:15, fontWeight:600, marginBottom:4 }}>{[existingRecord.year,existingRecord.make,existingRecord.model].filter(Boolean).join(" ")||"Vehicle on file"}</div>
                      {existingRecord.lastUpdated && <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)" }}>Last updated: {existingRecord.lastUpdated}{existingRecord.submittedBy?" · "+existingRecord.submittedBy:""}</div>}
                      <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--amber)", marginTop:8, letterSpacing:"0.06em" }}>→ SUBMIT WILL UPDATE THIS RECORD</div>
                    </BracketCard>
                  )}

                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"rgba(0,232,122,0.04)", border:"1px solid rgba(0,232,122,0.12)", borderRadius:4 }}>
                    <span style={{ fontSize:14 }}>📊</span>
                    <div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--green)", letterSpacing:"0.08em" }}>READY TO SYNC</div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:9, color:"var(--muted)", marginTop:2 }}>Plate · Unit # · VIN · Vehicle · Dept · Location</div>
                    </div>
                  </div>
                </div>
              )}
            </BracketCard>

            {/* Navigation */}
            <div style={{ display:"flex", gap:10 }}>
              {step>0 && (
                <button onClick={()=>setStep(s=>s-1)} style={{
                  flex:1, background:"var(--surface)", border:"1px solid var(--border2)",
                  color:"var(--muted)", borderRadius:3, padding:"15px",
                  fontFamily:"var(--display)", fontSize:17, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer",
                }}>← BACK</button>
              )}
              <button
                onClick={()=>{ if(step<3) setStep(s=>s+1); else handleSubmit(); }}
                disabled={!canAdvance}
                style={{
                  flex:2, border:"none", borderRadius:3, padding:"15px",
                  fontFamily:"var(--display)", fontSize:19, fontWeight:800, letterSpacing:"0.15em",
                  cursor:canAdvance?"pointer":"not-allowed", transition:"all 0.2s",
                  background:canAdvance?"linear-gradient(90deg,#00d4ff,#0099cc)":"var(--surface2)",
                  color:canAdvance?"#000":"var(--muted)",
                  boxShadow:canAdvance?"0 4px 24px rgba(0,212,255,0.25)":"none"
                }}
              >
                {step<3?"NEXT →":existingRecord?"UPDATE VEHICLE ✓":"SUBMIT VEHICLE ✓"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>
