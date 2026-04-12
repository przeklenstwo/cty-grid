import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const RANKS = {
  0: { label: 'Newbie',  color: '#71717a', icon: '👶' },
  1: { label: 'Writer',  color: '#38bdf8', icon: '✏️' },
  2: { label: 'Veteran', color: '#a78bfa', icon: '🎯' },
  3: { label: 'Legend',  color: '#f97316', icon: '👑' },
}

const COLOR_PALETTE = [
  '#f97316','#38bdf8','#a78bfa','#34d399','#f472b6',
  '#facc15','#fb7185','#818cf8','#2dd4bf','#c084fc',
  '#e879f9','#4ade80','#f87171','#60a5fa','#fbbf24',
]

export default function AdminPanel({ onClose, onRefresh }) {
  const [tab, setTab]         = useState('comments')
  const [comments, setComments] = useState([])
  const [spots, setSpots]     = useState([])
  const [users, setUsers]     = useState([])
  const [crews, setCrews]     = useState([])
  const [loading, setLoading] = useState(true)

  // Nowy crew form
  const [newCrewName, setNewCrewName]   = useState('')
  const [newCrewColor, setNewCrewColor] = useState('#f97316')
  const [crewError, setCrewError]       = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [c, s, u, cr] = await Promise.all([
      supabase.from('comments').select('*, profiles(username, rank)').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('spots').select('id, title, status, is_public, image_url, description, crew_tags').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('crews').select('*').order('name'),
    ])
    setComments(c.data || [])
    setSpots(s.data || [])
    setUsers(u.data || [])
    setCrews(cr.data || [])
    setLoading(false)
  }

  async function approveComment(id) {
    await supabase.from('comments').update({ status: 'approved' }).eq('id', id)
    fetchAll()
  }

  async function rejectComment(id) {
    await supabase.from('comments').delete().eq('id', id)
    fetchAll()
  }

  async function deleteSpot(id) {
    await supabase.from('spots').delete().eq('id', id)
    onRefresh?.(); fetchAll()
  }

  async function buffSpot(id, buffed) {
    await supabase.from('spots').update({ status: buffed ? 'buffed' : 'approved' }).eq('id', id)
    onRefresh?.(); fetchAll()
  }

  async function setUserRank(userId, rank) {
    await supabase.from('profiles').update({ rank }).eq('id', userId)
    fetchAll()
  }

  async function addCrew() {
    if (!newCrewName.trim()) { setCrewError('Podaj nazwę'); return }
    const { error } = await supabase.from('crews').insert({ name: newCrewName.trim().toUpperCase(), color: newCrewColor })
    if (error) { setCrewError(error.message); return }
    setNewCrewName(''); setCrewError('')
    fetchAll()
  }

  async function updateCrewColor(id, color) {
    await supabase.from('crews').update({ color }).eq('id', id)
    onRefresh?.(); fetchAll()
  }

  async function deleteCrew(id) {
    await supabase.from('crews').delete().eq('id', id)
    onRefresh?.(); fetchAll()
  }

  function TabBtn({ id, label, count }) {
    const active = tab === id
    return (
      <button onClick={() => setTab(id)} style={{
        padding: '7px 14px', borderRadius: '8px', border: 'none',
        background: active ? 'rgba(249,115,22,0.18)' : 'none',
        color: active ? '#f97316' : '#71717a',
        fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
        fontFamily: 'Space Grotesk, sans-serif',
        outline: active ? '1px solid rgba(249,115,22,0.35)' : 'none',
        whiteSpace: 'nowrap',
      }}>
        {label}{count !== undefined ? ` (${count})` : ''}
      </button>
    )
  }

  const card = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '12px', padding: '14px', marginBottom: '10px',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', fontFamily: 'Space Grotesk, sans-serif',
    }}>
      <div style={{
        background: '#0c0c0e', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '18px', width: '100%', maxWidth: '740px',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 40px 80px rgba(0,0,0,0.8)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 26px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            <h2 style={{ color: 'white', fontWeight: 700, fontSize: '1.15rem', margin: 0 }}>⚡ Panel Admina</h2>
            <p style={{ color: '#52525b', fontSize: '0.75rem', marginTop: '2px', marginBottom: 0 }}>
              {comments.length} komentarzy czeka
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#71717a', fontSize: '1rem', cursor: 'pointer',
            borderRadius: '8px', width: '32px', height: '32px',
          }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '4px', padding: '10px 26px',
          borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto',
        }}>
          <TabBtn id="comments" label="💬 Komentarze" count={comments.length} />
          <TabBtn id="spots"    label="📍 Prace"       count={spots.length} />
          <TabBtn id="crews"    label="👥 Crew"         count={crews.length} />
          <TabBtn id="users"    label="🏅 Użytkownicy"  count={users.length} />
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 26px', flex: 1 }}>
          {loading ? (
            <p style={{ color: '#52525b', textAlign: 'center', padding: '40px' }}>Ładowanie...</p>
          ) : tab === 'comments' ? (
            comments.length === 0
              ? <p style={{ color: '#52525b', textAlign: 'center', padding: '40px' }}>✅ Brak komentarzy</p>
              : comments.map(c => (
                <div key={c.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#f97316', fontWeight: 600, fontSize: '0.85rem' }}>
                      {c.profiles?.username || '?'}
                    </span>
                    <span style={{
                      fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                      background: 'rgba(249,115,22,0.1)', color: '#f97316',
                    }}>
                      {c.comment_type || 'normal'}
                    </span>
                  </div>
                  <p style={{ color: '#d4d4d8', fontSize: '0.88rem', marginBottom: '10px' }}>{c.content}</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => approveComment(c.id)} style={{
                      padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                      outline: '1px solid rgba(34,197,94,0.25)',
                      fontWeight: 600, fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif',
                    }}>✓ Zatwierdź</button>
                    <button onClick={() => rejectComment(c.id)} style={{
                      padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                      outline: '1px solid rgba(239,68,68,0.22)',
                      fontWeight: 600, fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif',
                    }}>✕ Odrzuć</button>
                  </div>
                </div>
              ))
          ) : tab === 'spots' ? (
            spots.length === 0
              ? <p style={{ color: '#52525b', textAlign: 'center', padding: '40px' }}>Brak prac</p>
              : spots.map(sp => (
                <div key={sp.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ color: 'white', fontWeight: 700, fontSize: '0.92rem' }}>{sp.title}</span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.7rem', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600,
                        background: sp.status === 'buffed' ? 'rgba(113,113,122,0.15)' : 'rgba(34,197,94,0.1)',
                        color: sp.status === 'buffed' ? '#71717a' : '#22c55e',
                      }}>{sp.status === 'buffed' ? '🪣 buffed' : '✓ approved'}</span>
                    </div>
                  </div>
                  {sp.crew_tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      {sp.crew_tags.map(t => (
                        <span key={t} style={{
                          fontSize: '0.72rem', padding: '2px 8px', borderRadius: '9999px',
                          background: 'rgba(167,139,250,0.1)', color: '#a78bfa',
                          border: '1px solid rgba(167,139,250,0.2)',
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => buffSpot(sp.id, sp.status !== 'buffed')} style={{
                      padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      background: sp.status === 'buffed' ? 'rgba(34,197,94,0.1)' : 'rgba(113,113,122,0.1)',
                      color: sp.status === 'buffed' ? '#22c55e' : '#a1a1aa',
                      outline: `1px solid ${sp.status === 'buffed' ? 'rgba(34,197,94,0.25)' : 'rgba(113,113,122,0.2)'}`,
                      fontWeight: 600, fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif',
                    }}>{sp.status === 'buffed' ? '✓ Odznacz buff' : '🪣 Buff'}</button>
                    <button onClick={() => deleteSpot(sp.id)} style={{
                      padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                      outline: '1px solid rgba(239,68,68,0.22)',
                      fontWeight: 600, fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif',
                    }}>🗑 Usuń</button>
                  </div>
                </div>
              ))
          ) : tab === 'crews' ? (
            <div>
              {/* Dodaj nowy crew */}
              <div style={{
                ...card, marginBottom: '16px',
                background: 'rgba(249,115,22,0.04)',
                border: '1px solid rgba(249,115,22,0.15)',
              }}>
                <p style={{ color: '#f97316', fontWeight: 700, fontSize: '0.85rem', marginBottom: '12px' }}>
                  + Dodaj nowy crew
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    value={newCrewName}
                    onChange={e => setNewCrewName(e.target.value.toUpperCase())}
                    placeholder="Nazwa (np. TKO)"
                    style={{
                      flex: 1, minWidth: '120px', padding: '9px 14px', borderRadius: '9px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)', color: 'white',
                      fontSize: '0.88rem', fontFamily: 'Space Grotesk, sans-serif', outline: 'none',
                    }}
                  />
                  <button
                    onClick={addCrew}
                    style={{
                      padding: '9px 18px', borderRadius: '9px', border: 'none',
                      background: '#f97316', color: 'white', fontWeight: 700,
                      fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif',
                    }}
                  >Dodaj</button>
                </div>

                {/* Paleta kolorów */}
                <div style={{ marginTop: '10px' }}>
                  <p style={{ color: '#52525b', fontSize: '0.72rem', marginBottom: '6px' }}>Wybierz kolor:</p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {COLOR_PALETTE.map(c => (
                      <div
                        key={c}
                        onClick={() => setNewCrewColor(c)}
                        style={{
                          width: '24px', height: '24px', borderRadius: '6px',
                          background: c, cursor: 'pointer',
                          outline: newCrewColor === c ? '2px solid white' : '2px solid transparent',
                          outlineOffset: '2px', transition: 'all 0.1s',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <span style={{ color: '#52525b', fontSize: '0.72rem' }}>Podgląd:</span>
                    <span style={{
                      padding: '3px 12px', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700,
                      background: newCrewColor, color: '#000',
                    }}>{newCrewName || 'CREW'}</span>
                  </div>
                </div>
                {crewError && <p style={{ color: '#f87171', fontSize: '0.78rem', marginTop: '6px' }}>{crewError}</p>}
              </div>

              {/* Lista crew */}
              {crews.length === 0
                ? <p style={{ color: '#52525b', textAlign: 'center', padding: '20px' }}>Brak crew</p>
                : crews.map(crew => (
                  <div key={crew.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Podgląd tagu */}
                    <span style={{
                      padding: '4px 14px', borderRadius: '9999px', fontSize: '0.85rem', fontWeight: 700,
                      background: crew.color, color: '#000', flexShrink: 0,
                    }}>{crew.name}</span>

                    {/* Paleta edycji koloru */}
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', flex: 1 }}>
                      {COLOR_PALETTE.map(c => (
                        <div
                          key={c}
                          onClick={() => updateCrewColor(crew.id, c)}
                          style={{
                            width: '20px', height: '20px', borderRadius: '5px',
                            background: c, cursor: 'pointer',
                            outline: crew.color === c ? '2px solid white' : '2px solid transparent',
                            outlineOffset: '2px', transition: 'all 0.1s',
                          }}
                        />
                      ))}
                    </div>

                    <button onClick={() => deleteCrew(crew.id)} style={{
                      padding: '5px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                      background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                      fontSize: '0.75rem', fontFamily: 'Space Grotesk, sans-serif', flexShrink: 0,
                    }}>🗑</button>
                  </div>
                ))
              }
            </div>
          ) : (
            /* UŻYTKOWNICY */
            users.length === 0
              ? <p style={{ color: '#52525b', textAlign: 'center', padding: '40px' }}>Brak użytkowników</p>
              : users.map(u => {
                const rank = u.rank ?? 0
                const rInfo = RANKS[rank] ?? RANKS[0]
                return (
                  <div key={u.id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <span style={{ color: 'white', fontWeight: 600, fontSize: '0.92rem' }}>{u.username}</span>
                        {u.discord && <span style={{ color: '#71717a', fontSize: '0.75rem', marginLeft: '8px' }}>🎮 {u.discord}</span>}
                      </div>
                      <span style={{
                        padding: '3px 10px', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700,
                        background: `${rInfo.color}18`, color: rInfo.color, border: `1px solid ${rInfo.color}40`,
                      }}>{rInfo.icon} {rInfo.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {Object.entries(RANKS).map(([r, info]) => (
                        <button key={r} onClick={() => setUserRank(u.id, Number(r))} style={{
                          padding: '5px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                          fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif',
                          background: rank === Number(r) ? `${info.color}22` : 'rgba(255,255,255,0.04)',
                          color: rank === Number(r) ? info.color : '#52525b',
                          outline: rank === Number(r) ? `1px solid ${info.color}45` : 'none',
                        }}>{info.icon} {info.label}</button>
                      ))}
                    </div>
                  </div>
                )
              })
          )}
        </div>
      </div>
    </div>
  )
}
