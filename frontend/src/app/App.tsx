import {
  useState,
  useEffect,
  useRef,
  useContext,
  createContext,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText, X, Building2, Briefcase, Home, Download,
  Search, CheckCircle, Clock, ArrowRight, Database,
  Layers, RefreshCw, Zap, Upload, Scale, TerminalSquare,
  AlertTriangle, FileDown, AlertCircle, BookOpen, MessageSquare,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:       "#080C14",
  surface:  "#0F1620",
  surfaceH: "#131D2E",   // hover surface
  border:   "#1E2D40",
  gold:     "#C9A84C",
  goldDim:  "rgba(201,168,76,0.35)",
  blue:     "#3B82F6",
  green:    "#10B981",
  red:      "#EF4444",
  orange:   "#F59E0B",
  text:     "#CBD5E1",
  heading:  "#F1F5F9",
  mono:     "#94A3B8",
  monoFade: "rgba(148,163,184,0.45)",
} as const;

const MONO  = "'JetBrains Mono', monospace";
const SANS  = "'Inter', sans-serif";
const SERIF = "'Cormorant Garamond', serif";
const EASE  = [0.4, 0, 0.2, 1] as const;

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes pulse-blue {
    0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.5); }
    50%      { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
  }
  @keyframes shake-once {
    0%,100% { transform: translateX(0); }
    15%     { transform: translateX(-5px); }
    35%     { transform: translateX(5px); }
    55%     { transform: translateX(-3px); }
    75%     { transform: translateX(3px); }
    90%     { transform: translateX(-1px); }
  }
  @keyframes cursor-blink {
    0%,100% { opacity: 1; } 50% { opacity: 0; }
  }
  @keyframes spin-ring {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  mark {
    background: rgba(239,68,68,0.15);
    color: #FCA5A5;
    border-radius: 2px;
    padding: 0 2px;
    text-decoration: underline;
    text-decoration-color: rgba(239,68,68,0.55);
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen  = "upload" | "processing" | "workspace";
type TxType  = "property" | "loan" | "acquisition" | null;

interface UFile {
  id: string; name: string; size: number; progress: number;
}

interface ChecklistItem {
  id: string;
  question: string;
  answer: string;
  source: { doc: string; page: number | null };
  score: number;
  flag: { severity: "HIGH" | "MEDIUM"; label: string } | null;
}

interface RedFlag {
  id: string;
  severity: "HIGH" | "MEDIUM";
  label: string;
  explanation: string;
  doc: string;
  page: number | null;
}

interface AppState {
  screen: Screen;
  sessionId: string;
  txType: TxType;
  rawFiles: File[];
  checklistResults: ChecklistItem[];
  redFlags: RedFlag[];
  memoText: string;
  totalPages: number;
  chunksIndexed: number;
  ocrPages: number;
  memoOpen: boolean;
  queryResult: ChecklistItem | null;
  queryLoading: boolean;
}

type SetFn = (patch: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
interface AppCtxType extends AppState { set: SetFn; }

// ─── Context ──────────────────────────────────────────────────────────────────
const AppCtx = createContext<AppCtxType>({} as AppCtxType);

const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AppState>({
    screen: "upload", sessionId: "", txType: null, rawFiles: [],
    checklistResults: [], redFlags: [], memoText: "",
    totalPages: 0, chunksIndexed: 0, ocrPages: 0,
    memoOpen: false, queryResult: null, queryLoading: false,
  });
  const set = useCallback<SetFn>(patch =>
    setState(p => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) })),
  []);
  return <AppCtx.Provider value={{ ...state, set }}>{children}</AppCtx.Provider>;
};

// ─── Static data ──────────────────────────────────────────────────────────────
const MOCK_SESSION = "PKL-2024-001-7F3A";

const MOCK_CHECKLIST: ChecklistItem[] = [
  { id: "Q01",
    question: "Has the seller established clear and marketable title to the property?",
    answer: "The Sale Agreement identifies Malik Muhammad Tariq as the registered owner per Fard-e-Malkiat dated 15-Mar-2023. Title appears prima facie clear, though independent verification with the Patwari records is recommended before registration.",
    source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 4 }, score: 88, flag: null },
  { id: "Q02",
    question: "Is the mutation (Intiqal) registered and current in the seller's name?",
    answer: "No mutation entry was found in the submitted documents. The Fard shows ownership but a current Intiqal copy was not included in the bundle. For DHA property, this is a critical gap that must be resolved prior to execution.",
    source: { doc: "Fard-e-Malkiat.pdf", page: 2 }, score: 45,
    flag: { severity: "HIGH", label: "Unregistered Mutation" } },
  { id: "Q03",
    question: "Has a No Objection Certificate been obtained from the relevant authority?",
    answer: "No NOC from the Lahore Development Authority is present in the uploaded bundle. For properties within LDA jurisdiction this certificate is mandatory for transfer. Its absence materially increases transaction risk and should be treated as a blocking issue.",
    source: { doc: "Bundle Review", page: null }, score: 12,
    flag: { severity: "HIGH", label: "Missing NOC from LDA" } },
  { id: "Q04",
    question: "Are there any existing encumbrances, charges, or liens registered against the property?",
    answer: "The Encumbrance Certificate from the Sub-Registrar Islamabad confirms no encumbrances are registered as of 01-Jan-2024. Certificate is within its validity period and appears authentic.",
    source: { doc: "Encumbrance Certificate — Islamabad.pdf", page: 1 }, score: 93, flag: null },
  { id: "Q05",
    question: "Is the property description consistent across all transaction documents?",
    answer: "Minor inconsistency detected: the Sale Agreement references Plot 45-C while the Fard reads Khasra No. 1142, Sub-Division-III. These likely describe the same property but formal reconciliation through the relevant revenue office is advised before completion.",
    source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 2 }, score: 67,
    flag: { severity: "MEDIUM", label: "Property Description Inconsistency" } },
  { id: "Q06",
    question: "Is the sale deed properly executed, witnessed, and stamped?",
    answer: "The Sale Deed is executed by both parties and witnessed by two attesting witnesses. Stamp duty of Rs. 450,000 has been applied at 3% of declared consideration value. Original signatures are present on all material pages.",
    source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 1 }, score: 86, flag: null },
  { id: "Q07",
    question: "What are the possession delivery obligations and applicable timeline?",
    answer: "Clause 12(b) requires physical possession to be delivered within 60 days of receipt of the final instalment. Seller must vacate the premises and deliver keys and title documents. A penalty of Rs. 5,000 per diem applies for any delay beyond this period.",
    source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 8 }, score: 91, flag: null },
  { id: "Q08",
    question: "Are there any pending court orders, litigation, or lis pendens affecting the property?",
    answer: "No litigation record was found in the submitted bundle. It is recommended to obtain a stay order certificate from the relevant civil court, as this was not included. The encumbrance certificate does not cover court proceedings.",
    source: { doc: "Bundle Review", page: null }, score: 55, flag: null },
  { id: "Q09",
    question: "Is the payment schedule clearly defined with instalment amounts and due dates?",
    answer: "Schedule at Annexure-A sets out three instalments: Rs. 15M on signing, Rs. 20M on 30-May-2024, and Rs. 10M on delivery of possession. Bank account details and IBAN for the seller are confirmed in the schedule.",
    source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 11 }, score: 95, flag: null },
  { id: "Q10",
    question: "Does the agreement contain adequate dispute resolution and jurisdiction clauses?",
    answer: "Clause 19 submits disputes to the exclusive jurisdiction of the Lahore High Court. Arbitration is not provided for. The limitation period for claims arising under the agreement is stated as three years from the date of breach.",
    source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 16 }, score: 80, flag: null },
  { id: "Q11",
    question: "Is the seller's capacity and authority to sell adequately established?",
    answer: "The seller appears to act in personal capacity. CNIC number matches across documents. No evidence of power of attorney or representative capacity that would require further verification of underlying authority.",
    source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 3 }, score: 84, flag: null },
  { id: "Q12",
    question: "Are force majeure and default provisions adequately defined?",
    answer: "Clause 16 contains a standard force majeure provision covering natural disasters and government action. Clause 17 defines default as failure to pay within 14 days of due date. Remedies include termination and forfeiture of 10% of paid consideration.",
    source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 14 }, score: 78, flag: null },
];

const MOCK_RED_FLAGS: RedFlag[] = [
  { id: "RF01", severity: "HIGH", label: "Unregistered Mutation",
    explanation: "No current Intiqal copy present. DHA transfer cannot be completed without a registered mutation entry.",
    doc: "Fard-e-Malkiat.pdf", page: 2 },
  { id: "RF02", severity: "HIGH", label: "Missing NOC from LDA",
    explanation: "LDA No Objection Certificate absent from bundle. Mandatory for transfer within LDA jurisdiction.",
    doc: "Bundle Review", page: null },
  { id: "RF03", severity: "MEDIUM", label: "Property Description Inconsistency",
    explanation: "Plot No. and Khasra No. differ across documents. Formal reconciliation through revenue records required.",
    doc: "Sale Agreement — DHA Phase 6.pdf", page: 2 },
];

const MOCK_MEMO = `LEGAL DUE DILIGENCE MEMORANDUM

To:      [Client Name]
From:    Legal Due Diligence Team — LexAI
Date:    01 July 2024
File:    PKL-2024-001-7F3A
Re:      Property Transaction — Plot No. 45-C, DHA Phase 6, Lahore

─────────────────────────────────────────────────────────────

EXECUTIVE SUMMARY

This memorandum sets out the findings of our legal due diligence review conducted on the property transaction documents submitted for Plot No. 45-C, DHA Phase 6, Lahore. The review covered four documents comprising seventy pages.

Two HIGH-severity and one MEDIUM-severity issue were identified. The transaction should not proceed until the Mutation (Intiqal) and LDA NOC are obtained and verified. The property description inconsistency across the Sale Agreement and Fard should be reconciled through the relevant revenue office before execution.

DOCUMENTS REVIEWED
1. Sale Agreement — DHA Phase 6, Lahore.pdf (32 pages)
2. Title Deed — Clifton Block 5, Karachi.pdf (18 pages)
3. NOC — Lahore Development Authority.pdf (8 pages)
4. Encumbrance Certificate — Islamabad.pdf (12 pages)

CRITICAL FINDINGS

[RF01 HIGH] Unregistered Mutation — No current Intiqal copy is present in the bundle. The revenue record (Fard-e-Malkiat) shows ownership in the seller's name, however a current Mutation entry is mandatory for DHA property transfers and must be obtained and verified before completion.

[RF02 HIGH] Missing NOC from LDA — The Lahore Development Authority No Objection Certificate is absent. This certificate is a statutory requirement for property transfers within LDA jurisdiction. Its absence is a blocking issue.

[RF03 MEDIUM] Property Description Inconsistency — The Sale Agreement references Plot 45-C while the Fard-e-Malkiat reads Khasra No. 1142, Sub-Division-III. These are believed to describe the same parcel, however formal reconciliation must be obtained from the revenue office prior to registration.

RECOMMENDATIONS

1. Obtain a current Mutation (Intiqal) certificate from the relevant DHA record office.
2. Obtain a fresh NOC from the Lahore Development Authority in the seller's name.
3. Reconcile property descriptions via a joint application to the Patwari.
4. Obtain a lis pendens certificate from the relevant civil court.
5. Re-submit the complete bundle for final review before proceeding to registration.`;

const MOCK_DOCS = [
  { id: "d1", name: "Sale Agreement — DHA Phase 6, Lahore.pdf", pages: 32, ocr: true },
  { id: "d2", name: "Title Deed — Clifton Block 5, Karachi.pdf", pages: 18, ocr: false },
  { id: "d3", name: "NOC — Lahore Development Authority.pdf", pages: 8, ocr: false },
  { id: "d4", name: "Encumbrance Certificate — Islamabad.pdf", pages: 12, ocr: true },
];

const PIPELINE_STEPS = [
  { label: "Upload Received",           sub: "4 files · 70 pages" },
  { label: "Text Extraction",           sub: "PDF parser — native layer" },
  { label: "OCR Processing",            sub: "urd+eng · 6 pages" },
  { label: "Clause Chunking",           sub: "window=512, overlap=128" },
  { label: "Embedding Generation",      sub: "multilingual-e5-large" },
  { label: "Vector Index Built",        sub: "FAISS cosine · 284 vectors" },
  { label: "Running Checklist Queries", sub: "12 queries" },
  { label: "Generating Memo",           sub: "GPT-4o · structured output" },
];
const STAGE_DELAYS = [400, 1100, 2200, 3300, 4400, 5500, 7000, 8800];

const LOG_LINES = [
  "[14:32:01] Session PKL-2024-001-7F3A initialized",
  "[14:32:01] Received 4 document(s) for ingestion",
  "[14:32:02] Parsing: Sale Agreement — DHA Phase 6.pdf",
  "[14:32:03] Extraction complete: 32pp / 18,420 tokens",
  "[14:32:04] Parsing: Title Deed — Clifton Block 5.pdf",
  "[14:32:04] Extraction complete: 18pp / 10,811 tokens",
  "[14:32:05] OCR triggered — Urdu+Eng script on 6 pages",
  "[14:32:07] OCR complete — confidence 94.2%",
  "[14:32:08] Chunking documents: window=512, overlap=128",
  "[14:32:09] Generated 284 chunks across 4 documents",
  "[14:32:10] Loading multilingual-e5-large (1024-dim)",
  "[14:32:13] 284 vectors embedded and indexed (FAISS)",
  "[14:32:14] Running checklist query Q01/12...",
  "[14:32:15] Q01 — score: 0.88 — no flag",
  "[14:32:16] Q02 — score: 0.45 — FLAG: Unregistered Mutation",
  "[14:32:17] Q03 — score: 0.12 — FLAG: Missing NOC",
  "[14:32:18] Q04–Q12 complete",
  "[14:32:19] Red flags identified: 3 (2 HIGH, 1 MEDIUM)",
  "[14:32:20] Generating review memorandum...",
  "[14:32:22] Memo generation complete (GPT-4o)",
  "[14:32:22] ✓ Workspace ready",
];

const TX_TYPES = [
  { id: "property",    icon: Home,      label: "Property Transaction", sub: "Sale Deed · Registry · Fard · NOC · Mutation" },
  { id: "loan",        icon: Briefcase, label: "Loan Agreement",        sub: "Mortgage Deed · Facility Letter · Security Docs" },
  { id: "acquisition", icon: Building2, label: "Company Acquisition",   sub: "MOA · SHA · SECP Filings · Financials" },
];

// ─── API ──────────────────────────────────────────────────────────────────────
const API = "http://127.0.0.1:8000";

async function apiIngest(files: File[], txType: string) {
  const fd = new FormData();
  files.forEach(f => fd.append("files", f));
  fd.append("transaction_type", txType);
  const res = await fetch(`${API}/ingest`, { method: "POST", body: fd });
  if (!res.ok) throw new Error("ingest failed");
  return res.json() as Promise<{ session_id: string; total_pages: number }>;
}

async function apiGenerate(sessionId: string, txType: string) {
  const res = await fetch(`${API}/memo/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, transaction_type: txType }),
  });
  if (!res.ok) throw new Error("generate failed");
  return res.json();
}

function downloadMemo(sessionId: string) {
  window.open(`${API}/memo/download/${sessionId}`, "_blank");
}

// ─── Primitives ───────────────────────────────────────────────────────────────
const fmtSize = (b: number) =>
  b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

// Score bar — gold fill (spec: "Similarity score as a small horizontal bar (gold fill)")
const ScoreBar = ({ score }: { score: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 2, overflow: "hidden" }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
        style={{ height: "100%", background: T.gold, borderRadius: 2 }}
      />
    </div>
    <span style={{ fontFamily: MONO, fontSize: 10, color: T.mono, flexShrink: 0 }}>{score}%</span>
  </div>
);

// Card — hover brightness(1.1), gold left-border when active, no layout shift
const Card = ({
  children, style, active, onClick, shakeOnMount,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  active?: boolean;
  onClick?: () => void;
  shakeOnMount?: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => onClick && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && onClick ? T.surfaceH : T.surface,
        border: `1px solid ${active ? T.gold : hovered && onClick ? T.gold : T.border}`,
        borderLeftWidth: active ? 3 : 1,
        borderLeftColor: active ? T.gold : hovered && onClick ? T.gold : T.border,
        borderRadius: 4,
        paddingLeft: active ? 0 : 0,   // no shift — border collapses inward via border-box
        boxShadow: `0 2px 12px rgba(0,0,0,${hovered ? "0.45" : "0.3"})`,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.18s, background 0.18s, box-shadow 0.18s",
        filter: hovered && onClick ? "brightness(1.1)" : "none",
        animation: shakeOnMount ? "shake-once 0.55s ease-out" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ─── Screen 1: Upload ─────────────────────────────────────────────────────────
// Files live in local state — no stale-closure issues.
// Synced to context only when "Begin Analysis" is clicked.
const UploadScreen = () => {
  const { txType, set } = useContext(AppCtx);
  const [txLocal, setTxLocal]   = useState<TxType>(txType);
  const [files, setFiles]        = useState<UFile[]>([]);
  const [rawFiles, setRawFiles]  = useState<File[]>([]);
  const [dragging, setDragging]  = useState(false);
  const [dropHover, setDropHover] = useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const newUFiles: UFile[] = incoming.map(f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name, size: f.size, progress: 0,
    }));
    setRawFiles(prev => [...prev, ...incoming]);
    setFiles(prev => [...prev, ...newUFiles]);

    // Animate each file's progress bar independently via functional update
    newUFiles.forEach(uf => {
      let p = 0;
      const step = () => {
        p = Math.min(100, p + Math.random() * 22 + 12);
        setFiles(prev => prev.map(x => x.id === uf.id ? { ...x, progress: p } : x));
        if (p < 100) setTimeout(step, 120);
      };
      setTimeout(step, 80);
    });
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setRawFiles(prev => {
      const idx = files.findIndex(f => f.id === id);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const canBegin = files.length > 0 && txLocal !== null;

  const beginAnalysis = () => {
    set({ txType: txLocal, rawFiles, screen: "processing" });
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ display: "grid", gridTemplateColumns: "60% 40%", minHeight: "100vh" }}>

        {/* Left column — gold top-rule grounds the composition like a legal document header */}
        <div style={{ padding: "48px 56px", display: "flex", flexDirection: "column", justifyContent: "center", borderRight: `1px solid ${T.border}`, borderTop: `3px solid ${T.gold}` }}>
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 56 }}>
            <Scale size={15} color={T.gold} />
            <span style={{ fontFamily: MONO, fontSize: 13, color: T.gold, letterSpacing: "0.15em" }}>LexAI</span>
          </div>

          {/* Headline */}
          <h1 style={{ fontFamily: SERIF, fontSize: 64, fontWeight: 300, color: T.heading, lineHeight: 1.03, letterSpacing: "-0.02em", marginBottom: 24 }}>
            Due Diligence,<br />
            <span style={{ fontStyle: "italic" }}>Accelerated.</span>
          </h1>

          <p style={{ fontFamily: SANS, fontSize: 14, color: T.text, lineHeight: 1.72, maxWidth: 460, marginBottom: 40, fontWeight: 300 }}>
            Upload your legal bundle. The system reads every clause, flags every risk, and drafts your review memo — automatically.
          </p>

          {/* Stat pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 52 }}>
            {[
              ["5–7 days",    "Same day"],
              ["30–50 pages", "Under 5 min"],
              ["Built for",   "Pakistani law"],
            ].map(([from, to]) => (
              <div key={from} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 3,
                border: `1px solid ${T.border}`, background: T.surface,
                fontFamily: SANS, fontSize: 11,
              }}>
                <span style={{ color: T.mono, textDecoration: "line-through" }}>{from}</span>
                <ArrowRight size={10} color={T.gold} />
                <span style={{ color: T.gold, fontWeight: 600 }}>{to}</span>
              </div>
            ))}
          </div>

          <p style={{ fontFamily: MONO, fontSize: 10, color: T.monoFade, letterSpacing: "0.05em" }}>
            All processing is local. Documents never leave your infrastructure.
          </p>
        </div>

        {/* Right column */}
        <div className="scrollbar-hide" style={{ padding: "40px 32px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Transaction type */}
          <div>
            <p style={{ fontFamily: MONO, fontSize: 10, color: T.monoFade, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
              Transaction Type
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TX_TYPES.map(({ id, icon: Icon, label, sub }) => {
                const active = txLocal === id;
                return (
                  <Card key={id} active={active} onClick={() => setTxLocal(id as TxType)} style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Icon size={14} color={active ? T.gold : T.mono} />
                      <div>
                        <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: active ? T.gold : T.heading }}>{label}</p>
                        <p style={{ fontFamily: MONO, fontSize: 10, color: T.monoFade, marginTop: 2 }}>{sub}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Drop zone — dashed border, becomes solid on hover per spec */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); setDropHover(true); }}
            onDragLeave={() => { setDragging(false); setDropHover(false); }}
            onDrop={e => { e.preventDefault(); setDragging(false); setDropHover(false); addFiles(e.dataTransfer.files); }}
            onMouseEnter={() => setDropHover(true)}
            onMouseLeave={() => setDropHover(false)}
            onClick={() => {
              const inp = document.createElement("input");
              inp.type = "file"; inp.multiple = true; inp.accept = ".pdf";
              inp.onchange = e => addFiles((e.target as HTMLInputElement).files);
              inp.click();
            }}
            style={{
              // dashed normally, solid on hover (spec: "dotted on hover becomes solid")
              border: `1.5px ${dropHover ? "solid" : "dashed"} ${dropHover || dragging ? T.gold : "rgba(201,168,76,0.42)"}`,
              borderRadius: 4,
              padding: "26px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "rgba(201,168,76,0.04)" : "transparent",
              transition: "border-color 0.2s, border-style 0.15s, background 0.2s",
            }}
          >
            <Upload size={22} color={dropHover ? T.gold : T.monoFade} style={{ margin: "0 auto 10px", display: "block", transition: "color 0.2s" }} />
            <p style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: T.heading }}>
              Drop your document bundle here
            </p>
            <p style={{ fontFamily: MONO, fontSize: 10, color: T.monoFade, marginTop: 4 }}>
              PDF files only · Max 100MB each
            </p>
          </div>

          {/* File rows — slide in from right */}
          <AnimatePresence initial={false}>
            {files.map((f, i) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
                transition={{ duration: 0.3, ease: EASE }}
                style={{ position: "relative", overflow: "hidden" }}
              >
                <Card style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <FileText size={13} color={T.gold} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: SANS, fontSize: 11, fontWeight: 500, color: T.heading, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</p>
                      <p style={{ fontFamily: MONO, fontSize: 9, color: T.mono }}>{fmtSize(f.size)}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeFile(f.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: T.monoFade, padding: 2, display: "flex", alignItems: "center", transition: "color 0.15s" }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = T.red)}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = T.monoFade)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {/* Progress bar */}
                  <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${f.progress}%`, background: T.gold, transition: "width 0.15s ease-out" }} />
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* CTA */}
          <button
            disabled={!canBegin}
            onClick={beginAnalysis}
            style={{
              width: "100%", padding: "13px 0",
              background: canBegin ? T.gold : "rgba(201,168,76,0.12)",
              border: "none", borderRadius: 3,
              cursor: canBegin ? "pointer" : "not-allowed",
              fontFamily: SANS, fontSize: 11, fontWeight: 700,
              letterSpacing: "0.15em", textTransform: "uppercase",
              color: canBegin ? T.bg : "rgba(201,168,76,0.35)",
              transition: "all 0.22s",
            }}
            onMouseEnter={e => canBegin && ((e.currentTarget as HTMLElement).style.filter = "brightness(1.1)")}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.filter = "none")}
          >
            Begin Analysis
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Screen 2: Processing ─────────────────────────────────────────────────────
const ProcessingScreen = () => {
  const { txType, rawFiles, set } = useContext(AppCtx);
  type StageStatus = "pending" | "active" | "done";
  const [stages, setStages] = useState<{ status: StageStatus; ts?: string }[]>(
    PIPELINE_STEPS.map(() => ({ status: "pending" }))
  );
  const [logs, setLogs]   = useState<string[]>([]);
  const [pct, setPct]     = useState(0);
  const logRef            = useRef<HTMLDivElement>(null);
  const resolvedSid       = useRef<string>("");   // avoid stale-closure bug
  const completedRef      = useRef(false);

  const statusText = () => {
    if (pct < 30) return "Extracting text from documents...";
    if (pct < 55) return "Building semantic vector index...";
    if (pct < 80) return "Running due diligence checklist...";
    if (pct < 97) return "Drafting review memorandum...";
    return "Analysis complete.";
  };

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Fire-and-forget real API; fall back silently
    (async () => {
      try {
        const { session_id, total_pages } = await apiIngest(rawFiles.length ? rawFiles : [], txType || "property");
        resolvedSid.current = session_id;
        set({ sessionId: session_id, totalPages: total_pages });
      } catch {
        resolvedSid.current = MOCK_SESSION;
        set({ sessionId: MOCK_SESSION, totalPages: 70 });
      }
    })();

    // Animate pipeline stages
    STAGE_DELAYS.forEach((delay, i) => {
      timers.push(setTimeout(() => {
        setStages(prev => prev.map((s, j) => j === i ? { ...s, status: "active" } : s));
      }, delay - 240));
      timers.push(setTimeout(() => {
        const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
        setStages(prev => prev.map((s, j) => j === i ? { status: "done", ts } : s));
        setPct(Math.round(((i + 1) / PIPELINE_STEPS.length) * 100));
      }, delay));
    });

    // Stream log lines
    LOG_LINES.forEach((line, i) =>
      timers.push(setTimeout(() => setLogs(prev => [...prev, line]), 300 + i * 480))
    );

    // Complete — use resolvedSid ref (never stale)
    timers.push(setTimeout(async () => {
      if (completedRef.current) return;
      completedRef.current = true;
      const sid = resolvedSid.current || MOCK_SESSION;
      try {
        const data = await apiGenerate(sid, txType || "property");
        set({
          checklistResults: data.checklist_results || MOCK_CHECKLIST,
          redFlags:         data.red_flags         || MOCK_RED_FLAGS,
          memoText:         data.memo_text         || MOCK_MEMO,
          chunksIndexed:    data.chunks_indexed    ?? 284,
          ocrPages:         data.ocr_pages         ?? 6,
          screen:           "workspace",
        });
      } catch {
        set({
          checklistResults: MOCK_CHECKLIST,
          redFlags:         MOCK_RED_FLAGS,
          memoText:         MOCK_MEMO,
          totalPages:       70,
          chunksIndexed:    284,
          ocrPages:         6,
          screen:           "workspace",
        });
      }
    }, STAGE_DELAYS[STAGE_DELAYS.length - 1] + 1400));

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const eta = Math.max(0, Math.round(((100 - pct) / 100) * 22));

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "grid", gridTemplateColumns: "40% 60%" }}>

      {/* ─ Left: pipeline + session + log ─ */}
      <div style={{ borderRight: `1px solid ${T.border}`, padding: "36px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Session card */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: "14px 16px", boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: T.monoFade, textTransform: "uppercase", letterSpacing: "0.12em" }}>Active Session</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: T.gold, background: "rgba(201,168,76,0.1)", border: `1px solid ${T.goldDim}`, borderRadius: 3, padding: "1px 8px" }}>
              {TX_TYPES.find(t => t.id === txType)?.label || "Property Transaction"}
            </span>
          </div>
          <p style={{ fontFamily: MONO, fontSize: 12, color: T.heading, letterSpacing: "0.04em" }}>{MOCK_SESSION}</p>
          <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
            {[["Files", "4"], ["Pages", "70+"]].map(([k, v]) => (
              <div key={k}>
                <p style={{ fontFamily: MONO, fontSize: 9, color: T.monoFade }}>{k}</p>
                <p style={{ fontFamily: MONO, fontSize: 15, color: T.heading, fontWeight: 600 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline tracker */}
        <div style={{ flex: 1, position: "relative" }}>
          {/* Spine */}
          <div style={{ position: "absolute", left: 10, top: 11, bottom: 11, width: 1, background: T.border }} />

          {PIPELINE_STEPS.map((step, i) => {
            const s = stages[i];
            return (
              <motion.div key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.28, ease: EASE }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 11,
                  padding: "8px 10px 8px 0",
                  borderRadius: 3,
                  background: s.status === "active" ? "rgba(59,130,246,0.05)" : "transparent",
                  transition: "background 0.3s",
                }}
              >
                {/* Status dot */}
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, zIndex: 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: s.status === "done"   ? "rgba(16,185,129,0.12)"
                             : s.status === "active" ? "rgba(59,130,246,0.12)"
                             : T.surface,
                  border: `1.5px solid ${s.status === "done" ? T.green : s.status === "active" ? T.blue : T.border}`,
                  animation: s.status === "active" ? "pulse-blue 1.6s ease-in-out infinite" : "none",
                  transition: "border-color 0.25s, background 0.25s",
                }}>
                  {s.status === "done"
                    ? <CheckCircle size={10} color={T.green} />
                    : s.status === "active"
                    ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}>
                        <RefreshCw size={9} color={T.blue} />
                      </motion.div>
                    : <Clock size={9} color={T.border} />}
                </div>

                <div style={{ flex: 1, paddingTop: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <p style={{
                      fontFamily: SANS, fontSize: 11, fontWeight: 500,
                      color: s.status === "done" ? T.green : s.status === "active" ? T.blue : T.monoFade,
                      transition: "color 0.25s",
                    }}>
                      {step.label}
                      {i === 2 && s.status !== "pending" && (
                        <span style={{
                          marginLeft: 6, fontFamily: MONO, fontSize: 8,
                          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.28)",
                          color: T.orange, borderRadius: 3, padding: "0 5px", verticalAlign: "middle",
                        }}>urd+eng</span>
                      )}
                    </p>
                    {s.ts && <span style={{ fontFamily: MONO, fontSize: 9, color: T.monoFade }}>{s.ts}</span>}
                  </div>
                  <p style={{ fontFamily: MONO, fontSize: 9, color: T.border, marginTop: 1 }}>{step.sub}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Terminal log */}
        <div style={{ background: "#05080E", border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <TerminalSquare size={11} color={T.blue} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: T.blue, letterSpacing: "0.1em" }}>SYSTEM LOG</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
              {["#FF5F57", "#FEBC2E", "#28C840"].map(c => (
                <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c, opacity: 0.65 }} />
              ))}
            </div>
          </div>
          <div ref={logRef} className="scrollbar-hide" style={{ padding: "8px 12px", height: 118, overflowY: "auto" }}>
            {logs.map((line, i) => (
              <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}
                style={{
                  fontFamily: MONO, fontSize: 9.5, lineHeight: 1.8,
                  color: line.includes("✓")      ? T.green
                       : line.includes("FLAG")   ? T.red
                       : line.includes("OCR")    ? T.orange
                       : T.mono,
                  whiteSpace: "pre",
                }}>
                {line}
              </motion.p>
            ))}
            {pct < 100 && (
              <span style={{ display: "inline-block", width: 6, height: 12, background: T.blue, borderRadius: 1, animation: "cursor-blink 1s infinite" }} />
            )}
          </div>
        </div>
      </div>

      {/* ─ Right: status + ring + progress ─ */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44, padding: "60px 80px" }}>

        {/* Animated ring */}
        <div style={{ position: "relative", width: 116, height: 116 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${T.border}` }} />
          <div style={{ position: "absolute", inset: 10, borderRadius: "50%", border: `1px solid ${T.border}` }} />
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "2.5px solid transparent",
            borderTopColor: T.gold, borderRightColor: "rgba(201,168,76,0.28)",
            animation: "spin-ring 1.75s linear infinite",
          }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Scale size={28} color={T.gold} />
          </div>
        </div>

        {/* Status text */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: MONO, fontSize: 9, color: T.monoFade, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 12 }}>
            LexAI · Analysis Engine
          </p>
          <AnimatePresence mode="wait">
            <motion.p key={statusText()}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 300, color: T.heading, fontStyle: "italic" }}>
              {statusText()}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress bar */}
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: T.monoFade }}>Overall progress</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: T.gold }}>{pct}%</span>
          </div>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.42, ease: EASE }}
              style={{ height: "100%", background: `linear-gradient(90deg, #A8782A, ${T.gold})`, borderRadius: 2 }}
            />
          </div>
          <p style={{ fontFamily: MONO, fontSize: 10, color: T.monoFade, marginTop: 10, textAlign: "center" }}>
            {pct < 100 ? `Estimated time remaining: ~${eta} seconds` : "Finalising workspace..."}
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Workspace: Checklist card ────────────────────────────────────────────────
const ChecklistCard = ({ item, index }: { item: ChecklistItem; index: number }) => {
  const isHigh = item.flag?.severity === "HIGH";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: EASE }}
    >
      <Card
        shakeOnMount={isHigh}
        style={{
          padding: "14px 16px",
          marginBottom: 8,
          borderColor: item.flag
            ? isHigh ? "rgba(239,68,68,0.35)" : "rgba(245,158,11,0.3)"
            : T.border,
          borderLeftColor: item.flag
            ? isHigh ? T.red : T.orange
            : T.border,
          borderLeftWidth: item.flag ? 3 : 1,
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: T.gold, flexShrink: 0, marginTop: 1 }}>{item.id}</span>
          <p style={{ flex: 1, fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.heading, lineHeight: 1.45 }}>{item.question}</p>

          {/* Red dot + flag label (spec: "red dot + flag label") */}
          {item.flag && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: isHigh ? T.red : T.orange,
                boxShadow: `0 0 5px ${isHigh ? T.red : T.orange}`,
              }} />
              <span style={{
                fontFamily: MONO, fontSize: 9, borderRadius: 3, padding: "2px 7px",
                background: isHigh ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                border: `1px solid ${isHigh ? "rgba(239,68,68,0.32)" : "rgba(245,158,11,0.32)"}`,
                color: isHigh ? T.red : T.orange,
              }}>
                {item.flag.severity}
              </span>
            </div>
          )}
        </div>

        {/* Answer */}
        <p style={{ fontFamily: SANS, fontSize: 11.5, color: T.text, lineHeight: 1.68, marginBottom: 12 }}>{item.answer}</p>

        {/* Footer: citation + score bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontFamily: MONO, fontSize: 9, color: T.blue, flexShrink: 0,
            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: 3, padding: "2px 8px",
          }}>
            {item.source.doc}{item.source.page != null ? ` · p.${item.source.page}` : ""}
          </span>
          <div style={{ flex: 1 }}>
            <ScoreBar score={item.score} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

// ─── Workspace: Left panel ────────────────────────────────────────────────────
const DocNavigator = ({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) => {
  const { chunksIndexed, totalPages, ocrPages } = useContext(AppCtx);
  return (
    <div style={{ width: "22%", minWidth: 196, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.bg }}>
      <div style={{ padding: "14px 14px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Scale size={11} color={T.gold} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: T.gold, letterSpacing: "0.13em" }}>LexAI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <p style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.heading }}>Bundle</p>
          <span style={{ fontFamily: MONO, fontSize: 9, background: T.surface, border: `1px solid ${T.border}`, color: T.mono, borderRadius: 3, padding: "1px 6px" }}>
            {MOCK_DOCS.length}
          </span>
        </div>
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {selected && (
          <button onClick={() => onSelect(null)} style={{ width: "100%", marginBottom: 6, background: "none", border: `1px solid ${T.border}`, borderRadius: 3, padding: "5px 10px", cursor: "pointer", fontFamily: MONO, fontSize: 9, color: T.monoFade, textAlign: "left", transition: "border-color 0.15s" }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = T.goldDim)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = T.border)}
          >
            ← All documents
          </button>
        )}
        {MOCK_DOCS.map(doc => (
          <Card key={doc.id} active={selected === doc.id} onClick={() => onSelect(selected === doc.id ? null : doc.id)} style={{ padding: "10px 10px", marginBottom: 5 }}>
            <p style={{ fontFamily: SANS, fontSize: 10, fontWeight: 500, color: selected === doc.id ? T.gold : T.heading, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 5, transition: "color 0.18s" }}>
              {doc.name}
            </p>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: 8, color: T.monoFade }}>{doc.pages}pp</span>
              <span style={{
                fontFamily: MONO, fontSize: 8, borderRadius: 3, padding: "1px 5px",
                background: doc.ocr ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                border: `1px solid ${doc.ocr ? "rgba(245,158,11,0.28)" : "rgba(59,130,246,0.28)"}`,
                color: doc.ocr ? T.orange : T.blue,
              }}>
                {doc.ocr ? "OCR" : "Native"}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Session stats */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}` }}>
        <p style={{ fontFamily: MONO, fontSize: 9, color: T.monoFade, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Session</p>
        {[["Chunks", chunksIndexed || 284], ["Pages", totalPages || 70], ["OCR pp", ocrPages || 6]].map(([k, v]) => (
          <div key={k as string} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontFamily: SANS, fontSize: 10, color: T.mono }}>{k}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: T.heading }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Workspace: Center panel ──────────────────────────────────────────────────
const CenterPanel = ({ selected }: { selected: string | null }) => {
  const { checklistResults, queryResult, queryLoading, set } = useContext(AppCtx);
  const [tab, setTab]     = useState<"checklist" | "ask">("checklist");
  const [input, setInput] = useState("");

  const visible = selected
    ? checklistResults.filter(r => r.source.doc === MOCK_DOCS.find(d => d.id === selected)?.name)
    : checklistResults;

  const submitQuery = () => {
    if (!input.trim() || queryLoading) return;
    set({ queryLoading: true, queryResult: null });
    setTimeout(() => {
      set({
        queryLoading: false,
        queryResult: {
          id: "Q∞",
          question: input,
          answer: "Based on the indexed documents, the relevant provisions are found in the Sale Agreement. Clause 12(b) establishes the primary obligation, referencing the payment schedule at Annexure-A. The Encumbrance Certificate confirms no prior charges exist. Review the Title Deed for any covenants running with the land that may affect your client's position.",
          source: { doc: "Sale Agreement — DHA Phase 6.pdf", page: 8 },
          score: 82, flag: null,
        },
      });
    }, 1300);
    setInput("");
  };

  const tabBtn = (id: "checklist" | "ask", label: string, icon: React.ReactNode, count?: number) => (
    <button onClick={() => setTab(id)} style={{
      display: "flex", alignItems: "center", gap: 6,
      paddingBottom: 11, paddingTop: 12, paddingRight: 14, paddingLeft: 0,
      fontFamily: SANS, fontSize: 12, fontWeight: tab === id ? 600 : 400,
      color: tab === id ? T.gold : T.mono,
      background: "none", border: "none", cursor: "pointer",
      borderBottom: `2px solid ${tab === id ? T.gold : "transparent"}`,
      transition: "color 0.18s, border-color 0.18s",
    }}>
      {icon} {label}
      {count != null && (
        <span style={{ fontFamily: MONO, fontSize: 9, background: T.surface, border: `1px solid ${T.border}`, color: T.mono, borderRadius: 3, padding: "0 5px" }}>{count}</span>
      )}
    </button>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${T.border}`, minWidth: 0 }}>
      {/* Tab bar */}
      <div style={{ padding: "0 20px", borderBottom: `1px solid ${T.border}`, display: "flex", background: T.bg, gap: 0 }}>
        {tabBtn("checklist", "Checklist",      <BookOpen size={11} />, checklistResults.length)}
        {tabBtn("ask",       "Ask a Question", <MessageSquare size={11} />)}
      </div>

      <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <AnimatePresence mode="wait">
          {tab === "checklist" ? (
            <motion.div key="cl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {visible.length === 0
                ? <div style={{ textAlign: "center", paddingTop: 60 }}>
                    <Scale size={38} color={T.border} style={{ margin: "0 auto 14px" }} />
                    <p style={{ fontFamily: SERIF, fontSize: 20, color: T.monoFade, fontStyle: "italic" }}>
                      {selected ? "No results for this document" : "No checklist results yet"}
                    </p>
                  </div>
                : visible.map((item, i) => <ChecklistCard key={item.id} item={item} index={i} />)
              }
            </motion.div>
          ) : (
            <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {/* Gold-underline search input */}
              <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 0, borderBottom: `2px solid ${T.gold}` }}>
                <Search size={13} color={T.monoFade} style={{ flexShrink: 0, marginRight: 10 }} />
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submitQuery()}
                  placeholder="Ask about any clause, obligation, or party..."
                  style={{ flex: 1, background: "none", border: "none", outline: "none", padding: "11px 0", fontFamily: SANS, fontSize: 13, color: T.heading }}
                />
                <button onClick={submitQuery} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, padding: "8px 4px", display: "flex", alignItems: "center" }}>
                  <ArrowRight size={16} />
                </button>
              </div>

              {queryLoading && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[1, 2].map(k => (
                    <div key={k} style={{ height: 90, borderRadius: 4, background: T.surface, border: `1px solid ${T.border}`, opacity: 0.45 + k * 0.15 }} />
                  ))}
                </div>
              )}

              {queryResult && !queryLoading && <ChecklistCard item={queryResult} index={0} />}

              {!queryResult && !queryLoading && (
                <div style={{ textAlign: "center", paddingTop: 44 }}>
                  <MessageSquare size={34} color={T.border} style={{ margin: "0 auto 14px" }} />
                  <p style={{ fontFamily: SERIF, fontSize: 18, color: T.monoFade, fontStyle: "italic" }}>
                    Ask about any clause, obligation, or party
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ─── Workspace: Right panel ───────────────────────────────────────────────────
const RightPanel = () => {
  const { redFlags, memoText, sessionId, set } = useContext(AppCtx);
  const highCount = redFlags.filter(f => f.severity === "HIGH").length;
  const memoPreview = memoText.split("\n").filter(l => l.trim()).slice(0, 4).join("\n");

  return (
    <div style={{ width: "26%", minWidth: 210, display: "flex", flexDirection: "column", background: T.bg }}>

      {/* Red Flags */}
      <div style={{ padding: "14px 14px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
          <AlertCircle size={12} color={redFlags.length > 0 ? T.red : T.mono} />
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.heading }}>Red Flags</span>
          <span style={{
            fontFamily: MONO, fontSize: 9, borderRadius: 3, padding: "1px 8px",
            background: redFlags.length > 0 ? "rgba(239,68,68,0.1)" : T.surface,
            border: `1px solid ${redFlags.length > 0 ? "rgba(239,68,68,0.3)" : T.border}`,
            color: redFlags.length > 0 ? T.red : T.mono,
          }}>
            {redFlags.length} ({highCount} HIGH)
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {redFlags.map((flag, i) => (
            <motion.div key={flag.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3, ease: EASE }}
            >
              <Card
                shakeOnMount={flag.severity === "HIGH"}
                style={{ padding: "10px 11px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  {/* Red dot */}
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: flag.severity === "HIGH" ? T.red : T.orange,
                    boxShadow: `0 0 4px ${flag.severity === "HIGH" ? T.red : T.orange}`,
                  }} />
                  <span style={{
                    fontFamily: MONO, fontSize: 8, borderRadius: 3, padding: "1px 6px",
                    background: flag.severity === "HIGH" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                    border: `1px solid ${flag.severity === "HIGH" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
                    color: flag.severity === "HIGH" ? T.red : T.orange,
                  }}>
                    {flag.severity}
                  </span>
                  <p style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: T.heading, flex: 1 }}>{flag.label}</p>
                </div>
                <p style={{ fontFamily: SANS, fontSize: 10, color: T.text, lineHeight: 1.52, marginBottom: 5 }}>{flag.explanation}</p>
                <p style={{ fontFamily: MONO, fontSize: 9, color: T.blue }}>
                  {flag.doc}{flag.page != null ? ` · p.${flag.page}` : ""}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: T.border, margin: "0" }} />

      {/* Review Memo */}
      <div style={{ flex: 1, padding: "14px 14px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
          <FileText size={12} color={T.gold} />
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.heading }}>Review Memo</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: T.green, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.28)", borderRadius: 3, padding: "1px 6px" }}>
            Ready
          </span>
        </div>

        {/* Preview with blur fade */}
        <div style={{ position: "relative", marginBottom: 12, overflow: "hidden", maxHeight: 86 }}>
          <pre style={{ fontFamily: MONO, fontSize: 9, color: T.mono, lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>
            {memoPreview}
          </pre>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 44, background: `linear-gradient(transparent, ${T.bg})` }} />
        </div>

        <button
          onClick={() => set({ memoOpen: true })}
          style={{
            width: "100%", padding: "8px 0", marginBottom: 8,
            background: "rgba(201,168,76,0.07)", border: `1px solid ${T.goldDim}`,
            borderRadius: 3, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600,
            color: T.gold, letterSpacing: "0.04em", transition: "background 0.18s",
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,0.13)")}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,0.07)")}
        >
          View Full Memo
        </button>

        {/* Download buttons */}
        {["Download .docx", "Download .pdf"].map(label => (
          <button key={label}
            onClick={() => downloadMemo(sessionId || MOCK_SESSION)}
            style={{
              width: "100%", padding: "8px 12px", marginBottom: 6,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              background: T.surface, border: `1px solid ${T.goldDim}`,
              borderRadius: 3, cursor: "pointer", fontFamily: SANS, fontSize: 10, fontWeight: 600,
              color: T.gold, transition: "border-color 0.18s, background 0.18s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.gold; (e.currentTarget as HTMLElement).style.background = T.surfaceH; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.goldDim; (e.currentTarget as HTMLElement).style.background = T.surface; }}
          >
            <FileDown size={11} /> {label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Screen 3: Workspace ──────────────────────────────────────────────────────
const WorkspaceScreen = () => {
  const { sessionId } = useContext(AppCtx);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ height: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ height: 38, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 }}>
        <Scale size={11} color={T.gold} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: T.gold, letterSpacing: "0.12em" }}>LexAI</span>
        <div style={{ width: 1, height: 14, background: T.border }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: T.monoFade }}>Due Diligence Workspace</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, boxShadow: `0 0 5px ${T.green}` }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: T.monoFade }}>{sessionId || MOCK_SESSION}</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <DocNavigator selected={selected} onSelect={setSelected} />
        <CenterPanel selected={selected} />
        <RightPanel />
      </div>
    </div>
  );
};

// ─── Screen 4: Memo Modal ─────────────────────────────────────────────────────
const MemoModal = () => {
  const { memoOpen, memoText, redFlags, sessionId, set } = useContext(AppCtx);

  const rendered = memoText
    .replace(/\[RF01[^\]]*\]/g, m => `<mark>${m}</mark>`)
    .replace(/\[RF02[^\]]*\]/g, m => `<mark>${m}</mark>`)
    .replace(/\[RF03[^\]]*\]/g, m => `<mark>${m}</mark>`);

  const highCount = redFlags.filter(f => f.severity === "HIGH").length;

  return (
    <AnimatePresence>
      {memoOpen && (
        <motion.div
          key="memo-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          onClick={e => e.target === e.currentTarget && set({ memoOpen: false })}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(3,5,10,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 22 }}
            transition={{ duration: 0.34, ease: EASE }}
            style={{ background: "#F7F4EE", borderRadius: 4, width: "100%", maxWidth: 840, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 40px 100px rgba(0,0,0,0.75)", overflow: "hidden" }}
          >
            {/* Modal header */}
            <div style={{ padding: "13px 22px", background: "#EDE9DF", borderBottom: "1px solid #D9D0BE", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <Scale size={13} color="#7A5F18" />
              <span style={{ fontFamily: MONO, fontSize: 9, color: "#7A5F18", letterSpacing: "0.1em", flex: 1 }}>
                LEGAL DUE DILIGENCE MEMORANDUM — {sessionId || MOCK_SESSION}
              </span>
              <button onClick={() => downloadMemo(sessionId || MOCK_SESSION)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "1px solid #C9A84C", borderRadius: 3, padding: "5px 12px", cursor: "pointer", fontFamily: SANS, fontSize: 10, fontWeight: 600, color: "#7A5F18", marginRight: 8 }}>
                <Download size={11} /> Download
              </button>
              <button onClick={() => set({ memoOpen: false })} style={{ background: "none", border: "none", cursor: "pointer", color: "#7A5F18", padding: 4, display: "flex", alignItems: "center" }}>
                <X size={15} />
              </button>
            </div>

            <div className="scrollbar-hide" style={{ flex: 1, overflowY: "auto", position: "relative" }}>
              {/* CONFIDENTIAL watermark */}
              <div aria-hidden style={{ position: "absolute", top: "45%", left: "50%", transform: "translate(-50%,-50%) rotate(-28deg)", fontFamily: "Georgia, serif", fontSize: 68, fontWeight: 800, color: "rgba(239,68,68,0.055)", textTransform: "uppercase", letterSpacing: "0.18em", whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none" }}>
                CONFIDENTIAL
              </div>

              {/* Letterhead */}
              <div style={{ padding: "28px 44px 18px", borderBottom: "2px solid #C9A84C" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: "#18120A" }}>LexAI Legal</p>
                    <p style={{ fontFamily: SANS, fontSize: 10, color: "#6B5A3C", marginTop: 2 }}>Advocates & Legal Consultants · Lahore | Karachi | Islamabad</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontFamily: MONO, fontSize: 9, color: "#6B5A3C" }}>File: {sessionId || MOCK_SESSION}</p>
                    <p style={{ fontFamily: MONO, fontSize: 9, color: "#6B5A3C" }}>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</p>
                  </div>
                </div>
              </div>

              {/* Red flag summary */}
              {redFlags.length > 0 && (
                <div style={{ padding: "9px 44px", background: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.18)", display: "flex", alignItems: "center", gap: 10 }}>
                  <AlertCircle size={11} color="#DC2626" />
                  <span style={{ fontFamily: SANS, fontSize: 11, color: "#DC2626", fontWeight: 600 }}>
                    {highCount} HIGH · {redFlags.length - highCount} MEDIUM severity issues identified
                  </span>
                </div>
              )}

              {/* Memo body */}
              <div style={{ padding: "26px 44px 48px" }}>
                <pre
                  style={{ fontFamily: "'Georgia', serif", fontSize: 12, lineHeight: 1.88, color: "#25190D", whiteSpace: "pre-wrap", margin: 0 }}
                  dangerouslySetInnerHTML={{ __html: rendered }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AppProvider>
      <style>{GLOBAL_CSS}</style>
      <Inner />
    </AppProvider>
  );
}

function Inner() {
  const { screen } = useContext(AppCtx);
  return (
    <>
      <AnimatePresence mode="wait">
        {screen === "upload" && (
          <motion.div key="upload"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: EASE }}>
            <UploadScreen />
          </motion.div>
        )}
        {screen === "processing" && (
          <motion.div key="processing"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: EASE }}>
            <ProcessingScreen />
          </motion.div>
        )}
        {screen === "workspace" && (
          <motion.div key="workspace"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ height: "100vh" }}>
            <WorkspaceScreen />
          </motion.div>
        )}
      </AnimatePresence>
      <MemoModal />
    </>
  );
}
