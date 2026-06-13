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
const STORAGE_KEY = 'pga-pool-v4';

const DEFAULT_NAMES = ['Taffy', 'Gary', 'Ann', 'Kathy', 'Pablo', 'Greg'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyParticipant(id, name = '') {
  return { id, name, picks: Array(PICKS_PER_PARTICIPANT).fill('') };
}

function defaultParticipants() {
  return DEFAULT_NAMES.map((name, i) => emptyParticipant(i + 1, name));
}

function loadState() {
  if (typeof window === 'undefined') return null;
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

function saveState(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function formatTotal(total) {
  if (total === null || total === undefined) return '--';
  if (total === 0) return 'E';
  return total > 0 ? `+${total}` : `${total}`;
}

function TournamentBadge({ isLive, isFinal, status }) {
  if (isLive) return <span className="badge badge-live">🔴 Live</span>;
  if (isFinal) return <span className="badge badge-final">✅ Final</span>;
  return <span className="badge badge-pre">📅 {status || 'Upcoming'}</span>;
}

// ── Typeahead picker ──────────────────────────────────────────────────────────
// Uses a portal-style fixed dropdown that detects screen edge and flips upward.

function GolferPicker({ value, onChange, fieldNames, pickLabel }) {
  const [query, setQuery]           = useState(value || '');
  const [open, setOpen]             = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [dropUp, setDropUp]         = useState(false);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = query.trim().length === 0
    ? []
    : fieldNames.filter(n => n.toLowerCase().includes(query.toLowerCase())).slice(0, 10);

  function select(name) { setQuery(name); setOpen(false); onChange(name); }
  function clear() { setQuery(''); setOpen(false); onChange(''); inputRef.current?.focus(); }

  function handleKey(e) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlighted]) select(filtered[highlighted]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  // Position the fixed dropdown relative to the input, flip up if near bottom
  function positionDropdown(el) {
    if (!el || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const listH = Math.min(filtered.length * 44, 264);
    const goUp = spaceBelow < listH + 8;
    setDropUp(goUp);
    el.style.left   = rect.left + 'px';
    el.style.width  = rect.width + 'px';
    if (goUp) {
      el.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
      el.style.top    = 'auto';
    } else {
      el.style.top    = (rect.bottom + 2) + 'px';
      el.style.bottom = 'auto';
    }
  }

  useEffect(() => {
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target) &&
          listRef.current && !listRef.current.contains(e.target)) {
        setOpen(false);
      }
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
          style={{
            paddingRight: 28,
            borderColor: isConfirmed ? '#2E6B3E' : undefined,
            background:  isConfirmed ? '#f0fff4'  : undefined,
          }}
          placeholder="Type name to search…"
          value={query}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          onChange={e => {
            setQuery(e.target.value);
            setHighlighted(0);
            setOpen(true);
            if (e.target.value === '') onChange('');
          }}
          onFocus={() => { if (query) setOpen(true); }}
          onKeyDown={handleKey}
        />
        {query && (
          <button onClick={clear} tabIndex={-1} title="Clear" style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#999', fontSize: '1rem', lineHeight: 1, padding: 0,
          }}>✕</button>
        )}
      </div>

      {/* Fixed-position dropdown — renders above all other content */}
      {open && filtered.length > 0 && (
        <ul
          ref={el => { listRef.current = el; positionDropdown(el); }}
          style={{
            position: 'fixed',
            background: '#fff',
            border: '2px solid #2E6B3E',
            borderRadius: 6,
            margin: 0, padding: 0,
            listStyle: 'none',
            boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
            maxHeight: 264,
            overflowY: 'auto',
            zIndex: 99999,
          }}
        >
          {filtered.map((name, i) => (
            <li
              key={name}
              onMouseDown={e => { e.preventDefault(); select(name); }}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                background: i === highlighted ? '#D6ECD2' : '#fff',
                color: '#222',
                fontSize: '0.9rem',
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
        }}>
          No players match "{query}"
        </div>
      )}
    </div>
  );
}

// ── Setup tab ─────────────────────────────────────────────────────────────────

function SetupTab({ participants, onChange, fieldNames }) {
  function updateName(id, name) {
    onChange(participants.map(p => p.id === id ? { ...p, name } : p));
  }
  function updatePick(id, idx, pick) {
    onChange(participants.map(p => {
      if (p.id !== id) return p;
      const picks = [...p.picks]; picks[idx] = pick;
      return { ...p, picks };
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
          <div className="notice notice-info" style={{ marginBottom: 16 }}>
            Each participant picks {PICKS_PER_PARTICIPANT} golfers. Best {BEST_N} active (non-eliminated) scores count.
            MC/WD players are excluded from scoring entirely.
            {!hasField && ' ⏳ Loading field from ESPN…'}
            {hasField && ` Field: ${fieldNames.length} players.`}
          </div>

          <div className="setup-grid">
            {participants.map((p, pIdx) => (
              <div className="participant-card" key={p.id} style={{ overflow: 'visible' }}>
                <div className="participant-card-header">
                  {p.name || `Participant ${pIdx + 1}`}
                  {participants.length > 1 && (
                    <button
                      className="btn btn-sm"
                      style={{ float: 'right', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '1px 7px' }}
                      onClick={() => removeParticipant(p.id)}
                    >✕</button>
                  )}
                </div>
                <div className="participant-card-body">
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input
                      className="form-input"
                      placeholder="Participant name"
                      value={p.name}
                      onChange={e => updateName(p.id, e.target.value)}
                    />
                  </div>
                  {p.picks.map((pick, idx) => (
                    <GolferPicker
                      key={idx}
                      value={pick}
                      onChange={val => updatePick(p.id, idx, val)}
                      fieldNames={fieldNames}
                      pickLabel={`Pick ${idx + 1}${idx < BEST_N ? ' ★' : ''}`}
                    />
                  ))}
                </div>
              </div>
            ))}

            {participants.length < MAX_PARTICIPANTS && (
              <div
                onClick={addParticipant}
                style={{
                  border: '2px dashed #ccc', borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 120, cursor: 'pointer', color: '#aaa',
                  fontSize: '2rem', userSelect: 'none',
                }}
              >+</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────

function LeaderboardTab({ participants, golferData, loading, error, lastUpdated, tournament }) {
  const golferMap = buildGolferMap(golferData);
  const scored  = participants
    .filter(p => p.name && p.picks.some(Boolean))
    .map(p => scoreParticipant(p, golferMap));
  const ranked  = rankParticipants(scored);
  const medals  = ['🥇', '🥈', '🥉'];

  return (
    <div>
      {/* Tournament info */}
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
        <div className="notice notice-info">No participants set up yet. Go to ⚙️ Setup.</div>
      ) : (
        <div className="card">
          <div className="card-header">🏆 Pool Standings — Best {BEST_N} of {PICKS_PER_PARTICIPANT} (active only)</div>
          <div className="lb-table-wrap">
            <table className="lb-table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Rank</th>
                  <th className="left" style={{ minWidth: 100 }}>Participant</th>
                  <th style={{ minWidth: 64 }}>Total</th>
                  {Array.from({ length: PICKS_PER_PARTICIPANT }, (_, i) => (
                    <th key={i} style={{ minWidth: 70, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      P{i + 1}{i < BEST_N ? '★' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map(p => {
                  // Best 4 = lowest scores from non-eliminated picks only
                  const best4Names = [...p.scoredPicks]
                    .filter(sp => !sp.eliminated && sp.score !== null)
                    .sort((a, b) => a.score - b.score)
                    .slice(0, BEST_N)
                    .map(sp => sp.name);

                  return (
                    <tr key={p.id}>
                      <td className={`rank-cell rank-${p.rank}`} style={{ textAlign: 'center' }}>
                        {medals[p.rank - 1] || p.rank}
                      </td>
                      <td className="left name-cell">{p.name}</td>
                      <td className={`total-cell ${p.total !== null && p.total < 0 ? 'score-under' : p.total > 0 ? 'score-over' : 'score-even'}`}>
                        {p.total !== null ? formatTotal(p.total) : '--'}
                        {p.best4Count > 0 && p.best4Count < BEST_N && (
                          <div style={{ fontSize: '0.65rem', color: '#888', fontWeight: 'normal' }}>({p.best4Count} active)</div>
                        )}
                      </td>
                      {p.scoredPicks.map((sp, idx) => {
                        const isBest = best4Names.includes(sp.name) && sp.name;
                        const chipCls = sp.eliminated ? 'mc' : isBest ? 'best' : '';
                        return (
                          <td key={idx} style={{ padding: '6px 3px', textAlign: 'center', verticalAlign: 'middle' }}>
                            {sp.name ? (
                              <span className={`pick-chip ${chipCls}`} title={sp.name}>
                                <span style={{ display: 'block', fontSize: '0.7rem', lineHeight: 1.2 }}>
                                  {sp.name.split(' ').slice(-1)[0]}
                                </span>
                                <span style={{ display: 'block', fontWeight: 'bold', fontSize: '0.72rem', lineHeight: 1.2 }}>
                                  {sp.eliminated ? sp.status : sp.score !== null ? sp.display : '--'}
                                </span>
                              </span>
                            ) : <span style={{ color: '#ddd' }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 20px', fontSize: '0.72rem', color: '#888', borderTop: '1px solid #eee' }}>
            ★ = eligible for best {BEST_N} · 🟨 = counting toward total · MC/WD = eliminated, not counted
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full scoreboard tab ───────────────────────────────────────────────────────

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
                onClick={() => setFilter(f)}
              >
                {f === 'all'    ? `All (${golferData.length})`
                : f === 'active'? `Active (${golferData.filter(g => g.status === 'Active').length})`
                :                 `MC/WD (${golferData.filter(g => g.status !== 'Active').length})`}
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
                    <td className={`total-cell ${g.status === 'MC' || g.status === 'WD' ? 'score-mc' : g.total < 0 ? 'score-under' : g.total > 0 ? 'score-over' : 'score-even'}`}>
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
  const [tab, setTab]             = useState('leaderboard');
  const [participants, setParticipants] = useState(defaultParticipants());
  const [golferData, setGolferData]     = useState([]);
  const [tournament, setTournament]     = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const timerRef = useRef(null);

  const fieldNames = golferData.map(g => g.name).filter(Boolean).sort((a, b) => a.localeCompare(b));

  // Load saved picks — use new key so stale "taken" data doesn't carry over
  useEffect(() => {
    const saved = loadState();
    if (saved?.participants?.length) setParticipants(saved.participants);
    else if (Array.isArray(saved) && saved.length) setParticipants(saved);
  }, []);

  useEffect(() => { saveState({ participants }); }, [participants]);

  const fetchScores = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/scores');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGolferData(data.golfers || []);
      setTournament(data.tournament || null);
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
          <button
            className="btn btn-sm btn-primary"
            style={{ marginLeft: 'auto', alignSelf: 'center' }}
            onClick={fetchScores} disabled={loading}
          >{loading ? '🔄' : '↻'} Refresh</button>
        </nav>

        {tab === 'leaderboard' && (
          <LeaderboardTab participants={participants} golferData={golferData} loading={loading}
            error={error} lastUpdated={lastUpdated} tournament={tournament} />
        )}
        {tab === 'setup' && (
          <SetupTab participants={participants} onChange={setParticipants} fieldNames={fieldNames} />
        )}
        {tab === 'scores' && (
          <ScoresTab golferData={golferData} loading={loading} error={error} tournament={tournament} />
        )}
      </div>
    </>
  );
}
