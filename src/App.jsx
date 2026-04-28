import { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = ['.pdf', '.csv', '.xlsx', '.xls', '.txt', '.json', '.tsv', '.md'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isAccepted(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext) || file.type.includes('text') ||
    file.type === 'application/pdf' || file.type.includes('spreadsheet') || file.type.includes('excel');
}

function fmt(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return null;
  return val;
}

function hasContent(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({ label, color = 'indigo' }) {
  return <span className={`badge badge-${color}`}>{label}</span>;
}

function ConfidencePip({ level }) {
  const map = { High: 'green', Medium: 'yellow', Low: 'red' };
  return <Badge label={`${level} Confidence`} color={map[level] || 'gray'} />;
}

function Section({ title, children, icon, fullWidth = false }) {
  return (
    <div className={`section ${fullWidth ? 'section-full' : ''}`}>
      <h3 className="section-title">
        {icon && <span className="section-icon">{icon}</span>}
        {title}
      </h3>
      <div className="section-body">{children}</div>
    </div>
  );
}

function Field({ label, value }) {
  if (!fmt(value)) return null;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <span className="field-value">{String(value)}</span>
    </div>
  );
}

function PartiesTable({ parties }) {
  if (!hasContent(parties)) return <p className="empty-note">No parties identified.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Role</th><th>Type</th><th>Contact / Notes</th></tr>
        </thead>
        <tbody>
          {parties.map((p, i) => (
            <tr key={i}>
              <td><strong>{p.name || '—'}</strong></td>
              <td><Badge label={p.role || 'Unknown'} color="indigo" /></td>
              <td>{p.type || '—'}</td>
              <td>{[p.contact, p.notes].filter(Boolean).join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyDatesTable({ dates }) {
  if (!hasContent(dates)) return <p className="empty-note">No key dates found.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Significance</th></tr></thead>
        <tbody>
          {dates.map((d, i) => (
            <tr key={i}>
              <td className="mono">{d.date || '—'}</td>
              <td>{d.label || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AmountsTable({ amounts }) {
  if (!hasContent(amounts)) return <p className="empty-note">No amounts found.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Amount</th><th>Currency</th><th>Represents</th></tr></thead>
        <tbody>
          {amounts.map((a, i) => (
            <tr key={i}>
              <td className="mono amount">{a.amount || '—'}</td>
              <td>{a.currency || '—'}</td>
              <td>{a.label || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionCards({ sections }) {
  if (!hasContent(sections)) return <p className="empty-note">No sections identified.</p>;
  return (
    <div className="section-cards">
      {sections.map((s, i) => (
        <div key={i} className="section-card">
          <div className="section-card-title">{s.title || `Section ${i + 1}`}</div>
          {s.summary && <p className="section-card-summary">{s.summary}</p>}
          {hasContent(s.keyPoints) && (
            <ul className="key-points">
              {s.keyPoints.map((kp, j) => <li key={j}>{kp}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ObligationsTable({ obligations }) {
  if (!hasContent(obligations)) return <p className="empty-note">No obligations found.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Party</th><th>Must Do</th><th>By When</th></tr></thead>
        <tbody>
          {obligations.map((o, i) => (
            <tr key={i}>
              <td><strong>{o.party || '—'}</strong></td>
              <td>{o.obligation || '—'}</td>
              <td className="mono">{o.deadline || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RightsTable({ rights }) {
  if (!hasContent(rights)) return <p className="empty-note">No rights identified.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Party</th><th>Right</th></tr></thead>
        <tbody>
          {rights.map((r, i) => (
            <tr key={i}>
              <td><strong>{r.party || '—'}</strong></td>
              <td>{r.right || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DefinitionsTable({ definitions }) {
  if (!hasContent(definitions)) return <p className="empty-note">No definitions found.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Term</th><th>Definition</th></tr></thead>
        <tbody>
          {definitions.map((d, i) => (
            <tr key={i}>
              <td><strong>{d.term || '—'}</strong></td>
              <td>{d.definition || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StringList({ items, color = 'gray' }) {
  if (!hasContent(items)) return <p className="empty-note">None identified.</p>;
  return (
    <ul className="string-list">
      {items.map((item, i) => (
        <li key={i}><Badge label="•" color={color} />{typeof item === 'string' ? item : JSON.stringify(item)}</li>
      ))}
    </ul>
  );
}

function CustomFields({ data }) {
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) return null;

  // Filter out the meta instructions string Claude sometimes puts in the key
  const entries = Object.entries(data).filter(
    ([k, v]) => v !== null && v !== undefined && v !== '' && k.length < 80
  );
  if (entries.length === 0) return null;

  return (
    <Section title="Additional Data" icon="📌" fullWidth>
      <div className="custom-fields">
        {entries.map(([key, value], i) => (
          <div key={i} className="field">
            <span className="field-label">{key}</span>
            <span className="field-value">
              {Array.isArray(value)
                ? value.join(' · ')
                : typeof value === 'object'
                ? JSON.stringify(value, null, 2)
                : String(value)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Results Panel ────────────────────────────────────────────────────────────
function ResultsPanel({ result, meta }) {
  const { data } = result;
  const [showRaw, setShowRaw] = useState(false);

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert('JSON copied to clipboard!');
  };

  const categoryColor = {
    Legal: 'purple', Financial: 'green', Medical: 'red', Insurance: 'blue',
    Government: 'indigo', Historical: 'orange', Scientific: 'teal',
    Corporate: 'slate', Technical: 'gray', Academic: 'yellow',
  }[data.documentCategory] || 'gray';

  return (
    <div className="results-panel">

      {/* ── Header ── */}
      <div className="results-header">
        <div className="results-header-left">
          <div className="jessica-tag">✦ Analyzed by Jessica</div>
          <div className="results-doc-type">{data.documentType || 'Document'}</div>
          <div className="results-badges">
            {data.documentCategory && <Badge label={data.documentCategory} color={categoryColor} />}
            {data.confidence && <ConfidencePip level={data.confidence} />}
            {meta?.truncated && <Badge label="Large file — first 60k chars analyzed" color="yellow" />}
          </div>
          {meta?.fileName && <div className="results-filename">📄 {meta.fileName}</div>}
        </div>
        <div className="results-actions">
          <button className="btn btn-ghost-white" onClick={handleCopyJSON}>Copy JSON</button>
          <button className="btn btn-ghost-white" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {/* ── Jessica's Summary ── */}
      {data.summary && (
        <div className="summary-box">
          <img src="/jessica.png" alt="Jessica" className="summary-avatar" />
          <div>
            <div className="summary-label">Jessica's Summary</div>
            <p className="summary-text">{data.summary}</p>
          </div>
        </div>
      )}

      {/* ── Flags ── */}
      {hasContent(data.flags) && (
        <div className="flags-box">
          <div className="flags-title">⚠️ Notable Items</div>
          <ul>
            {data.flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {/* ── Main Grid ── */}
      <div className="results-grid">

        {/* Parties */}
        <Section title="Relevant Parties" icon="👥" fullWidth>
          <PartiesTable parties={data.parties} />
        </Section>

        {/* Dates */}
        {hasContent(data.keyDates) && (
          <Section title="Key Dates" icon="📅">
            <KeyDatesTable dates={data.keyDates} />
          </Section>
        )}

        {/* Amounts */}
        {hasContent(data.keyAmounts) && (
          <Section title="Key Amounts" icon="💰">
            <AmountsTable amounts={data.keyAmounts} />
          </Section>
        )}

      </div>

      {/* ── Sections / Breakdown ── */}
      {hasContent(data.sections) && (
        <Section title="Document Breakdown" icon="📋" fullWidth>
          <SectionCards sections={data.sections} />
        </Section>
      )}

      {/* ── Rights & Obligations ── */}
      {(hasContent(data.obligations) || hasContent(data.rights)) && (
        <div className="results-grid">
          {hasContent(data.obligations) && (
            <Section title="Obligations" icon="📌">
              <ObligationsTable obligations={data.obligations} />
            </Section>
          )}
          {hasContent(data.rights) && (
            <Section title="Rights" icon="⚖️">
              <RightsTable rights={data.rights} />
            </Section>
          )}
        </div>
      )}

      {/* ── Restrictions ── */}
      {hasContent(data.restrictions) && (
        <Section title="Restrictions & Exclusions" icon="🚫" fullWidth>
          <StringList items={data.restrictions} color="red" />
        </Section>
      )}

      {/* ── Definitions ── */}
      {hasContent(data.definitions) && (
        <Section title="Defined Terms" icon="📖" fullWidth>
          <DefinitionsTable definitions={data.definitions} />
        </Section>
      )}

      {/* ── Tags ── */}
      {hasContent(data.tags) && (
        <Section title="Topics & Keywords" icon="🏷️" fullWidth>
          <div className="tags-row">
            {data.tags.map((t, i) => <Badge key={i} label={t} color="gray" />)}
          </div>
        </Section>
      )}

      {/* ── Custom Fields (insurance, medical, etc.) ── */}
      <CustomFields data={data.customFields} />

      {/* ── Raw JSON ── */}
      <div className="raw-toggle">
        <button className="btn btn-ghost btn-sm" onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? '▲ Hide' : '▼ Show'} Raw JSON
        </button>
        {showRaw && <pre className="raw-json">{JSON.stringify(data, null, 2)}</pre>}
      </div>
    </div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({ onFile, compact = false }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && isAccepted(file)) onFile(file);
    else alert('Unsupported file type. Try PDF, CSV, XLSX, or TXT.');
  }, [onFile]);

  return (
    <div
      className={`upload-zone ${dragOver ? 'drag-over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.csv,.xlsx,.xls,.txt,.json,.tsv,.md"
        onChange={(e) => { const f = e.target.files[0]; if (f) onFile(f); e.target.value = ''; }}
        style={{ display: 'none' }}
      />
      {compact ? (
        <span className="upload-compact-text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload another document
        </span>
      ) : (
        <>
          <div className="upload-icon-wrap">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <polyline points="9 15 12 12 15 15"/>
            </svg>
          </div>
          <div className="upload-text">Drop a file here, or click to browse</div>
          <div className="upload-sub">PDF · CSV · XLSX · TXT · JSON · Markdown</div>
        </>
      )}
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
const LOADING_MESSAGES = [
  "Jessica is reviewing your document…",
  "She's blonde, so bear with her…",
  "Wow, this is a lot of words…",
  "Skipping to the fun parts…",
  "There are no fun parts…",
  "Okay fine, reading the whole thing…",
  "Highlighting things that sound important…",
  "Googling words she doesn't recognize…",
  "Your document is very boring, just so you know…",
  "Almost done — or at least pretending to be…",
  "Cross-referencing with her horoscope…",
  "Asking the other Jessicas for a second opinion…",
  "This is taking a while… it must be a legal document…",
  "Found something interesting — nevermind, it's a typo…",
  "Pulling the important stuff to the top so you look smart…",
  "Wrapping up… she needs a coffee after this…",
];

function LoadingSpinner({ fileName }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loading-page">
      <img src="/jessica.png" alt="Jessica" className="jessica-avatar loading-avatar" />
      {fileName && <div className="loading-filename">📄 {fileName}</div>}
      <div className="spinner-ring" />
      <div className="loading-text">{LOADING_MESSAGES[msgIdx]}</div>
      <div className="loading-dots">
        <span /><span /><span />
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [currentFile, setCurrentFile] = useState(null);
  const handleFile = async (file) => {
    const MAX_BYTES = 4.5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please upload a file under 4.5 MB.`);
      setStatus('error');
      return;
    }

    setCurrentFile(file);
    setStatus('loading');
    setResult(null);
    setError('');

    try {
      const fileContent = await fileToBase64(file);
      const jobId = crypto.randomUUID();

      // Kick off background function — returns 202 immediately
      const startRes = await fetch('/.netlify/functions/parse-document-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, fileContent, fileName: file.name, fileType: file.type || '' }),
      });

      if (startRes.status !== 202) {
        // Background function unavailable — fall back to sync
        const syncRes = await fetch('/.netlify/functions/parse-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileContent, fileName: file.name, fileType: file.type || '' }),
        });
        const rawText = await syncRes.text();
        let json;
        try { json = JSON.parse(rawText); } catch {
          throw new Error(`Server error (${syncRes.status}). Check that ANTHROPIC_API_KEY is set in Netlify.`);
        }
        if (!syncRes.ok || !json.success) throw new Error(json.error || `Server error ${syncRes.status}`);
        setResult(json);
        setMeta(json.meta);
        setStatus('done');
        return;
      }

      // Poll Supabase for result
      const poll = async (attempts = 0) => {
        if (attempts > 90) { // 3 min max
          setError('Jessica is taking too long. Please try again.');
          setStatus('error');
          return;
        }
        try {
          const pollRes = await fetch(`/.netlify/functions/get-result?jobId=${jobId}`);
          const data = await pollRes.json();

          if (data.status === 'done') {
            setResult({ success: true, data: data.result });
            setMeta(data.meta);
            setStatus('done');
          } else if (data.status === 'error') {
            setError(data.error || 'Processing failed.');
            setStatus('error');
          } else {
            setTimeout(() => poll(attempts + 1), 2000);
          }
        } catch {
          setTimeout(() => poll(attempts + 1), 3000);
        }
      };

      setTimeout(() => poll(), 3000);

    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setMeta(null);
    setError('');
    setCurrentFile(null);
  };

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo" onClick={status !== 'idle' ? reset : undefined} style={status !== 'idle' ? { cursor: 'pointer' } : {}}>
            <div className="logo-mark">◈</div>
            <div>
              <div className="logo-title">Data Parse</div>
              <div className="logo-sub">Powered by Jessica, your AI document analyst</div>
            </div>
          </div>
          {status !== 'idle' && (
            <button className="btn btn-outline" onClick={reset}>↩ New Document</button>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">

        {/* IDLE */}
        {status === 'idle' && (
          <div className="landing">
            <div className="landing-split">

              {/* ── Jessica photo panel ── */}
              <div className="jessica-panel">
                <img src="/jessica.png" alt="Jessica" className="jessica-hero-img" />
                <div className="jessica-panel-overlay">
                  <div className="jessica-panel-name">Jessica</div>
                  <div className="jessica-panel-title">AI Document Analyst</div>
                </div>
              </div>

              {/* ── Right: intro + upload ── */}
              <div className="landing-right">
                <div className="landing-eyebrow"><span>✦</span> Powered by Claude AI</div>
                <h1 className="landing-title">Any document.<br />Instant clarity.</h1>
                <p className="landing-sub">
                  Drop a file and Jessica reads it cover to cover — contracts, insurance policies,
                  medical records, court filings, financial statements, anything. She'll tell you
                  exactly what it is, who's involved, and what matters.
                </p>

                <UploadZone onFile={handleFile} />

                <div className="supports-row">
                  <span>Accepts:</span>
                  {['PDF', 'CSV', 'XLSX', 'TXT', 'JSON', 'Markdown'].map(t => (
                    <Badge key={t} label={t} color="gray" />
                  ))}
                </div>

                <div className="example-chips">
                  {[
                    'Insurance Policy', 'Legal Contract', 'Bill of Rights',
                    'Medical Record', 'Financial Statement', 'Court Ruling',
                    'Loss Run Report', 'Tax Document',
                  ].map(d => <span key={d} className="example-chip">{d}</span>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LOADING */}
        {status === 'loading' && <LoadingSpinner fileName={currentFile?.name} />}

        {/* ERROR */}
        {status === 'error' && (
          <div className="error-page">
            <div className="jessica-avatar large">J</div>
            <h2>Something went wrong</h2>
            <p className="error-msg">{error}</p>
            <button className="btn btn-primary" onClick={reset}>Try Another File</button>
          </div>
        )}

        {/* DONE */}
        {status === 'done' && result && (
          <div className="results-page">
            <div className="results-upload-bar">
              <UploadZone onFile={handleFile} compact />
            </div>
            <ResultsPanel result={result} meta={meta} />
          </div>
        )}

      </main>

      <footer className="app-footer">
        Data Parse · Powered by Claude AI · Documents are processed securely and never stored
      </footer>
    </div>
  );
}
