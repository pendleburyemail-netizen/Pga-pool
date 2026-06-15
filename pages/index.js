import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import {
  formatScore,
  buildGolferMap,
  scoreParticipant,
  rankParticipants,
  PICKS_PER_PARTICIPANT,
  BEST_N,
} from '../lib/pool';

const REFRESH_INTERVAL = 60_000;
const MAX_PARTICIPANTS = 8;
const DEFAULT_NAMES = ['Taffy', 'Gary', 'Ann', 'Kathy', 'Pablo', 'Greg'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyParticipant(id, name = '') {
  return { id, name, picks: Array(PICKS_PER_PARTICIPANT).fill('') };
}
function defaultParticipants() {
  return DEFAULT_NAMES.map((name, i) => emptyParticipant(i + 1, name));
}
function formatTotal(total) {
  if (total === null || total === undefined) return '--';
  if (total === 0) return 'E';
  return total > 0 ? `+${total}` : `${total}`;
}
function scoreColorClass(score) {
  if (score === null || score === undefined) return '';
  if (score < 0) return 'score-under';
  if (score > 0) return 'score-over';
  return 'score-even';
}
function TournamentBadge({ isLive, isFinal, status }) {
  if (isLive)  return <span className="badge badge-live">🔴 Live</span>;
  if (isFinal) return <span className="badge badge-final">✅ Final</span>;
  return <span className="badge badge-pre">📅 {status || 'Upcoming'}</span>;
}

// ── PIN modal ─────────────────────────────────────────────────────────────────

function PinModal({ onSubmit, onCancel, error }) {
  const [pin, setPin] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: 28, width: 300,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: 8, color: '#1B4F2A' }}>
          🔒 Enter PIN to save picks
        </div>
        <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: 16 }}>
          Picks are shared with everyone. Enter the pool PIN to make changes.
        </div>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          maxLength={8}
          className="form-input"
          placeholder="PIN"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(pin); }}
          style={{ marginBottom: 8, fontSize: '1.2rem', letterSpacing: 4, textAlign: 'center' }}
        />
        {error && (
          <div style={{ color: '#c00', fontSize: '0.82rem', marginBottom: 8 }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onSubmit(pin)}>
            Save Picks
          </button>
          <button className="btn" style={{ flex: 1, background: '#eee', color: '#333' }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Typeahead picker ──────────────────────────────────────────────────────────

function GolferPicker({ value, onChange, fieldNames, pickLabel }) {
  const [query, setQuery]             = useState(value || '');
  const [open, setOpen]               = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = query.trim().length === 0
    ? []
    : fieldNames.filter(n => n.toLowerCase().includes(query.toLowerCase())).slice(0, 10);

  function select(name) { setQuery(name); setOpen(false); onChange(name); }
  function clear()  { setQuery(''); setOpen(false); onChange(''); inputRef.current?.focus(); }

  function handleKey(e) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter')    { e.preventDefault(); if (filtered[highlighted]) select(filtered[highlighted]); }
    else if (e.key === 'Escape')   { setOpen(false); }
  }

  function positionDropdown(el) {
    if (!el || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const listH = Math.min(filtered.length * 44, 264);
    const goUp = spaceBelow < listH + 8;
    el.style.left  = rect.left + 'px';
    el.style.width = rect.width + 'px';
    if (goUp) { el.style.bottom = (window.innerHeight - rect.top + 2) + 'px'; el.style.top = 'auto'; }
    else       { el.style.top = (rect.bottom + 2) + 'px'; el.style.bottom = 'auto'; }
  }

  useEffect(() => {
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target) &&
          listRef.current  && !listRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const isConfirmed = fieldNames.includes(query);

  return (
    <div className="form-group" ref={wrapRef} style={{ position: 'relative' }}>
      <label className="form-label">{pickLabel}</label>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          className="form-input"
          style={{ paddingRight: 28, borderColor: isConfirmed ? '#2E6B3E' : undefined, background: isConfirmed ? '#f0fff4' : undefined }}
          placeholder="Type name to search…"
          value={query}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          onChange={e => { setQuery(e.target.value); setHighlighted(0); setOpen(true); if (e.target.value === '') onChange(''); }}
          onFocus={() => { if (query) setOpen(true); }}
          onKeyDown={handleKey}
        />
        {query && (
          <button onClick={clear} tabIndex={-1} title="Clear" style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '1rem', lineHeight: 1, padding: 0,
          }}>✕</button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <ul ref={el => { listRef.current = el; positionDropdown(el); }} style={{
          position: 'fixed', background: '#fff', border: '2px solid #2E6B3E', borderRadius: 6,
          margin: 0, padding: 0, listStyle: 'none',
          boxShadow: '0 8px 28px rgba(0,0,0,0.25)', maxHeight: 264, overflowY: 'auto', zIndex: 99999,
        }}>
          {filtered.map((name, i) => (
            <li key={name}
              onMouseDown={e => { e.preventDefault(); select(name); }}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                background: i === highlighted ? '#D6ECD2' : '#fff',
                color: '#222', fontSize: '0.9rem',
                borderBottom: i < filtered.length - 1 ? '1px solid #eee' : 'none',
                userSelect: 'none',
              }}
            >{name}</li>
          ))}
        </ul>
      )}
      {open && query.trim().length > 1 && filtered.length === 0 && (
        <div style={{
          position: 'absolute', zIndex: 99999, left: 0, right: 0, top: '100%',
          background: '#fff', border: '1px solid #ccc', borderRadius: 4,
          padding: '10px 12px', fontSize: '0.85rem', color: '#999',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>No players match "{query}"</div>
      )}
    </div>
  );
}

// ── Setup tab ─────────────────────────────────────────────────────────────────

function SetupTab({ participants, onChange, fieldNames, onSave, saveStatus }) {
  const [shareMsg, setShareMsg] = useState('');

  function handleShare() {
    try {
      const encoded = btoa(JSON.stringify(participants));
      const url = `${window.location.origin}${window.location.pathname}?picks=${encoded}`;
      navigator.clipboard.writeText(url).then(() => {
        setShareMsg('✅ Link copied! Send it to others to share picks.');
      }).catch(() => {
        // Fallback — show the URL in a prompt
        window.prompt('Copy this link and send to others:', url);
      });
      setTimeout(() => setShareMsg(''), 5000);
    } catch {}
  }
  function updateName(id, name) { onChange(participants.map(p => p.id === id ? { ...p, name } : p)); }
  function updatePick(id, idx, pick) {
    onChange(participants.map(p => {
      if (p.id !== id) return p;
      const picks = [...p.picks]; picks[idx] = pick; return { ...p, picks };
    }));
  }
  function addParticipant() {
    if (participants.length >= MAX_PARTICIPANTS) return;
    onChange([...participants, emptyParticipant(Date.now())]);
  }
  function removeParticipant(id) {
    if (participants.length <= 1) return;
    onChange(participants.filter(p => p.id !== id));
  }

  const hasField = fieldNames.length > 0;

  return (
    <div>
      <div className="card">
        <div className="card-header">⚙️ Pool Setup</div>
        <div className="card-body">
          <div className="notice notice-info" style={{ marginBottom: 12 }}>
            Each participant picks {PICKS_PER_PARTICIPANT} golfers. The best {BEST_N} scores count.
            Players who miss the cut or withdraw are eliminated and not counted.
            {!hasField && ' ⏳ Loading field from ESPN…'}
            {hasField && ` Field: ${fieldNames.length} players.`}
          </div>

          {/* Save + Share buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={onSave} disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? '💾 Saving…' : '💾 Save Picks for Everyone'}
            </button>
            <button className="btn" style={{ background: '#2E6B3E', color: '#F7E87C' }} onClick={handleShare}>
              🔗 Share Picks Link
            </button>
            {saveStatus === 'saved'  && <span style={{ color: '#2E6B3E', fontSize: '0.85rem' }}>✅ Saved — all devices updated</span>}
            {saveStatus === 'error'  && <span style={{ color: '#c00',    fontSize: '0.85rem' }}>❌ Save failed</span>}
            {saveStatus === 'pinbad' && <span style={{ color: '#c00',    fontSize: '0.85rem' }}>❌ Incorrect PIN</span>}
            {shareMsg && <span style={{ color: '#2E6B3E', fontSize: '0.85rem' }}>{shareMsg}</span>}
          </div>

          <div className="setup-grid">
            {participants.map((p, pIdx) => (
              <div className="participant-card" key={p.id} style={{ overflow: 'visible' }}>
                <div className="participant-card-header">
                  {p.name || `Participant ${pIdx + 1}`}
                  {participants.length > 1 && (
                    <button className="btn btn-sm"
                      style={{ float: 'right', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '1px 7px' }}
                      onClick={() => removeParticipant(p.id)}>✕</button>
                  )}
                </div>
                <div className="participant-card-body">
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input className="form-input" placeholder="Participant name" value={p.name}
                      onChange={e => updateName(p.id, e.target.value)} />
                  </div>
                  {p.picks.map((pick, idx) => (
                    <GolferPicker key={idx} value={pick}
                      onChange={val => updatePick(p.id, idx, val)}
                      fieldNames={fieldNames}
                      pickLabel={`Pick ${idx + 1}`} />
                  ))}
                </div>
              </div>
            ))}
            {participants.length < MAX_PARTICIPANTS && (
              <div onClick={addParticipant} style={{
                border: '2px dashed #ccc', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 120, cursor: 'pointer', color: '#aaa', fontSize: '2rem', userSelect: 'none',
              }}>+</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Participant card ──────────────────────────────────────────────────────────

function ParticipantCard({ p, rank }) {
  const medals = ['🥇', '🥈', '🥉'];

  const sortedPicks = [...p.scoredPicks].sort((a, b) => {
    if (!a.name && !b.name) return 0;
    if (!a.name) return 1;
    if (!b.name) return 1;
    if (a.eliminated && b.eliminated) return 0;
    if (a.eliminated) return 1;
    if (b.eliminated) return -1;
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return a.score - b.score;
  });

  const activePicks = sortedPicks.filter(sp => sp.name && !sp.eliminated && sp.score !== null);
  const best4Names  = new Set(activePicks.slice(0, BEST_N).map(sp => sp.name));
  const activeCount = p.activeCount ?? activePicks.length;

  return (
    <div style={{
      background: '#fff',
      border: rank === 1 ? '2px solid #B8860B' : rank === 2 ? '2px solid #aaa' : rank === 3 ? '2px solid #8B4513' : '1px solid #e0e0e0',
      borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{
        background: rank <= 3 ? ['#B8860B','#888','#8B4513'][rank-1] : '#2E6B3E',
        color: '#fff', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: '1.3rem' }}>{medals[rank - 1] || rank}</span>
        <span style={{ fontWeight: 'bold', fontSize: '1rem', flex: 1 }}>{p.name}</span>
        <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: p.total < 0 ? '#7fff7f' : p.total > 0 ? '#ffaaaa' : '#fff' }}>
          {p.total !== null ? formatTotal(p.total) : '--'}
          {activeCount > 0 && activeCount < BEST_N && (
            <span style={{ fontSize: '0.7rem', fontWeight: 'normal', marginLeft: 4, opacity: 0.8 }}>
              ({activeCount} active)
            </span>
          )}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#555', width: 24 }}>#</th>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#555' }}>Golfer</th>
            <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: '#555', width: 64 }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {sortedPicks.filter(sp => sp.name).map((sp, i) => {
            const counting = best4Names.has(sp.name);
            return (
              <tr key={sp.name + i} style={{
                background: sp.eliminated ? '#f5f5f5' : counting ? '#FFFBEA' : '#fff',
                borderTop: '1px solid #eee', opacity: sp.eliminated ? 0.6 : 1,
              }}>
                <td style={{ padding: '5px 8px', color: '#aaa', fontSize: '0.75rem' }}>{i + 1}</td>
                <td style={{ padding: '5px 8px', fontWeight: counting ? 'bold' : 'normal',
                  color: sp.eliminated ? '#999' : '#222',
                  textDecoration: sp.eliminated ? 'line-through' : 'none' }}>
                  {sp.name}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 'bold' }}>
                  {sp.eliminated ? (
                    <span style={{
                      background: sp.status === 'WD' ? '#fee2e2' : '#f3f4f6',
                      color: sp.status === 'WD' ? '#991b1b' : '#6b7280',
                      borderRadius: 4, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 'bold',
                    }}>
                      {sp.status === 'WD' ? 'WD' : 'CUT'}
                    </span>
                  ) : (
                    <span className={scoreColorClass(sp.score)}>
                      {sp.score !== null ? sp.display : '--'}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {sortedPicks.filter(sp => !sp.name).length > 0 && (
            <tr style={{ borderTop: '1px solid #eee' }}>
              <td colSpan={3} style={{ padding: '5px 8px', color: '#ccc', fontStyle: 'italic', fontSize: '0.78rem' }}>
                {sortedPicks.filter(sp => !sp.name).length} pick{sortedPicks.filter(sp => !sp.name).length > 1 ? 's' : ''} not entered
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {activeCount > 0 && activeCount < BEST_N && (
        <div style={{ padding: '5px 10px', fontSize: '0.7rem', color: '#b45309', background: '#fffbeb', borderTop: '1px solid #fde68a' }}>
          ⚠️ Only {activeCount} of {PICKS_PER_PARTICIPANT} picks still in the tournament
        </div>
      )}
      {activeCount === 0 && p.total === null && sortedPicks.some(sp => sp.name) && (
        <div style={{ padding: '5px 10px', fontSize: '0.7rem', color: '#991b1b', background: '#fff0f0', borderTop: '1px solid #fecaca' }}>
          ❌ All picks eliminated — no score
        </div>
      )}
    </div>
  );
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────

function LeaderboardTab({ participants, golferData, loading, error, lastUpdated, tournament, cutHasHappened }) {
  const golferMap = buildGolferMap(golferData);
  const scored = participants
    .filter(p => p.name && p.picks.some(Boolean))
    .map(p => scoreParticipant(p, golferMap));
  const ranked = rankParticipants(scored);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: '1.05rem' }}>⛳ {tournament?.name || 'PGA Tour Event'}</strong>
              <span style={{ marginLeft: 10 }}>
                <TournamentBadge isLive={tournament?.isLive} isFinal={tournament?.isFinal} status={tournament?.status} />
              </span>
            </div>
            {tournament?.venue && (
              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                📍 {tournament.venue}{tournament.location ? `, ${tournament.location}` : ''}
              </div>
            )}
            <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#666', textAlign: 'right' }}>
              {loading && <span>🔄 Refreshing…</span>}
              {error && <span style={{ color: 'red' }}>⚠️ {error}</span>}
              {lastUpdated && !loading && <span>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>}
            </div>
          </div>
        </div>
      </div>

      {golferData.length === 0 && !loading && (
        <div className="notice notice-warn">
          No live scores yet — set up picks in ⚙️ Setup; scores appear automatically once play begins.
        </div>
      )}
      {ranked.length === 0 ? (
        <div className="notice notice-info">No participants set up yet. Go to ⚙️ Setup to add picks.</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: '0.78rem', color: '#666' }}>
              Best {BEST_N} of {PICKS_PER_PARTICIPANT} picks count · 🟨 highlighted = counting · CUT/WD = eliminated
            </div>
            <a href="/api/results" target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', background: '#1B4F2A', color: '#F7E87C',
                borderRadius: 4, fontSize: '0.82rem', fontWeight: 'bold',
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}>
              ⬇ Save Results Page
            </a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {ranked.map(p => <ParticipantCard key={p.id} p={p} rank={p.rank} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ── Scores tab ────────────────────────────────────────────────────────────────

function ScoresTab({ golferData, loading, error, tournament }) {
  const [filter, setFilter] = useState('all');
  const filtered = golferData.filter(g => {
    if (filter === 'active') return g.status === 'Active';
    if (filter === 'cut')    return g.status === 'MC' || g.status === 'WD';
    return true;
  });

  return (
    <div>
      <div className="card">
        <div className="card-header">📊 {tournament?.name || 'Tournament'} — Live Leaderboard</div>
        <div className="card-body" style={{ paddingBottom: 0 }}>
          {error && <div className="notice notice-error">{error}</div>}
          <div className="btn-group" style={{ marginBottom: 12 }}>
            {['all', 'active', 'cut'].map(f => (
              <button key={f}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`}
                style={filter !== f ? { background: '#eee', color: '#333' } : {}}
                onClick={() => setFilter(f)}>
                {f === 'all'     ? `All (${golferData.length})`
                : f === 'active' ? `Active (${golferData.filter(g => g.status === 'Active').length})`
                :                  `MC/WD (${golferData.filter(g => g.status !== 'Active').length})`}
              </button>
            ))}
          </div>
        </div>
        {loading && golferData.length === 0 ? <div className="spinner" /> : (
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th style={{ width: 52 }}>Pos</th>
                  <th className="left">Golfer</th>
                  <th>R1</th><th>R2</th><th>R3</th><th>R4</th>
                  <th>Total</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>
                    {golferData.length === 0 ? 'No live data yet — check back once the tournament begins' : 'No players match this filter'}
                  </td></tr>
                ) : filtered.map((g, i) => (
                  <tr key={g.name}>
                    <td style={{ fontWeight: 'bold', color: '#666', fontSize: '0.85rem' }}>{g.position || (i + 1)}</td>
                    <td className="left" style={{ fontWeight: 500 }}>{g.name}</td>
                    {[g.r1, g.r2, g.r3, g.r4].map((r, ri) => (
                      <td key={ri} className={r === null ? '' : r < 0 ? 'score-under' : r > 0 ? 'score-over' : 'score-even'}>
                        {r === null ? '—' : formatScore(r)}
                      </td>
                    ))}
                    <td className={`total-cell ${g.total < 0 ? 'score-under' : g.total > 0 ? 'score-over' : 'score-even'}`}>
                      {g.displayTotal || '--'}
                    </td>
                    <td>
                      <span className={`badge ${g.status === 'Active' ? 'badge-live' : 'badge-final'}`}>{g.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab]                   = useState('leaderboard');
  const [participants, setParticipants] = useState(defaultParticipants());
  const [golferData, setGolferData]     = useState([]);
  const [tournament, setTournament]     = useState(null);
  const [currentRound, setCurrentRound]       = useState(0);
  const [cutHasHappened, setCutHasHappened]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [picksLoading, setPicksLoading] = useState(true);
  const [error, setError]               = useState(null);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [saveStatus, setSaveStatus]     = useState('idle'); // idle|saving|saved|error|pinbad
  const [showPin, setShowPin]           = useState(false);
  const [pinError, setPinError]         = useState('');
  const timerRef  = useRef(null);
  const pendingParticipants = useRef(null);

  const fieldNames = golferData.map(g => g.name).filter(Boolean).sort((a, b) => a.localeCompare(b));

  // ── Picks: load from URL param → server → localStorage cache ───────────────
  useEffect(() => {
    setPicksLoading(true);

    // 1. Check URL for shared picks (e.g. ?picks=base64...)
    try {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get('picks');
      if (encoded) {
        const decoded = JSON.parse(atob(encoded));
        if (decoded?.length) {
          setParticipants(decoded);
          try { localStorage.setItem('pga-pool-cache', JSON.stringify(decoded)); } catch {}
          setPicksLoading(false);
          // Clean URL without reloading
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
      }
    } catch {}

    // 2. Try server (Blob)
    fetch('/api/picks')
      .then(r => r.json())
      .then(data => {
        if (data.participants?.length) {
          setParticipants(data.participants);
          try { localStorage.setItem('pga-pool-cache', JSON.stringify(data.participants)); } catch {}
        } else {
          // 3. Fall back to localStorage — check all known keys in order
          const keys = ['pga-pool-cache', 'pga-pool-v4', 'pga-pool-v3', 'pga-pool-v2'];
          for (const key of keys) {
            try {
              const raw = localStorage.getItem(key);
              if (raw) {
                const parsed = JSON.parse(raw);
                const p = parsed?.participants || (Array.isArray(parsed) ? parsed : null);
                if (p?.length) { setParticipants(p); break; }
              }
            } catch {}
          }
        }
      })
      .catch(() => {
        // Server error — try all known localStorage keys
        const keys = ['pga-pool-cache', 'pga-pool-v4', 'pga-pool-v3', 'pga-pool-v2'];
        for (const key of keys) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              const p = parsed?.participants || (Array.isArray(parsed) ? parsed : null);
              if (p?.length) { setParticipants(p); break; }
            }
          } catch {}
        }
      })
      .finally(() => setPicksLoading(false));
  }, []);

  // ── Save picks flow ────────────────────────────────────────────────────────
  function handleSaveRequest() {
    pendingParticipants.current = participants;
    setPinError('');
    setShowPin(true);
  }

  async function handlePinSubmit(pin) {
    setShowPin(false);
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: pendingParticipants.current, pin }),
      });
      const data = await res.json();
      if (res.status === 403) {
        setSaveStatus('pinbad');
        setPinError('Incorrect PIN — try again');
        setTimeout(() => setShowPin(true), 400);
      } else if (!res.ok || data.error) {
        setSaveStatus('error');
        console.error('Save error:', data);
        // Show the actual error in the UI temporarily
        setPinError(data.error || `HTTP ${res.status}`);
        setTimeout(() => { setSaveStatus('idle'); setPinError(''); }, 8000);
      } else {
        setSaveStatus('saved');
        // Also cache locally so this device always has the latest
        try { localStorage.setItem('pga-pool-cache', JSON.stringify(pendingParticipants.current)); } catch {}
        setTimeout(() => setSaveStatus('idle'), 4000);
      }
    } catch {
      setSaveStatus('error');
    }
  }

  // ── Fetch live scores ──────────────────────────────────────────────────────
  const fetchScores = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/scores');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGolferData(data.golfers || []);
      setTournament(data.tournament || null);
      setCurrentRound(data.currentRound || 0);
      setCutHasHappened(data.cutHasHappened || false);
      setLastUpdated(data.lastUpdated);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchScores();
    timerRef.current = setInterval(fetchScores, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchScores]);

  const pageTitle = tournament?.shortName ? `${tournament.shortName} Pool` : 'PGA Tour Pool';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Live PGA Tour golf pool leaderboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⛳</text></svg>" />
      </Head>

      {showPin && (
        <PinModal
          onSubmit={handlePinSubmit}
          onCancel={() => { setShowPin(false); setSaveStatus('idle'); }}
          error={pinError}
        />
      )}

      <header className="header">
        <div className="header-inner">
          <div>
            <h1>⛳ {pageTitle}</h1>
            {tournament?.venue && (
              <div style={{ fontSize: '0.72rem', color: '#9dc9a5', marginTop: 2 }}>📍 {tournament.venue}</div>
            )}
          </div>
          <div className="header-meta">
            {tournament?.isLive && <><span className="live-dot" />Live · </>}
            {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Connecting…'}
            <br />Auto-refreshes every 60s
          </div>
        </div>
      </header>

      <div className="app">
        {picksLoading && (
          <div style={{ textAlign: 'center', padding: 32, color: '#666', fontSize: '0.9rem' }}>
            ⏳ Loading picks…
          </div>
        )}

        {!picksLoading && (
          <>
            <nav className="tabs">
              {[
                { id: 'leaderboard', label: '🏆 Leaderboard' },
                { id: 'setup',       label: '⚙️ Setup Picks' },
                { id: 'scores',      label: '📊 Full Scores' },
              ].map(t => (
                <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
              <button className="btn btn-sm btn-primary"
                style={{ marginLeft: 'auto', alignSelf: 'center' }}
                onClick={fetchScores} disabled={loading}>
                {loading ? '🔄' : '↻'} Refresh
              </button>
            </nav>

            {tab === 'leaderboard' && (
              <LeaderboardTab participants={participants} golferData={golferData} loading={loading}
                error={error} lastUpdated={lastUpdated} tournament={tournament} cutHasHappened={cutHasHappened} />
            )}
            {tab === 'setup' && (
              <SetupTab participants={participants} onChange={setParticipants}
                fieldNames={fieldNames} onSave={handleSaveRequest} saveStatus={saveStatus} />
            )}
            {tab === 'scores' && (
              <ScoresTab golferData={golferData} loading={loading} error={error} tournament={tournament} />
            )}
          </>
        )}
      </div>
    </>
  );
}
