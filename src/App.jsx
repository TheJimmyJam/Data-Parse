import { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = ['.pdf', '.csv', '.xlsx', '.xls', '.txt', '.json', '.tsv', '.md'];
const MAX_BYTES = 4.5 * 1024 * 1024;
const HISTORY_KEY = 'dp_history';
const MAX_HISTORY = 40;
const MAX_FILES = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
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
function hasContent(arr) { return Array.isArray(arr) && arr.length > 0; }
function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ─── LocalStorage history ─────────────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch {}
}

// ─── Badges / UI atoms ───────────────────────────────────────────────────────
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
      <h3 className="section-title">{icon && <span className="section-icon">{icon}</span>}{title}</h3>
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

// ─── Tables ───────────────────────────────────────────────────────────────────
function PartiesTable({ parties }) {
  if (!hasContent(parties)) return <p className="empty-note">No parties identified.</p>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Name</th><th>Role</th><th>Type</th><th>Contact / Notes</th></tr></thead>
      <tbody>{parties.map((p, i) => (
        <tr key={i}>
          <td><strong>{p.name || '—'}</strong></td>
          <td><Badge label={p.role || 'Unknown'} color="indigo" /></td>
          <td>{p.type || '—'}</td>
          <td>{[p.contact, p.notes].filter(Boolean).join(' · ') || '—'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
function KeyDatesTable({ dates }) {
  if (!hasContent(dates)) return <p className="empty-note">No key dates found.</p>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Date</th><th>Significance</th></tr></thead>
      <tbody>{dates.map((d, i) => (
        <tr key={i}><td className="mono">{d.date || '—'}</td><td>{d.label || '—'}</td></tr>
      ))}</tbody>
    </table></div>
  );
}
function AmountsTable({ amounts }) {
  if (!hasContent(amounts)) return <p className="empty-note">No amounts found.</p>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Amount</th><th>Currency</th><th>Represents</th></tr></thead>
      <tbody>{amounts.map((a, i) => (
        <tr key={i}>
          <td className="mono amount">{a.amount || '—'}</td>
          <td>{a.currency || '—'}</td>
          <td>{a.label || '—'}</td>
        </tr>
      ))}</tbody>
    </table></div>
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
          {hasContent(s.keyPoints) && <ul className="key-points">{s.keyPoints.map((kp, j) => <li key={j}>{kp}</li>)}</ul>}
        </div>
      ))}
    </div>
  );
}
function ObligationsTable({ obligations }) {
  if (!hasContent(obligations)) return <p className="empty-note">No obligations found.</p>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Party</th><th>Must Do</th><th>By When</th></tr></thead>
      <tbody>{obligations.map((o, i) => (
        <tr key={i}>
          <td><strong>{o.party || '—'}</strong></td>
          <td>{o.obligation || '—'}</td>
          <td className="mono">{o.deadline || '—'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
function RightsTable({ rights }) {
  if (!hasContent(rights)) return <p className="empty-note">No rights identified.</p>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Party</th><th>Right</th></tr></thead>
      <tbody>{rights.map((r, i) => (
        <tr key={i}><td><strong>{r.party || '—'}</strong></td><td>{r.right || '—'}</td></tr>
      ))}</tbody>
    </table></div>
  );
}
function DefinitionsTable({ definitions }) {
  if (!hasContent(definitions)) return <p className="empty-note">No definitions found.</p>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Term</th><th>Definition</th></tr></thead>
      <tbody>{definitions.map((d, i) => (
        <tr key={i}><td><strong>{d.term || '—'}</strong></td><td>{d.definition || '—'}</td></tr>
      ))}</tbody>
    </table></div>
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
  if (!data || typeof data !== 'object') return null;
  const entries = Object.entries(data).filter(([k, v]) => v !== null && v !== undefined && v !== '' && k.length < 80);
  if (entries.length === 0) return null;
  return (
    <Section title="Additional Data" icon="📌" fullWidth>
      <div className="custom-fields">
        {entries.map(([key, value], i) => (
          <div key={i} className="field">
            <span className="field-label">{key}</span>
            <span className="field-value">
              {Array.isArray(value) ? value.join(' · ') : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────
function HistoryPanel({ history, onSelect, onClear, selectedId, onClose }) {
  if (!hasContent(history)) return null;
  return (
    <div className="history-panel">
      <div className="history-header">
        <span className="history-title">📁 History</span>
        <div className="history-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={onClear}>Clear</button>
          <button className="history-close" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="history-list">
        {history.map((item) => {
          const isSelected = item.id === selectedId;
          const docCount = item.jobs?.length || 0;
          const label = item.batchAnalysis?.related && item.batchAnalysis?.groupName
            ? item.batchAnalysis.groupName
            : docCount > 1
            ? `${docCount} documents`
            : item.jobs?.[0]?.documentType || item.jobs?.[0]?.fileName || 'Document';
          return (
            <div
              key={item.id}
              className={`history-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(item)}
            >
              <div className="history-item-label">{label}</div>
              {docCount > 1 && (
                <div className="history-item-files">
                  {item.jobs.map((j, i) => <span key={i} className="history-file-chip">{j.fileName}</span>)}
                </div>
              )}
              <div className="history-item-meta">
                {item.jobs?.[0]?.documentCategory && <Badge label={item.jobs[0].documentCategory} color="gray" />}
                <span className="history-time">{timeAgo(item.timestamp)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Batch Summary Panel ──────────────────────────────────────────────────────
function BatchSummaryPanel({ analysis }) {
  if (!analysis || !analysis.related) return null;
  return (
    <div className="batch-summary">
      <div className="batch-summary-header">
        <img src="/jessica.png" alt="Jessica" className="summary-avatar" />
        <div>
          <div className="batch-summary-label">✦ Jessica's Combined Analysis</div>
          <div className="batch-summary-group">{analysis.groupName}</div>
        </div>
      </div>
      {analysis.combinedSummary && <p className="batch-summary-text">{analysis.combinedSummary}</p>}
      {hasContent(analysis.keyInsights) && (
        <div className="batch-insights">
          <div className="batch-insights-label">Cross-document insights</div>
          <ul>{analysis.keyInsights.map((ins, i) => <li key={i}>{ins}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

// ─── Unrelated docs notice ────────────────────────────────────────────────────
function UnrelatedNotice({ analysis }) {
  if (!analysis || analysis.related) return null;
  return (
    <div className="unrelated-notice">
      <span>📂</span>
      <span>These documents appear unrelated — {analysis.reason} Results are shown separately below.</span>
    </div>
  );
}

// ─── Results Tabs ─────────────────────────────────────────────────────────────
function ResultsTabs({ jobs, activeIdx, onSelect }) {
  if (jobs.length <= 1) return null;
  return (
    <div className="results-tabs">
      {jobs.map((job, i) => (
        <button
          key={job.id}
          className={`results-tab ${i === activeIdx ? 'active' : ''}`}
          onClick={() => onSelect(i)}
        >
          <span className="results-tab-name">{job.fileName}</span>
          {job.documentType && <span className="results-tab-type">{job.documentType}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Results Panel ────────────────────────────────────────────────────────────
function ResultsPanel({ result, meta }) {
  const { data } = result;
  const [showRaw, setShowRaw] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert('JSON copied to clipboard!');
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const panel = document.querySelector('.results-panel');
      const canvas = await window.html2canvas(panel, { scale: 2, useCORS: true, logging: false });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
      let remaining = imgH - pageH;
      while (remaining > 0) {
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -(imgH - remaining), imgW, imgH);
        remaining -= pageH;
      }
      const fileName = (data.documentType || 'document').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      pdf.save(`${fileName}-jessica-analysis.pdf`);
    } catch (err) { alert('PDF export failed: ' + err.message); }
    finally { setExporting(false); }
  };

  const categoryColor = {
    Legal: 'purple', Financial: 'green', Medical: 'red', Insurance: 'blue',
    Government: 'indigo', Historical: 'orange', Scientific: 'teal',
    Corporate: 'slate', Technical: 'gray', Academic: 'yellow',
  }[data.documentCategory] || 'gray';

  return (
    <div className="results-panel">
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
          <button className="btn btn-ghost-white" onClick={handleExportPDF} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {data.summary && (
        <div className="summary-box">
          <img src="/jessica.png" alt="Jessica" className="summary-avatar" />
          <div>
            <div className="summary-label">Jessica's Summary</div>
            <p className="summary-text">{data.summary}</p>
          </div>
        </div>
      )}

      {hasContent(data.flags) && (
        <div className="flags-box">
          <div className="flags-title">⚠️ Notable Items</div>
          <ul>{data.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}

      <div className="results-grid">
        <Section title="Relevant Parties" icon="👥" fullWidth>
          <PartiesTable parties={data.parties} />
        </Section>
        {hasContent(data.keyDates) && <Section title="Key Dates" icon="📅"><KeyDatesTable dates={data.keyDates} /></Section>}
        {hasContent(data.keyAmounts) && <Section title="Key Amounts" icon="💰"><AmountsTable amounts={data.keyAmounts} /></Section>}
      </div>

      {hasContent(data.sections) && (
        <Section title="Document Breakdown" icon="📋" fullWidth>
          <SectionCards sections={data.sections} />
        </Section>
      )}

      {(hasContent(data.obligations) || hasContent(data.rights)) && (
        <div className="results-grid">
          {hasContent(data.obligations) && <Section title="Obligations" icon="📌"><ObligationsTable obligations={data.obligations} /></Section>}
          {hasContent(data.rights) && <Section title="Rights" icon="⚖️"><RightsTable rights={data.rights} /></Section>}
        </div>
      )}

      {hasContent(data.restrictions) && (
        <Section title="Restrictions & Exclusions" icon="🚫" fullWidth>
          <StringList items={data.restrictions} color="red" />
        </Section>
      )}
      {hasContent(data.definitions) && (
        <Section title="Defined Terms" icon="📖" fullWidth>
          <DefinitionsTable definitions={data.definitions} />
        </Section>
      )}
      {hasContent(data.tags) && (
        <Section title="Topics & Keywords" icon="🏷️" fullWidth>
          <div className="tags-row">{data.tags.map((t, i) => <Badge key={i} label={t} color="gray" />)}</div>
        </Section>
      )}
      <CustomFields data={data.customFields} />

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
function UploadZone({ onFiles, compact = false }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(isAccepted);
    if (files.length) onFiles(files);
    else alert('Unsupported file type. Try PDF, CSV, XLSX, or TXT.');
  }, [onFiles]);

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
        multiple
        accept=".pdf,.csv,.xlsx,.xls,.txt,.json,.tsv,.md"
        onChange={(e) => { const f = Array.from(e.target.files).filter(isAccepted); if (f.length) onFiles(f); e.target.value = ''; }}
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
              <line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
            </svg>
          </div>
          <div className="upload-text">Drop one or more files, or click to browse</div>
          <div className="upload-sub">PDF · CSV · XLSX · TXT · JSON · Markdown &nbsp;·&nbsp; Up to {MAX_FILES} files at once</div>
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

function MultiLoadingView({ jobs }) {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 2400);
    return () => clearInterval(t);
  }, []);

  const done = jobs.filter(j => j.status === 'done').length;
  const total = jobs.length;

  return (
    <div className="loading-page">
      <img src="/jessica.png" alt="Jessica" className="jessica-avatar loading-avatar" />
      <div className="loading-progress-label">{done < total ? `${done} of ${total} complete` : 'Comparing documents…'}</div>
      <div className="multi-job-list">
        {jobs.map(job => (
          <div key={job.id} className={`multi-job-item status-${job.status}`}>
            <span className="multi-job-icon">
              {job.status === 'done' ? '✓' : job.status === 'error' ? '✗' : '⏳'}
            </span>
            <span className="multi-job-name">{job.fileName}</span>
            <span className="multi-job-status">{job.status === 'done' ? job.documentType || 'Done' : job.status === 'error' ? 'Failed' : 'Processing…'}</span>
          </div>
        ))}
      </div>
      <div className="spinner-ring" />
      <div className="loading-text">{LOADING_MESSAGES[msgIdx]}</div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [jobs, setJobs] = useState([]);
  const [batchAnalysis, setBatchAnalysis] = useState(null);
  const [activeJobIdx, setActiveJobIdx] = useState(0);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(loadHistory);
  const [viewingItem, setViewingItem] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const pushHistory = (entry) => {
    const updated = [entry, ...history].slice(0, MAX_HISTORY);
    setHistory(updated);
    saveHistory(updated);
  };

  const clearHistory = () => { setHistory([]); saveHistory([]); setViewingItem(null); };

  const handleFiles = async (fileList) => {
    const files = fileList.slice(0, MAX_FILES);
    const oversized = files.filter(f => f.size > MAX_BYTES);
    if (oversized.length) {
      setError(`${oversized.map(f => f.name).join(', ')} exceed the 4.5 MB limit.`);
      setStatus('error');
      return;
    }

    // Build initial jobs array
    const initialJobs = files.map(f => ({
      id: crypto.randomUUID(),
      jobId: crypto.randomUUID(),
      fileName: f.name,
      fileType: f.type || '',
      status: 'uploading',
      result: null,
      meta: null,
      documentType: null,
      error: null,
    }));

    setJobs(initialJobs);
    setBatchAnalysis(null);
    setActiveJobIdx(0);
    setViewingItem(null);
    setStatus('loading');
    setError('');

    // Start all jobs in parallel
    const startJob = async (job, file) => {
      try {
        const fileContent = await fileToBase64(file);

        // Files under 2MB base64 → background function (async, no timeout issues)
        // Files over 2MB → sync function with extended timeout
        const useBackground = fileContent.length < 2 * 1024 * 1024;

        if (useBackground) {
          const startRes = await fetch('/.netlify/functions/parse-document-background', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: job.jobId, fileContent, fileName: file.name, fileType: file.type || '' }),
          });

          if (startRes.status === 202) {
            return await pollJob(job.jobId);
          }
        }

        // Sync fallback (larger files or if background unavailable)
        const syncRes = await fetch('/.netlify/functions/parse-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileContent, fileName: file.name, fileType: file.type || '' }),
        });
        const text = await syncRes.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`Server error (${syncRes.status}) — the document may have taken too long to process. Try a smaller file.`);
        }
        if (!syncRes.ok || !json.success) throw new Error(json.error || `Server error ${syncRes.status}`);
        return { result: json, meta: json.meta };

      } catch (err) {
        return { error: err.message };
      }
    };

    const pollJob = async (jobId, attempts = 0) => {
      if (attempts > 90) return { error: 'Timed out waiting for result.' };
      await new Promise(r => setTimeout(r, 2500));
      try {
        const res = await fetch(`/.netlify/functions/get-result?jobId=${jobId}`);
        const data = await res.json();
        if (data.status === 'done') return { result: { success: true, data: data.result }, meta: data.meta };
        if (data.status === 'error') return { error: data.error || 'Processing failed' };
        return pollJob(jobId, attempts + 1);
      } catch { return pollJob(jobId, attempts + 1); }
    };

    // Process all files, updating state as each finishes
    const jobResults = await Promise.all(
      files.map(async (file, idx) => {
        const job = initialJobs[idx];
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j));
        const outcome = await startJob(job, file);

        if (outcome.error) {
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: outcome.error } : j));
          return { ...job, status: 'error', error: outcome.error };
        } else {
          const docType = outcome.result?.data?.documentType || null;
          const docCat = outcome.result?.data?.documentCategory || null;
          setJobs(prev => prev.map(j => j.id === job.id
            ? { ...j, status: 'done', result: outcome.result, meta: outcome.meta, documentType: docType, documentCategory: docCat }
            : j
          ));
          return { ...job, status: 'done', result: outcome.result, meta: outcome.meta, documentType: docType, documentCategory: docCat };
        }
      })
    );

    const successfulJobs = jobResults.filter(j => j.status === 'done');

    // Run batch analysis if 2+ successful docs
    let batchResult = null;
    if (successfulJobs.length >= 2) {
      try {
        const batchRes = await fetch('/.netlify/functions/analyze-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documents: successfulJobs.map(j => ({
              fileName: j.fileName,
              documentType: j.result?.data?.documentType || 'Unknown',
              documentCategory: j.result?.data?.documentCategory || 'Other',
              summary: j.result?.data?.summary || '',
            }))
          }),
        });
        const batchData = await batchRes.json();
        if (batchData.success) batchResult = batchData;
      } catch {}
    }

    setBatchAnalysis(batchResult);

    // Save to history
    if (successfulJobs.length > 0) {
      pushHistory({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        jobs: successfulJobs.map(j => ({
          id: j.id,
          fileName: j.fileName,
          fileType: j.fileType,
          documentType: j.documentType,
          documentCategory: j.result?.data?.documentCategory || null,
          result: j.result,
          meta: j.meta,
        })),
        batchAnalysis: batchResult,
      });
    }

    setStatus('done');
  };

  const reset = () => {
    setStatus('idle'); setJobs([]); setBatchAnalysis(null);
    setActiveJobIdx(0); setError(''); setViewingItem(null);
  };

  // What to display — current session OR selected history item
  const displayJobs = viewingItem ? viewingItem.jobs : jobs;
  const displayBatch = viewingItem ? viewingItem.batchAnalysis : batchAnalysis;
  const activeJob = displayJobs[activeJobIdx];

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo" onClick={reset} style={{ cursor: 'pointer' }}>
            <div className="logo-jessica">JESSICA</div>
            <div className="logo-divider" />
            <div className="logo-tagline">Any document.<br />Instant clarity.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {history.length > 0 && (
              <button className="btn btn-outline" onClick={() => setHistoryOpen(o => !o)}>
                📁 History ({history.length})
              </button>
            )}
            {status !== 'idle' && (
              <button className="btn btn-outline" onClick={reset}>↩ New Document</button>
            )}
          </div>
        </div>
      </header>

      {/* ── Body: history sidebar + main ── */}
      <div className="app-body">

        {historyOpen && (
          <HistoryPanel
            history={history}
            selectedId={viewingItem?.id}
            onSelect={(item) => {
              setViewingItem(item);
              setActiveJobIdx(0);
              setStatus('done');
              setHistoryOpen(false);
            }}
            onClear={clearHistory}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        <main className="app-main">

          {/* IDLE */}
          {status === 'idle' && (
            <div className="landing">
              <div className="landing-split">
                <div className="jessica-panel">
                  <img src="/jessica.png" alt="Jessica" className="jessica-hero-img" />
                  <div className="jessica-panel-overlay">
                    <div className="jessica-panel-name">Jessica</div>
                    <div className="jessica-panel-title">AI Document Analyst</div>
                  </div>
                </div>
                <div className="landing-right">
                  <div className="landing-eyebrow"><span>✦</span> Powered by Claude AI</div>
                  <h1 className="landing-title">Any document.<br />Instant clarity.</h1>
                  <p className="landing-sub">
                    Drop one or more files and Jessica reads them all — contracts, insurance policies,
                    medical records, court filings, financial statements, anything. She'll tell you
                    what each is, who's involved, and whether they're related.
                  </p>
                  <UploadZone onFiles={handleFiles} />
                  <div className="supports-row">
                    <span>Accepts:</span>
                    {['PDF', 'CSV', 'XLSX', 'TXT', 'JSON', 'Markdown'].map(t => <Badge key={t} label={t} color="gray" />)}
                  </div>
                  <div className="example-chips">
                    {['Insurance Policy', 'Legal Contract', 'Bill of Rights', 'Medical Record',
                      'Financial Statement', 'Court Ruling', 'Loss Run Report', 'Tax Document']
                      .map(d => <span key={d} className="example-chip">{d}</span>)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LOADING */}
          {status === 'loading' && <MultiLoadingView jobs={jobs} />}

          {/* ERROR */}
          {status === 'error' && (
            <div className="error-page">
              <img src="/jessica.png" alt="Jessica" className="jessica-avatar large" />
              <h2>Something went wrong</h2>
              <p className="error-msg">{error}</p>
              <button className="btn btn-primary" onClick={reset}>Try Another File</button>
            </div>
          )}

          {/* DONE */}
          {status === 'done' && displayJobs.length > 0 && (
            <div className="results-page">
              <div className="results-upload-bar">
                <UploadZone onFiles={handleFiles} compact />
              </div>

              <BatchSummaryPanel analysis={displayBatch} />
              <UnrelatedNotice analysis={displayBatch} />

              <ResultsTabs
                jobs={displayJobs.filter(j => j.status === 'done')}
                activeIdx={activeJobIdx}
                onSelect={setActiveJobIdx}
              />

              {activeJob?.result
                ? <ResultsPanel result={activeJob.result} meta={activeJob.meta} />
                : activeJob?.error
                ? <div className="error-page"><p className="error-msg">Failed: {activeJob.error}</p></div>
                : null}
            </div>
          )}

        </main>
      </div>

      <footer className="app-footer">
        Data Parse · Powered by Claude AI · Documents are processed securely and never stored on our servers
      </footer>
    </div>
  );
}
