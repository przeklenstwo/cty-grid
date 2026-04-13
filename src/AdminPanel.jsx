import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const SUPERADMIN_ID = '59c2b986-ad0d-4d95-ada4-a739016563f2'

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
  const [tab, setTab]           = useState('comments')
  const [comments, setComments] = useState([])
  const [spots, setSpots]       = useState([])
  const [users, setUsers]       = useState([])
  const [crews, setCrews]       = useState([])
  const [admins, setAdmins]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [adminLevel, setAdminLevel] = useState(1)

  const [newCrewName, setNewCrewName]   = useState('')
  const [newCrewColor, setNewCrewColor] = useState('#f97316')
  const [crewError, setCrewError]       = useState('')

  const isSuperAdmin = currentUserId === SUPERADMIN_ID

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null
      setCurrentUserId(uid)
      fetchAll(uid)
    })
  }, [])

  async function fetchAll(uid) {
    setLoading(true)
    const [c, s, u, cr, adm] = await Promise.all([
      supabase.from('comments').select('*, profiles(username, rank)').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('spots').select('id, title, status, is_public, image_url, description, crew_tags').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('crews').select('*').order('name'),
      supabase.from('admins').select('user_id, level'),
    ])
    setComments(c.data || [])
    setSpots(s.data || [])
    setUsers(u.data || [])
    setCrews(cr.data || [])
    setAdmins(adm.data || [])
    if (uid) {
      const myAdmin = (adm.data || []).find(a => a.user_id === uid)
      setAdminLevel(uid === SUPERADMIN_ID ? 2 : (myAdmin?.level ?? 1))
    }
    setLoading(false)
  }

  function getAdminLevel(userId) {
    if (userId === SUPERADMIN_ID) return 2
    return admins.find(a => a.user_id === userId)?.level ?? 0
  }

  function isAdminUser(userId) {
    return admins.some(a => a.user_id === userId) || userId === SUPERADMIN_ID
  }

  async function approveComment(id) {
    await supabase.from('comments').update({ status: 'approved' }).eq('id', id)
    fetchAll(currentUserId)
  }

  async function rejectComment(id) {
    await supabase.from('comments').delete().eq('id', id)
    fetchAll(currentUserId)
  }

  async function deleteSpot(id) {
    await supabase.from('spots').delete().eq('id', id)
    onRefresh?.(); fetchAll(currentUserId)
  }

  async function buffSpot(id, buffed) {
    await supabase.from('spots').update({ status: buffed ? 'buffed' : 'approved' }).eq('id', id)
    onRefresh?.(); fetchAll(currentUserId)
  }

  async function setUserRank(userId, rank) {
    if (isAdminUser(userId) && !isSuperAdmin) return
    if (userId === SUPERADMIN_ID) return
    await supabase.from('profiles').update({ rank }).eq('id', userId)
    fetchAll(currentUserId)
  }

  async function toggleBan(userId, isBanned) {
    if (userId === SUPERADMIN_ID) return
    if (isAdminUser(userId) && !isSuperAdmin) return
    await supabase.from('profiles').update({ is_banned: !isBanned }).eq('id', userId)
    fetchAll(currentUserId)
  }

  async function setAdminRole(userId, level) {
    if (!isSuperAdmin) return
    if (userId === SUPERADMIN_ID) return
    if (level === 0) {
      await supabase.from('admins').delete().eq('user_id', userId)
    } else {
      const existing = admins.find(a => a.user_id === userId)
      if (existing) {
        await supabase.from('admins').update({ level }).eq('user_id', userId)
      } else {
        await supabase.from('admins').insert({ user_id: userId, level })
      }
    }
    fetchAll(currentUserId)
  }

  async function addCrew() {
    if (!newCrewName.trim()) { setCrewError('Podaj nazwę'); return }
    const { error } = await supabase.from('crews').insert({ name: newCrewName.trim().toUpperCase(), color: newCrewColor })
    if (error) { setCrewError(error.message); return }
    setNewCrewName(''); setCrewError('')
    fetchAll(currentUserId)
  }

  async function updateCrewColor(id, color) {
    await supabase.from('crews').update({ color }).eq('id', id)
    onRefresh?.(); fetchAll(currentUserId)
  }

  async function deleteCrew(id) {
    await supabase.from('crews').delete().eq('id', id)
    onRefresh?.(); fetchAll(currentUserId)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 26px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 style={{ color: 'white', fontWeight: 700, fontSize: '1.15rem', margin: 0 }}>
              {isSuperAdmin ? '👑 Superadmin' : '⚡ Panel Admina'}
            </h2>
            <p style={{ color: '#52525b', fontSize: '0.75rem', marginTop: '2px', marginBottom: 0 }}>
              {comments.length} komentarzy czeka
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#71717a', fontSize: '1rem', cursor: 'pointer', borderRadius: '8px', width: '32px', height: '32px' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '10px 26px', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
          <TabBtn id="comments" label="💬 Komentarze" count={comments.length} />
          <TabBtn id="spots"    label="📍 Prace"       count={spots.length} />
          <TabBtn id="crews"    label="👥 Crew"         count={crews.length} />
          <TabBtn id="users"    label="🏅 Użytkownicy"  count={users.length} />
          {isSuperAdmin && <TabBtn id="admins" label="⚡ Admini" />}
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
                    <span style={{ color: '#f97316', fontWeight: 600, fontSize: '0.85rem' }}>{c.profiles?.username || '?'}</span>
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>{c.comment_type || 'normal'}</span>
                  </div>
                  <p style={{ color: '#d4d4d8', fontSize: '0.88rem', marginBottom: '10px' }}>{c.content}</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => approveComment(c.id)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(34,197,94,0.12)', color: '#22c55e', outline: '1px solid rgba(34,197,94,0.25)', fontWeight: 600, fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif' }}>✓ Zatwierdź</button>
                    <button onClick={() => rejectComment(c.id)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: '#ef4444', outline: '1px solid rgba(239,68,68,0.22)', fontWeight: 600, fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif' }}>✕ Odrzuć</button>
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
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600, background: sp.status === 'buffed' ? 'rgba(113,113,122,0.15)' : 'rgba(34,197,94,0.1)', color: sp.status === 'buffed' ? '#71717a' : '#22c55e' }}>{sp.status === 'buffed' ? '🪣 buffed' : '✓ approved'}</span>
                  </div>
                  {sp.crew_tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      {sp.crew_tags.map(tag => <span key={tag} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}>{tag}</span>)}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => buffSpot(sp.id, sp.status !== 'buffed')} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: sp.status === 'buffed' ? 'rgba(34,197,94,0.1)' : 'rgba(113,113,122,0.1)', color: sp.status === 'buffed' ? '#22c55e' : '#a1a1aa', outline: `1px solid ${sp.status === 'buffed' ? 'rgba(34,197,94,0.25)' : 'rgba(113,113,122,0.2)'}`, fontWeight: 600, fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif' }}>{sp.status === 'buffed' ? '✓ Odznacz buff' : '🪣 Buff'}</button>
                    <button onClick={() => deleteSpot(sp.id)} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: '#ef4444', outline: '1px solid rgba(239,68,68,0.22)', fontWeight: 600, fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif' }}>🗑 Usuń</button>
                  </div>
                </div>
              ))

          ) : tab === 'crews' ? (
            <div>
              <div style={{ ...card, marginBottom: '16px', background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.15)' }}>
                <p style={{ color: '#f97316', fontWeight: 700, fontSize: '0.85rem', marginBottom: '12px' }}>+ Dodaj nowy crew</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={newCrewName} onChange={e => setNewCrewName(e.target.value.toUpperCase())} placeholder="Nazwa (np. TKO)" style={{ flex: 1, minWidth: '120px', padding: '9px 14px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '0.88rem', fontFamily: 'Space Grotesk, sans-serif', outline: 'none' }} />
                  <button onClick={addCrew} style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: '#f97316', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>Dodaj</button>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <p style={{ color: '#52525b', fontSize: '0.72rem', marginBottom: '6px' }}>Wybierz kolor:</p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {COLOR_PALETTE.map(col => <div key={col} onClick={() => setNewCrewColor(col)} style={{ width: '24px', height: '24px', borderRadius: '6px', background: col, cursor: 'pointer', outline: newCrewColor === col ? '2px solid white' : '2px solid transparent', outlineOffset: '2px' }} />)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <span style={{ color: '#52525b', fontSize: '0.72rem' }}>Podgląd:</span>
                    <span style={{ padding: '3px 12px', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700, background: newCrewColor, color: '#000' }}>{newCrewName || 'CREW'}</span>
                  </div>
                </div>
                {crewError && <p style={{ color: '#f87171', fontSize: '0.78rem', marginTop: '6px' }}>{crewError}</p>}
              </div>
              {crews.length === 0
                ? <p style={{ color: '#52525b', textAlign: 'center', padding: '20px' }}>Brak crew</p>
                : crews.map(crew => (
                  <div key={crew.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ padding: '4px 14px', borderRadius: '9999px', fontSize: '0.85rem', fontWeight: 700, background: crew.color, color: '#000', flexShrink: 0 }}>{crew.name}</span>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', flex: 1 }}>
                      {COLOR_PALETTE.map(col => <div key={col} onClick={() => updateCrewColor(crew.id, col)} style={{ width: '20px', height: '20px', borderRadius: '5px', background: col, cursor: 'pointer', outline: crew.color === col ? '2px solid white' : '2px solid transparent', outlineOffset: '2px' }} />)}
                    </div>
                    <button onClick={() => deleteCrew(crew.id)} style={{ padding: '5px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.75rem', fontFamily: 'Space Grotesk, sans-serif', flexShrink: 0 }}>🗑</button>
                  </div>
                ))
              }
            </div>

          ) : tab === 'users' ? (
            users.length === 0
              ? <p style={{ color: '#52525b', textAlign: 'center', padding: '40px' }}>Brak użytkowników</p>
              : users.map(u => {
                const rank = u.rank ?? 0
                const rInfo = RANKS[rank] ?? RANKS[0]
                const isBanned = u.is_banned === true
                const userIsAdmin = isAdminUser(u.id)
                const userIsSuperAdmin = u.id === SUPERADMIN_ID
                const canChangeRank = isSuperAdmin || (!userIsAdmin && !userIsSuperAdmin)
                const canBan = (isSuperAdmin && !userIsSuperAdmin) || (!userIsAdmin && !userIsSuperAdmin)

                return (
                  <div key={u.id} style={{
                    ...card,
                    border: isBanned ? '1px solid rgba(239,68,68,0.25)' : userIsSuperAdmin ? '1px solid rgba(249,115,22,0.3)' : userIsAdmin ? '1px solid rgba(56,189,248,0.2)' : card.border,
                    background: isBanned ? 'rgba(239,68,68,0.04)' : userIsSuperAdmin ? 'rgba(249,115,22,0.04)' : card.background,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: isBanned ? '#71717a' : 'white', fontWeight: 600, fontSize: '0.92rem', textDecoration: isBanned ? 'line-through' : 'none' }}>{u.username}</span>
                        {userIsSuperAdmin && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(249,115,22,0.2)', color: '#f97316' }}>👑 SUPERADMIN</span>}
                        {userIsAdmin && !userIsSuperAdmin && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>⚡ ADMIN</span>}
                        {isBanned && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>ZBANOWANY</span>}
                        {u.discord && <span style={{ color: '#71717a', fontSize: '0.75rem' }}>🎮 {u.discord}</span>}
                      </div>
                      <span style={{ padding: '3px 10px', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700, background: `${rInfo.color}18`, color: rInfo.color, border: `1px solid ${rInfo.color}40` }}>{rInfo.icon} {rInfo.label}</span>
                    </div>

                    {canChangeRank ? (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {Object.entries(RANKS).map(([r, info]) => (
                          <button key={r} onClick={() => setUserRank(u.id, Number(r))} style={{ padding: '5px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', background: rank === Number(r) ? `${info.color}22` : 'rgba(255,255,255,0.04)', color: rank === Number(r) ? info.color : '#52525b', outline: rank === Number(r) ? `1px solid ${info.color}45` : 'none' }}>{info.icon} {info.label}</button>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#3f3f46', fontSize: '0.72rem', marginBottom: '8px' }}>🔒 Rangi chronione</p>
                    )}

                    {canBan && (
                      <button onClick={() => toggleBan(u.id, isBanned)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif', background: isBanned ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', color: isBanned ? '#22c55e' : '#ef4444', outline: isBanned ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.22)' }}>
                        {isBanned ? '✓ Odbanuj' : '🚫 Zbanuj'}
                      </button>
                    )}
                  </div>
                )
              })

          ) : tab === 'admins' && isSuperAdmin ? (
            <div>
              <p style={{ color: '#52525b', fontSize: '0.78rem', marginBottom: '16px' }}>Zarządzaj rolami adminów.</p>
              {users.filter(u => u.id !== SUPERADMIN_ID).map(u => {
                const userAdminLevel = getAdminLevel(u.id)
                const rInfo = RANKS[u.rank ?? 0] ?? RANKS[0]
                return (
                  <div key={u.id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'white', fontWeight: 600, fontSize: '0.92rem' }}>{u.username}</span>
                        <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700, background: `${rInfo.color}18`, color: rInfo.color }}>{rInfo.icon} {rInfo.label}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: userAdminLevel > 0 ? '#38bdf8' : '#3f3f46', fontWeight: 600 }}>{userAdminLevel > 0 ? '⚡ Admin' : 'Brak roli'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setAdminRole(u.id, 0)} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'Space Grotesk, sans-serif', background: userAdminLevel === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', color: userAdminLevel === 0 ? 'white' : '#52525b', outline: userAdminLevel === 0 ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>Brak</button>
                      <button onClick={() => setAdminRole(u.id, 1)} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'Space Grotesk, sans-serif', background: userAdminLevel === 1 ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.04)', color: userAdminLevel === 1 ? '#38bdf8' : '#52525b', outline: userAdminLevel === 1 ? '1px solid rgba(56,189,248,0.3)' : 'none' }}>⚡ Admin</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
