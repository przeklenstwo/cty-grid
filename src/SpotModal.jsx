import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

const COMMENT_TYPES = [
  { value: 'normal', label: '💬 Komentarz', minRank: 0 },
  { value: 'hazard', label: '⚠️ Przypał',   minRank: 2 },
  { value: 'tip',    label: '💡 Tip',        minRank: 1 },
]

const RANKS = {
  0: { label: 'Newbie',  color: '#71717a', icon: '👶' },
  1: { label: 'Writer',  color: '#38bdf8', icon: '✏️' },
  2: { label: 'Veteran', color: '#a78bfa', icon: '🎯' },
  3: { label: 'Legend',  color: '#f97316', icon: '👑' },
}

const rankColors = { 0: '#71717a', 1: '#38bdf8', 2: '#a78bfa', 3: '#f97316' }

export default function SpotModal({ spot, userId, userRank = 0, isAdmin, onClose, onDeleted, onRefresh }) {
  const navigate = useNavigate()

  const [comments, setComments]           = useState([])
  const [author, setAuthor]               = useState(null)
  const [crewMap, setCrewMap]             = useState({})
  const [newComment, setNewComment]       = useState('')
  const [commentType, setCommentType]     = useState('normal')
  const [loading, setLoading]             = useState(false)
  const [sent, setSent]                   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [currentImg, setCurrentImg]       = useState(0)
  const [confirmBuff, setConfirmBuff]     = useState(false)
  const [buffSent, setBuffSent]           = useState(false)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)

  const isOwner   = userId === spot.user_id
  const canDelete = isOwner || isAdmin
  const isBuffed  = spot.status === 'buffed'
  const imageList = spot.image_urls?.length ? spot.image_urls : spot.image_url ? [spot.image_url] : []
  const isMobile  = vw <= 768

  useEffect(() => {
    fetchComments(); fetchAuthor(); fetchCrews()
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [spot.id])

  async function fetchAuthor() {
    if (!spot.user_id) return
    const { data } = await supabase.from('profiles').select('id, username, rank').eq('id', spot.user_id).maybeSingle()
    setAuthor(data)
  }

  async function fetchCrews() {
    const { data } = await supabase.from('crews').select('name, color')
    if (data) { const m = {}; data.forEach(c => { m[c.name] = c.color }); setCrewMap(m) }
  }

  async function fetchComments() {
    const { data } = await supabase.from('comments').select('*, profiles(username, rank)').eq('spot_id', spot.id).eq('status', 'approved').order('created_at', { ascending: true })
    setComments((data || []).filter(c => c.comment_type === 'hazard' ? (userRank >= 2 || isAdmin) : true))
  }

  async function handleSendComment() {
    if (!newComment.trim()) return
    setLoading(true)
    await supabase.from('comments').insert({ spot_id: spot.id, user_id: userId, content: newComment.trim(), comment_type: commentType, status: userRank >= 1 ? 'approved' : 'pending' })
    setNewComment(''); setSent(true); setLoading(false)
    if (userRank >= 1) fetchComments()
    setTimeout(() => setSent(false), 3000)
  }

  async function handleReportBuff() {
    await supabase.from('comments').insert({ spot_id: spot.id, user_id: userId, content: '🪣 Zgłoszono jako BUFFED — praca może być zamalowana.', comment_type: 'buff_report', status: 'pending' })
    setConfirmBuff(false); setBuffSent(true)
    setTimeout(() => setBuffSent(false), 4000)
  }

  async function handleAdminBuff() {
    await supabase.from('spots').update({ status: 'buffed' }).eq('id', spot.id)
    onRefresh?.(); onClose()
  }

  async function handleAdminUnbuff() {
    await supabase.from('spots').update({ status: 'approved' }).eq('id', spot.id)
    onRefresh?.(); onClose()
  }

  async function handleDelete() {
    setDeleting(true)
    if (imageList.length > 0) {
      const paths = imageList.map(url => url.split('/spot-images/')[1]).filter(Boolean)
      if (paths.length > 0) await supabase.storage.from('spot-images').remove(paths)
    }
    await supabase.from('comments').delete().eq('spot_id', spot.id)
    const { error } = await supabase.from('spots').delete().eq('id', spot.id)
    if (error) { alert('Błąd: ' + error.message); setDeleting(false); return }
    onDeleted(); onClose()
  }

  function goToProfile(pid) { onClose(); navigate(`/profile/${pid}`) }

  function CommentTypeBadge({ type }) {
    const map = {
      hazard:      { label: '⚠️ Przypał', bg: 'rgba(239,68,68,0.12)',   color: '#f87171' },
      tip:         { label: '💡 Tip',     bg: 'rgba(234,179,8,0.1)',    color: '#eab308' },
      buff_report: { label: '🪣 Buff',    bg: 'rgba(113,113,122,0.15)', color: '#a1a1aa' },
    }
    const m = map[type]; if (!m) return null
    return <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>{m.label}</span>
  }

  const availableTypes = COMMENT_TYPES.filter(t => userRank >= t.minRank || isAdmin)

  // ── MOBILE: stary layout kolumnowy ──────────────────────────────────────────
  if (isMobile) {
    return (
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', fontFamily: 'Space Grotesk, sans-serif' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#0c0c0e', border: isBuffed ? '1px solid rgba(113,113,122,0.35)' : '1px solid rgba(255,255,255,0.09)', borderRadius: '16px', width: '100%', height: 'calc(100dvh - 20px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.9)' }}>
          {/* zdjęcie */}
          <div style={{ flex: '0 0 38vh', minHeight: '180px', background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {imageList.length > 0 ? (
              <>
                <img src={imageList[currentImg]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isBuffed ? 'grayscale(100%) brightness(0.55)' : 'none' }} />
                {isBuffed && <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.8)', borderRadius: '8px', padding: '4px 10px' }}><span>🪣 </span><span style={{ color: '#71717a', fontWeight: 700, fontSize: '0.72rem' }}>BUFFED</span></div>}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0c0c0e 0%, transparent 28%)', pointerEvents: 'none' }} />
                {imageList.length > 1 && <>
                  <button onClick={() => setCurrentImg(p => Math.max(0, p - 1))} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1.2rem' }}>‹</button>
                  <button onClick={() => setCurrentImg(p => Math.min(imageList.length - 1, p + 1))} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1.2rem' }}>›</button>
                </>}
              </>
            ) : <div style={{ color: '#3f3f46', fontSize: '3rem', textAlign: 'center' }}>{isBuffed ? '🪣' : '🎨'}</div>}
          </div>
          {/* info + komentarze */}
          <InfoPanel {...{ spot, author, crewMap, isBuffed, isAdmin, isOwner, canDelete, confirmDelete, setConfirmDelete, deleting, handleDelete, handleAdminBuff, handleAdminUnbuff, confirmBuff, setConfirmBuff, buffSent, handleReportBuff, comments, availableTypes, commentType, setCommentType, newComment, setNewComment, handleSendComment, loading, sent, userRank, goToProfile, CommentTypeBadge, isMobile: true }} />
        </div>
      </div>
    )
  }

  // ── DESKTOP: zdjęcie osobno po lewej, modal po prawej ───────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '16px', padding: '24px 24px 24px 180px', fontFamily: 'Space Grotesk, sans-serif', pointerEvents: 'none' }}>

      {/* LEWY PANEL — zdjęcie */}
      <div onClick={e => e.stopPropagation()} style={{ flex: '0 0 auto', width: 'min(44vw, 680px)', height: 'min(82vh, 860px)', background: '#000', borderRadius: '20px', overflow: 'hidden', position: 'relative', boxShadow: '0 40px 100px rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.07)', pointerEvents: 'auto' }}>
        {imageList.length > 0 ? (
          <>
            <img src={imageList[currentImg]} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', filter: isBuffed ? 'grayscale(100%) brightness(0.55)' : 'none', transition: 'filter 0.4s' }} />
            {isBuffed && (
              <div style={{ position: 'absolute', top: '16px', left: '16px', background: 'rgba(0,0,0,0.85)', borderRadius: '10px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🪣</span>
                <span style={{ color: '#71717a', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.1em' }}>BUFFED</span>
              </div>
            )}
            {imageList.length > 1 && (
              <>
                <button onClick={() => setCurrentImg(p => Math.max(0, p - 1))} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>‹</button>
                <button onClick={() => setCurrentImg(p => Math.min(imageList.length - 1, p + 1))} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>›</button>
                <div style={{ position: 'absolute', bottom: '18px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '7px' }}>
                  {imageList.map((_, i) => (
                    <div key={i} onClick={() => setCurrentImg(i)} style={{ width: i === currentImg ? '24px' : '7px', height: '7px', borderRadius: '4px', cursor: 'pointer', background: i === currentImg ? (isBuffed ? '#71717a' : '#f97316') : 'rgba(255,255,255,0.3)', transition: 'all 0.2s' }} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '4rem' }}>{isBuffed ? '🪣' : '🎨'}</span>
            <span style={{ color: '#3f3f46', fontSize: '0.9rem' }}>{isBuffed ? 'Zamalowane' : 'Brak zdjęć'}</span>
          </div>
        )}
      </div>

      {/* PRAWY PANEL — info + komentarze */}
      <div onClick={e => e.stopPropagation()} style={{ flex: '0 0 auto', width: 'min(38vw, 520px)', height: 'min(82vh, 860px)', background: '#0c0c0e', border: isBuffed ? '1px solid rgba(113,113,122,0.35)' : '1px solid rgba(255,255,255,0.09)', borderRadius: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.9)', pointerEvents: 'auto' }}>
        <InfoPanel {...{ spot, author, crewMap, isBuffed, isAdmin, isOwner, canDelete, confirmDelete, setConfirmDelete, deleting, handleDelete, handleAdminBuff, handleAdminUnbuff, confirmBuff, setConfirmBuff, buffSent, handleReportBuff, comments, availableTypes, commentType, setCommentType, newComment, setNewComment, handleSendComment, loading, sent, userRank, goToProfile, CommentTypeBadge, isMobile: false }} />
      </div>
    </div>
  )
}

// ── Wspólny panel info+komentarze ────────────────────────────────────────────
function InfoPanel({ spot, author, crewMap, isBuffed, isAdmin, isOwner, canDelete, confirmDelete, setConfirmDelete, deleting, handleDelete, handleAdminBuff, handleAdminUnbuff, confirmBuff, setConfirmBuff, buffSent, handleReportBuff, comments, availableTypes, commentType, setCommentType, newComment, setNewComment, handleSendComment, loading, sent, userRank, goToProfile, CommentTypeBadge, isMobile }) {
  const pad = isMobile ? '14px 14px 12px' : '20px 22px 14px'

  return (
    <>
      {/* Header */}
      <div style={{ padding: pad, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          <h2 style={{ color: isBuffed ? '#52525b' : 'white', fontWeight: 700, fontSize: isMobile ? '1.08rem' : '1.3rem', letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0, flex: 1, wordBreak: 'break-word', textDecoration: isBuffed ? 'line-through' : 'none' }}>{spot.title}</h2>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
            {canDelete && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap' }}>🗑 {isAdmin && !isOwner ? 'Admin' : 'Usuń'}</button>
            )}
          </div>
        </div>

        {author && (
          <button onClick={() => goToProfile(author.id)} style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', width: 'fit-content' }}>
            <span style={{ fontSize: '0.85rem' }}>{RANKS[author.rank ?? 0]?.icon}</span>
            <span style={{ color: rankColors[author.rank ?? 0], fontWeight: 700, fontSize: '0.85rem' }}>{author.username}</span>
            <span style={{ color: '#3f3f46', fontSize: '0.72rem' }}>{RANKS[author.rank ?? 0]?.label}</span>
            <span style={{ color: '#3f3f46', fontSize: '0.72rem', marginLeft: 'auto' }}>→ profil</span>
          </button>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isBuffed && <span style={{ padding: '2px 10px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(113,113,122,0.15)', color: '#71717a', border: '1px solid rgba(113,113,122,0.3)' }}>🪣 BUFFED</span>}
          <span style={{ color: '#52525b', fontSize: '0.73rem' }}>📌 {spot.location_fuzzed ? `~${spot.fuzz_radius}m` : `${spot.lat?.toFixed(4)}, ${spot.lng?.toFixed(4)}`}</span>
          <span style={{ color: spot.is_public ? '#22c55e' : '#f97316', fontSize: '0.73rem' }}>{spot.is_public ? '🌍 Public' : '🔒 Private'}</span>
          {(spot.crew_tags || []).map(crew => (
            <span key={crew} style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, background: crewMap[crew] || '#f97316', color: '#000' }}>{crew}</span>
          ))}
        </div>

        {spot.description && (
          <p style={{ color: isBuffed ? '#3f3f46' : '#a1a1aa', fontSize: '0.87rem', lineHeight: 1.55, marginTop: '10px', marginBottom: 0, wordBreak: 'break-word' }}>
            {spot.description.split(' ').map((word, i) =>
              word.startsWith('#')
                ? <span key={i} style={{ color: isBuffed ? '#3f3f46' : '#f97316', fontWeight: 600 }}>{word} </span>
                : word + ' '
            )}
          </p>
        )}

        {/* Buff akcje */}
        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isAdmin && (
            isBuffed
              ? <button onClick={handleAdminUnbuff} style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(34,197,94,0.12)', color: '#22c55e', outline: '1px solid rgba(34,197,94,0.3)', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'Space Grotesk, sans-serif' }}>✓ Odznacz buff</button>
              : <button onClick={handleAdminBuff} style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(113,113,122,0.1)', color: '#a1a1aa', outline: '1px solid rgba(113,113,122,0.25)', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'Space Grotesk, sans-serif' }}>🪣 Oznacz jako BUFFED</button>
          )}
          {!isAdmin && !isBuffed && !buffSent && !confirmBuff && (
            <button onClick={() => setConfirmBuff(true)} style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(113,113,122,0.07)', color: '#52525b', outline: '1px solid rgba(113,113,122,0.15)', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'Space Grotesk, sans-serif' }}>🪣 Zgłoś Buff</button>
          )}
          {confirmBuff && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: '#71717a', fontSize: '0.73rem' }}>Na pewno?</span>
              <button onClick={handleReportBuff} style={{ padding: '4px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'rgba(113,113,122,0.15)', color: '#a1a1aa', fontWeight: 700, fontSize: '0.73rem', fontFamily: 'Space Grotesk, sans-serif' }}>Tak</button>
              <button onClick={() => setConfirmBuff(false)} style={{ padding: '4px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'none', color: '#52525b', fontWeight: 600, fontSize: '0.73rem', fontFamily: 'Space Grotesk, sans-serif' }}>Nie</button>
            </div>
          )}
          {buffSent && <span style={{ color: '#71717a', fontSize: '0.75rem' }}>✅ Zgłoszono</span>}
        </div>

        {confirmDelete && (
          <div style={{ marginTop: '10px', padding: '12px', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ color: '#f87171', fontSize: '0.83rem', marginBottom: '8px', marginTop: 0, fontWeight: 600 }}>⚠️ Usunąć tę pracę?</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: '#a1a1aa', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '0.82rem' }}>Anuluj</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '0.82rem', opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Usuwanie...' : '🗑 Tak, usuń'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Komentarze */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? '12px 14px' : '14px 22px' }}>
        <p style={{ color: '#3f3f46', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 0, marginBottom: '10px' }}>Komentarze ({comments.length})</p>
        {userRank < 2 && !isAdmin && (
          <div style={{ marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem' }}>🔒</span>
            <p style={{ color: '#71717a', fontSize: '0.75rem', margin: 0 }}>Komentarze o <strong style={{ color: '#a78bfa' }}>przypale</strong> od rangi <strong style={{ color: '#a78bfa' }}>Veteran</strong></p>
          </div>
        )}
        {comments.length === 0 && <p style={{ color: '#3f3f46', fontSize: '0.85rem' }}>Brak komentarzy. Bądź pierwszy!</p>}
        {comments.map(c => (
          <div key={c.id} style={{ marginBottom: '10px', padding: '10px 14px', borderRadius: '10px', background: c.comment_type === 'hazard' ? 'rgba(239,68,68,0.05)' : c.comment_type === 'buff_report' ? 'rgba(113,113,122,0.07)' : c.comment_type === 'tip' ? 'rgba(234,179,8,0.04)' : 'rgba(255,255,255,0.03)', border: c.comment_type === 'hazard' ? '1px solid rgba(239,68,68,0.15)' : c.comment_type === 'buff_report' ? '1px solid rgba(113,113,122,0.2)' : c.comment_type === 'tip' ? '1px solid rgba(234,179,8,0.12)' : '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button onClick={() => c.profiles?.username && goToProfile(c.user_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: rankColors[c.profiles?.rank ?? 0], fontWeight: 600, fontSize: '0.82rem', fontFamily: 'Space Grotesk, sans-serif' }}>{c.profiles?.username || 'Anonim'}</button>
                <CommentTypeBadge type={c.comment_type} />
              </div>
              <span style={{ color: '#3f3f46', fontSize: '0.7rem' }}>{new Date(c.created_at).toLocaleDateString('pl-PL')}</span>
            </div>
            <p style={{ color: '#d4d4d8', fontSize: '0.85rem', lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>{c.content}</p>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: isMobile ? '12px 14px 14px' : '12px 22px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        {sent ? (
          <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '10px 14px', color: '#22c55e', fontSize: '0.85rem', textAlign: 'center' }}>
            {userRank >= 1 ? '✅ Komentarz dodany!' : '✅ Wysłany — czeka na zatwierdzenie'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {availableTypes.length > 1 && (
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {availableTypes.map(t => (
                  <button key={t.value} onClick={() => setCommentType(t.value)} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', background: commentType === t.value ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.04)', color: commentType === t.value ? '#f97316' : '#71717a', outline: commentType === t.value ? '1px solid rgba(249,115,22,0.4)' : 'none' }}>{t.label}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={{ flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: '0.88rem', fontFamily: 'Space Grotesk, sans-serif', outline: 'none' }} placeholder="Napisz komentarz..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendComment()} />
              <button onClick={handleSendComment} disabled={loading || !newComment.trim()} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: '#f97316', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', opacity: !newComment.trim() ? 0.4 : 1, flexShrink: 0 }}>→</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const RANKS_LOCAL = {
  0: { label: 'Newbie',  color: '#71717a', icon: '👶' },
  1: { label: 'Writer',  color: '#38bdf8', icon: '✏️' },
  2: { label: 'Veteran', color: '#a78bfa', icon: '🎯' },
  3: { label: 'Legend',  color: '#f97316', icon: '👑' },
}
