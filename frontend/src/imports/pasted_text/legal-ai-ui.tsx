Build a complete React + Vite frontend for an AI-Powered Legal Due Diligence System for Pakistani corporate and real estate law firms. This is a Day 3 deliverable — the UI must cover the full end-to-end flow: document upload → pipeline processing → automatic checklist run → red flag detection → memo download.

DESIGN IDENTITY
Do not build a generic dashboard. The aesthetic direction is "Legal Intelligence Terminal" — imagine a Bloomberg Terminal crossed with a high-end law firm's internal tool. Dark, precise, data-dense, but never cluttered. Every element earns its place.

Background: #080C14 (near-black with a blue undertone)
Primary surface: #0F1620 (dark navy cards)
Border/divider: #1E2D40 (subtle blue-grey)
Gold accent: #C9A84C (used for active states, CTAs, highlights — sparingly)
Electric blue: #3B82F6 (AI/processing indicators)
Success green: #10B981
Warning red: #EF4444
Body text: #CBD5E1
Heading text: #F1F5F9
Monospace text (IDs, scores, clause refs): #94A3B8
Font stack: 'Inter' for UI, 'JetBrains Mono' for IDs/scores/technical data
No rounded-2xl softness everywhere — use rounded-sm and rounded-md only. Sharp, precise corners feel more legal/professional.
Borders everywhere, very subtle. Cards feel like they have weight.
Thin gold left-border on active/selected elements (border-l-2 border-amber-500)


APP FLOW — 4 SCREENS, ONE PAGE (no routing, state-driven)
SCREEN 1 — UPLOAD
Full viewport. Two-column layout on desktop (60/40 split).
Left column:

Top-left: a small wordmark — ⚖ LexAI in gold, monospace
Large heading: "Due Diligence, (line break) Accelerated." — Cormorant Garamond or serif fallback, large, white
Subheading: "Upload your legal bundle. The system reads every clause, flags every risk, and drafts your review memo — automatically."
Three stat pills below: "5–7 days → Same day" / "30–50 pages in under 5 min" / "Built for Pakistani law"
Small disclaimer at bottom: "All processing is local. Documents never leave your infrastructure."

Right column:

Transaction type selector first — three cards stacked or in a row:

🏛 Property Transaction — Sale Deed, Registry, Fard, NOC, Mutation
🏦 Loan Agreement — Mortgage Deed, Facility Letter, Security Documents
🏢 Company Acquisition — MOA, SHA, SECP Filings, Financials
Selected card gets a gold left border and slightly lighter background


Drag-and-drop upload zone below: dashed gold border (border-dashed border-amber-500/40), dotted on hover becomes solid. Icon: a document stack SVG. Text: "Drop your document bundle here" with "PDF files only · Max 100MB each" below in muted text
Uploaded files appear as rows below the zone — filename, size, a remove X button, and a thin status bar at bottom of each row
CTA: "Begin Analysis" — full width, gold background, dark text, text-sm font-semibold tracking-widest uppercase


SCREEN 2 — PIPELINE PROCESSING
Replace the upload screen entirely. Full viewport.
Left side (40%):

Session info card at top: Session ID in monospace, Transaction Type badge, Files Uploaded count, Total Pages count
Below: a vertical step-by-step pipeline tracker:

Upload Received ✓
Text Extraction ✓
OCR Processing (with urd+eng badge if triggered)
Clause Chunking ✓
Embedding Generation ✓
Vector Index Built ✓
Running Checklist Queries... (spinner)
Generating Memo...


Each completed step shows a green checkmark and a timestamp. Active step pulses with blue. Pending steps are grey.
Below pipeline: a terminal-style log box — dark, monospace, streaming fake log lines that cycle through realistic messages

Right side (60%):

Large centered status with animated icon (rotating scales of justice SVG or simple animated ring)
Status text changes as pipeline progresses: "Extracting text..." → "Running due diligence checklist..." → "Generating your memo..."
Below: a progress bar, gold fill, showing overall completion %
At the bottom: "Estimated time remaining: ~45 seconds" in muted monospace


SCREEN 3 — RESULTS WORKSPACE
Three-panel layout. This is the main screen.
Left Panel (22%) — Document Navigator:

Header: "Bundle" with document count badge
Each document as a card: filename truncated, page count, a OCR badge in orange if OCR was used, a Native badge in blue otherwise
Clicking highlights it (gold left border)
Below documents: Session stats — Chunks Indexed, Pages Processed, OCR Pages

Center Panel (52%) — Checklist Results + Query:

Tab bar at top: "Checklist" | "Ask a Question" — tabs styled as underline tabs, gold active indicator

Checklist tab:

Shows all 10-15 checklist questions auto-run against the bundle
Each question renders as a card:

Question text in white, small Q01 label in gold monospace top-left
Answer text below in #CBD5E1
Source citation: filename · Page X as a small badge
Similarity score as a small horizontal bar (gold fill)
A red flag indicator if this answer triggered a flag (red dot + flag label)


Cards load in with a 80ms stagger animation

Ask a Question tab:

A single input bar: gold underline style, placeholder "Ask about any clause, obligation, or party..."
Submit button: arrow icon, gold
Results render exactly like checklist cards below

Right Panel (26%) — Red Flags + Memo:

"Red Flags" section header with a count badge (red if >0, grey if 0)
Each red flag as a card:

Severity badge: HIGH / MEDIUM in red/orange
Flag name: e.g. "Unregistered Mutation", "Missing NOC", "Unsigned Page Detected"
One-line explanation
Source document + page


Separator
"Review Memo" section:

Status: "Ready" in green or "Generating..." with spinner
Memo preview: first 3 lines of the memo text, blurred/truncated after
Two download buttons: "Download .docx" and "Download .pdf" — each with an icon, dark background, gold border




SCREEN 4 — MEMO VIEWER (optional overlay/modal)
A full-screen modal that opens when "View Memo" is clicked:

Dark background overlay
White inner document area styled like an actual legal memo — letterhead area at top with [Law Firm Name] placeholder, CONFIDENTIAL watermark text lightly in background
Memo content rendered with proper heading hierarchy
Red flags highlighted inline in the text with red underline
Download buttons at top right
Close button (X) top right corner


TECHNICAL REQUIREMENTS

React + Vite
Tailwind CSS (no component libraries except shadcn for the tabs if needed)
Framer Motion for all screen transitions and card stagger animations
Axios for API calls:

POST http://127.0.0.1:8000/ingest — multipart with files + transaction_type
POST http://127.0.0.1:8000/memo/generate — with session_id + transaction_type, returns checklist answers + red flags + memo text
GET http://127.0.0.1:8000/memo/download/{session_id} — triggers .docx download


App state managed via React Context — session_id, transaction_type, documents, checklist_results, red_flags, memo_text, current_screen
All in a single App.jsx with screen components imported from src/components/
Google Fonts: Inter + JetBrains Mono + Cormorant Garamond (import in index.html)


MICRO-INTERACTIONS

Screen transitions: opacity 0→1 + translateY 20px→0 over 400ms ease-out
Checklist cards stagger in at 80ms intervals
Pipeline steps: each step fades in as it completes, active step has a slow pulse on its dot
Upload file rows slide in from right when dropped
Red flag cards shake once on appear if severity is HIGH
All hover states: brightness-110 on cards, border-amber-500 on interactive elements
No bouncy spring animations — ease-out or cubic-bezier(0.4,0,0.2,1) everywhere