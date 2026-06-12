import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import {
  formatScore,
  normalizeName,
  buildGolferMap,
  scoreParticipant,
  rankParticipants,
  PICKS_PER_PARTICIPANT,
  BEST_N,
} from '../lib/pool';

const REFRESH_INTERVAL = 60_000;
const MAX_PARTICIPANTS = 8;
const STORAGE_KEY = 'pga-pool-v3';

const DEFAULT_NAMES = ['Taffy', 'Gary', 'Ann', 'Kathy', 'Pablo', 'Greg'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyParticipant(id, name = '') {
  return { id, name, picks: Array(PICKS_PER_PARTICIPANT).fill('') };
}

function defaultParticipants() {
  return DEFAULT_NAMES.map((name, i) => emptyParticipant(i + 1, name));
}

function loadState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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

// ── Typeahead golfer picker ───────────────────────────────────────────────────

function GolferPicker({ value, onChange, fieldNames, allPicks, pickLabel }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Keep query in sync if parent clears the value
  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = query.trim().length === 0
    ? []
    : fieldNames.filter(n =>
        n.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10);

  function select(name) {
    setQuery(name);
    setOpen(false);
    onChange(name);
  }

  function clear() {
    setQuery('');
    setOpen(false);
    onChange('');
    inputRef.current?.focus();
  }

  function handleKey(e) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isConfirmed = fieldNames.includes(query);
  const isTaken = isConfirmed && allPicks.has(query) && query !== value;

  return (
    <div className="form-group" ref={wrapRef} style={{ position: 'relative' }}>
      <label className="form-label">{pickLabel}</label>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          className="form-input"
          style={{
            paddingRight: 28,
            borderColor: isConfirmed ? (isTaken ? '#e55' : '#2E6B3E') : undefined,
            background: isConfirmed ? (isTaken ? '#fff0f0' : '#f0fff4') : undefined,
          }}
          placeholder="Type name to search…"
          value={query}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
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
          <button
            onClick={clear}
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#999', fontSize: '1rem', lineHeight: 1, padding: 0,
            }}
            tabIndex={-1}
            title="Clear"
          >✕</button>
        )}
      </div>
      {isTaken && (
        <div style={{ fontSize: '0.7rem', color: '#c00', marginTop: 2 }}>
          Already picked by another participant
        </div>
      )}
      {open && filtered.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 200, left: 0, right: 0,
          background: '#fff', border: '1px solid #ccc', borderRadius: 4,
          margin: 0, padding: 0, listStyle: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map((name, i) => {
            const taken = allPicks.has(name) && name !== value;
            return (
              <li
                key={name}
                onMouseDown={() => select(name)}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  padding: '8px 12px',
                  cursor: taken ? 'default' : 'pointer',
                  background: i === highlighted ? '#D6ECD2' : '#fff',
                  color: taken ? '#aaa' : '#333',
                  fontSize: '0.875rem',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                {name}
                {taken && <span style={{ fontSize: '0.7rem' }}>taken</span>}
              </li>
            );
          })}
        </ul>
      )}
      {open && query.trim().length > 0 && filtered.length === 0 && (
        <div style={{
          position: 'absolute', zIndex: 200, left: 0, right: 0,
          background: '#fff', border: '1px solid #ccc', borderRadius: 4,
          padding: '8px 12px', fontSize: '0.85rem', color: '#999',
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
  const allPicks = new Set(participants.flatMap(p => p.picks).filter(Boolean));

  function updateName(id, name) {
    onChange(participants.map(p => p.id === id ? { ...p, name } : p));
  }

  function updatePick(id, idx, pick) {
    onChange(participants.map(p => {
      if (p.id !== id) return p;
      const picks = [...p.picks];
      picks[idx] = pick;
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
            Each participant picks {PICKS_PER_PARTICIPANT} golfers. Lowest combined score of the {BEST_N} best picks wins. MC/WD = +20 penalty.
            {!hasField && ' ⏳ Loading this week\'s field from ESPN…'}
            {hasField && ` Field: ${fieldNames.length} players. Type a name to search.`}
          </div>

          <div className="setup-grid">
            {participants.map((p, pIdx) => (
              <div className="participant-card" key={p.id}>
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
                      allPicks={allPicks}
                      pickLabel={`Pick ${idx + 1}${idx < BEST_N ? ' ★' : ''}`}
                    />
                  ))}
                </div>
              </div>
            ))}

            {participants.length < MAX_PARTICIPANTS && (
              <div
                style={{
                  border: '2px dashed #ccc', borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 120, cursor: 'pointer', color: '#aaa',
                  fontSize: '2rem', userSelect: 'none',
                }}
                onClick={addParticipant}
                title="Add participant"
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
  const scored = participants
    .filter(p => p.name && p.picks.some(Boolean))
    .map(p => scoreParticipant(p, golferMap));
  const ranked = rankParticipants(scored);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: '1.05rem' }}>
                ⛳ {tournament?.name || 'PGA Tour Event'}
              </strong>
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
          No live scores yet — tournament may not have started. Set up picks in ⚙️ Setup.
        </div>
      )}

      {ranked.length === 0 ? (
        <div className="notice notice-info">
          No participants set up yet. Go to ⚙️ Setup to add picks.
        </div>
      ) : (
        <div className="card">
          <div className="card-header">🏆 Pool Standings — Best {BEST_N} of {PICKS_PER_PARTICIPANT} picks</div>
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>Rank</th>
                  <th className="left">Participant</th>
                  <th>Total</th>
                  {Array.from({ length: PICKS_PER_PARTICIPANT }, (_, i) => (
                    <th key={i} style={{ fontSize: '0.78rem' }}>P{i + 1}{i < BEST_N ? '★' : ''}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map(p => {
                  const best4Names = [...p.scoredPicks]
                    .filter(sp => sp.score !== null)
                    .sort((a, b) => a.score - b.score)
                    .slice(0, BEST_N)
                    .map(sp => sp.name);

                  return (
                    <tr key={p.id}>
                      <td className={`rank-cell rank-${p.rank}`}>
                        {medals[p.rank - 1] || p.rank}
                      </td>
                      <td className="left name-cell">{p.name}</td>
                      <td className={`total-cell ${p.total < 0 ? 'score-under' : p.total > 0 ? 'score-over' : 'score-even'}`}>
                        {p.total !== null ? formatTotal(p.total) : '--'}
                        {p.best4Count > 0 && p.best4Count < BEST_N && (
                          <div style={{ fontSize: '0.68rem', color: '#888', fontWeight: 'normal' }}>({p.best4Count} scored)</div>
                        )}
                      </td>
                      {p.scoredPicks.map((sp, idx) => {
                        const isBest = best4Names.includes(sp.name);
                        const cls = sp.status === 'MC' ? 'mc' : sp.status === 'WD' ? 'wd' : isBest ? 'best' : '';
                        return (
                          <td key={idx} style={{ padding: '6px 4px' }}>
                            {sp.name ? (
                              <span className={`pick-chip ${cls}`} title={sp.name}>
                                {sp.name.split(' ').slice(-1)[0]}
                                <span style={{ marginLeft: 3, fontWeight: 'bold' }}>
                                  {sp.status === 'MC' ? 'MC' : sp.status === 'WD' ? 'WD' : sp.display}
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
          <div style={{ padding: '10px 20px', fontSize: '0.75rem', color: '#888', borderTop: '1px solid #eee' }}>
            P1–P{BEST_N}★ = counts toward total · 🟨 highlighted = in best {BEST_N} · MC/WD = +20 strokes
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full scoreboard tab ────────────────────────────────────────────────────────

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
              <button
                key={f}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`}
                style={filter !== f ? { background: '#eee', color: '#333' } : {}}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? `All (${golferData.length})` : f === 'active' ? `Active (${golferData.filter(g => g.status === 'Active').length})` : `MC/WD (${golferData.filter(g => g.status !== 'Active').length})`}
              </button>
            ))}
          </div>
        </div>
        {loading && golferData.length === 0 ? (
          <div className="spinner" />
        ) : (
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th style={{ width: 52 }}>Pos</th>
                  <th className="left">Golfer</th>
                  <th>R1</th><th>R2</th><th>R3</th><th>R4</th>
                  <th>Total</th>
                  <th>Status</th>
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
  const [tab, setTab] = useState('leaderboard');
  const [participants, setParticipants] = useState(defaultParticipants());
  const [golferData, setGolferData] = useState([]);
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  const fieldNames = golferData
    .map(g => g.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    const saved = loadState();
    if (saved?.participants?.length) setParticipants(saved.participants);
    else if (Array.isArray(saved) && saved.length) setParticipants(saved);
  }, []);

  useEffect(() => {
    saveState({ participants });
  }, [participants]);

  const fetchScores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scores');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGolferData(data.golfers || []);
      setTournament(data.tournament || null);
      setLastUpdated(data.lastUpdated);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
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
            onClick={fetchScores}
            disabled={loading}
          >{loading ? '🔄' : '↻'} Refresh</button>
        </nav>

        {tab === 'leaderboard' && (
          <LeaderboardTab participants={participants} golferData={golferData} loading={loading} error={error} lastUpdated={lastUpdated} tournament={tournament} />
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
