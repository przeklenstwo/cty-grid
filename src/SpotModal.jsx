import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { notifyAdmin } from './notify'

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

const REACTION_EMOJIS = ['🔥', '💯', '👀', '💀', '🎨', '👑']
const rankColors = { 0: '#71717a', 1: '#38bdf8', 2: '#a78bfa', 3: '#f97316' }

export default function SpotModal({ spot, userId, userRank = 0, isAdmin, onClose, onDeleted, onRefresh }) {
  const navigate = useNavigate()

  const [comments, setComments]         = useState([])
  const [replies, setReplies]           = useState({})
  const [reactions, setReactions]       = useState({})
  const [author, setAuthor]             = useState(null)
  const [crewMap, setCrewMap]           = useState({})
  const [currentUserProfile, setCurrentUserProfile] = useState(null)
  const [mobileTab, setMobileTab]       = useState('info')

  const [newComment, setNewComment]     = useState('')
  const [commentType, setCommentType]   = useState('normal')
  const [loading, setLoading]           = useState(false)
  const [sent, setSent]                 = useState(false)
  const [replyingTo, setReplyingTo]     = useState(null)
  const [replyText, setReplyText]       = useState('')
  const [replyLoading, setReplyLoading] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [currentImg, setCurrentImg]     = useState(0)
  const [confirmBuff, setConfirmBuff]   = useState(false)
  const [buffSent, setBuffSent]         = useState(false)

  const isOwner   = userId === spot.user_id
  const canDelete = isOwner || isAdmin
  const isBuffed  = spot.status === 'buffed'
  const imageList = spot.image_urls?.length ? spot.image_urls : spot.image_url ? [spot.image_url] : []

  useEffect(() => {
    fetchComments(); fetchAuthor(); fetchCrews(); fetchCurrentUserProfile(); fetchReactions()
  }, [spot.id])

  async function fetchCurrentUserProfile() {
    if (!userId) return
    const { data } = await supabase.from('profiles').select('username').eq('id', userId).single()
    setCurrentUserProfile(data)
  }

  async function fetchAuthor() {
    if (!spot.user_id) return
    const { data } = await supabase.from('profiles').select('id, username, rank').eq('id', spot.user_id).single()
    setAuthor(data)
  }

  async function fetchCrews() {
    const { data } = await supabase.from('crews').select('name, color')
    if (data) { const map = {}; data.forEach(c => { map[c.name] = c.color }); setCrewMap(map) }
  }

  async function fetchReactions() {
    const { data } = await supabase.from('reactions').select('*').eq('spot_id', spot.id)
    if (!data) return
    const grouped = {}
    data.forEach(r => { if (!grouped[r.emoji]) grouped[r.emoji] = []; grouped[r.emoji].push(r) })
    setReactions(grouped)
  }

  async function toggleReaction(emoji) {
    if (!userId) return
    const existing = (reactions[emoji] || []).find(r => r.user_id === userId)
    if (existing) await supabase.from('reactions').delete().eq('id', existing.id)
    else await supabase.from('reactions').insert({ spot_id: spot.id, user_id: userId, emoji })
    fetchReactions()
  }

  async function fetchComments() {
    const { data } = await supabase.from('comments').select('*, profiles(username, rank)').eq('spot_id', spot.id).eq('status', 'approved').order('created_at', { ascending: true })
    const all = (data || []).filter(c => c.comment_type === 'hazard' ? (userRank >= 2 || isAdmin) : true)
    setComments(all.filter(c => !c.parent_id))
    const repliesMap = {}
    all.filter(c => c.parent_id).forEach(r => { if (!repliesMap[r.parent_id]) repliesMap[r.parent_id] = []; repliesMap[r.parent_id].push(r) })
    setReplies(repliesMap)
  }

  async function handleSendComment() {
    if (!newComment.trim()) return
    setLoading(true)
    await supabase.from('comments').insert({ spot_id: spot.id, user_id: userId, content: newComment.trim(), comment_type: commentType, status: userRank >= 1 ? 'approved' : 'pending', parent_id: null })
    notifyAdmin({ type: 'comment', title: spot.title, username: currentUserProfile?.username || '?', comment: newComment.trim() })
    setNewComment(''); setSent(true); setLoading(false)
    if (userRank >= 1) fetchComments()
    setTimeout(() => setSent(false), 3000)
  }

  async function handleSendReply() {
    if (!replyText.trim() || !replyingTo) return
    setReplyLoading(true)
    await supabase.from('comments').insert({ spot_id: spot.id, user_id: userId, content: replyText.trim(), comment_type: 'normal', status: userRank >= 1 ? 'approved' : 'pending', parent_id: replyingTo.id })
    setReplyText(''); setReplyingTo(null); setReplyLoading(false)
    if (userRank >= 1) fetchComments()
  }

  async function handleReportBuff() {
    await supabase.from('comments').insert({ spot_id: spot.id, user_id: userId, content: '🪣 Zgłoszono jako BUFFED.', comment_type: 'buff_report', status: 'pending', parent_id: null })
    notifyAdmin({ type: 'buff', title: spot.title, username: currentUserProfile?.username || '?' })
    setConfirmBuff(false); setBuffSent(true)
    setTimeout(() => setBuffSent(false), 4000)
  }

  async function handleAdminBuff() { await supabase.from('spots').update({ status: 'buffed' }).eq('id', spot.id); onRefresh?.(); onClose() }
  async function handleAdminUnbuff() { await supabase.from('spots').update({ status: 'approved' }).eq('id', spot.id); onRefresh?.(); onClose() }

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

  function goToProfile(uid) { onClose(); navigate(`/profile/${uid}`) }

  function CommentTypeBadge({ type }) {
    const map = { hazard: { label: '⚠️ Przypał', bg: 'rgba(239,68,68,0.12)', color: '#f87171' }, tip: { label: '💡 Tip', bg: 'rgba(234,179,8,0.1)', color: '#eab308' }, buff_report: { label: '🪣 Buff', bg: 'rgba(113,113,122,0.15)', color: '#a1a1aa' } }
    const m = map[type]; if (!m) return null
    return <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: m.bg, color: m.color }}>{m.label}</span>
  }

  function CommentItem({ c, isReply = false }) {
    const commentReplies = replies[c.id] || []
    const [showReplies, setShowReplies] = useState(true)
    return (
      <div style={{ marginBottom: isReply ? '6px' : '10px' }}>
        <div style={{ padding: '9px 12px', borderRadius: '10px', background: isReply ? 'rgba(255,255,255,0.02)' : c.comment_type === 'hazard' ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)', border: isReply ? '1px solid rgba(255,255,255,0.04)' : c.comment_type === 'hazard' ? '1px solid rgba(239,68,68,0.15)' : '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button onClick={() => goToProfile(c.user_id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: rankColors[c.profiles?.rank ?? 0], fontWeight: 700, fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif' }}>{c.profiles?.username || 'Anonim'}</button>
              <CommentTypeBadge type={c.comment_type} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#3f3f46', fontSize: '0.68rem' }}>{new Date(c.created_at).toLocaleDateString('pl-PL')}</span>
              {!isReply && <button onClick={() => setReplyingTo(replyingTo?.id === c.id ? null : { id: c.id, username: c.profiles?.username || 'Anonim' })} style={{ background: replyingTo?.id === c.id ? 'rgba(249,115,22,0.1)' : 'none', border: 'none', cursor: 'pointer', padding: '1px 6px', color: replyingTo?.id === c.id ? '#f97316' : '#52525b', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', borderRadius: '4px' }}>↩</button>}
            </div>
          </div>
          <p style={{ color: '#d4d4d8', fontSize: '0.83rem', lineHeight: 1.5, margin: 0 }}>{c.content}</p>
        </div>
        {!isReply && replyingTo?.id === c.id && (
          <div style={{ marginTop: '6px', marginLeft: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div style={{ width: '2px', background: 'rgba(249,115,22,0.4)', alignSelf: 'stretch', borderRadius: '1px', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', gap: '6px' }}>
              <input autoFocus value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSendReply(); if (e.key === 'Escape') setReplyingTo(null) }} placeholder={`@${replyingTo.username}...`} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.05)', color: 'white', fontSize: '0.82rem', fontFamily: 'Space Grotesk, sans-serif', outline: 'none' }} />
              <button onClick={handleSendReply} disabled={replyLoading || !replyText.trim()} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#f97316', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', opacity: !replyText.trim() ? 0.4 : 1 }}>→</button>
            </div>
          </div>
        )}
        {!isReply && commentReplies.length > 0 && (
          <div style={{ marginLeft: '12px', marginTop: '4px', display: 'flex', gap: '8px' }}>
            <div style={{ width: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '1px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              {showReplies ? (
                <>{commentReplies.map(r => <CommentItem key={r.id} c={r} isReply={true} />)}</>
              ) : (
                <button onClick={() => setShowReplies(true)} style={{ background: 'none', border: 'none', color: '#f97316', fontSize: '0.72rem', cursor: 'pointer', padding: '2px 0', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>▼ {commentReplies.length} odpowiedzi</button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const availableTypes = COMMENT_TYPES.filter(t => userRank >= t.minRank || isAdmin)

  // Panel informacyjny — wspólny dla mobile info tab i desktop
  function InfoPanel() {
    return (
      <div style={{ padding: '16px 20px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <h2 style={{ color: isBuffed ? '#52525b' : 'white', fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.02em', margin: 0, flex: 1, textDecoration: isBuffed ? 'line-through' : 'none' }}>{spot.title}</h2>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {canDelete && !confirmDelete && <button onClick={() => setConfirmDelete(true)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif' }}>🗑</button>}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#71717a', cursor: 'pointer', borderRadius: '8px', width: '30px', height: '30px', fontSize: '0.9rem' }}>✕</button>
          </div>
        </div>

        {author && (
          <button onClick={() => goToProfile(author.id)} style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
            <span>{RANKS[author.rank ?? 0]?.icon}</span>
            <span style={{ color: rankColors[author.rank ?? 0], fontWeight: 700, fontSize: '0.82rem' }}>{author.username}</span>
            <span style={{ color: '#3f3f46', fontSize: '0.68rem', marginLeft: 'auto' }}>→</span>
          </button>
        )}

        <div style={{ display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isBuffed && <span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(113,113,122,0.15)', color: '#71717a' }}>🪣 BUFFED</span>}
          {(spot.crew_tags || []).map(crew => <span key={crew} style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700, background: crewMap[crew] || '#f97316', color: '#000' }}>{crew}</span>)}
        </div>

        {spot.description && <p style={{ color: '#a1a1aa', fontSize: '0.82rem', lineHeight: 1.5, marginTop: '7px', marginBottom: 0 }}>{spot.description}</p>}

        {/* REAKCJE */}
        <div style={{ display: 'flex', gap: '5px', marginTop: '10px', flexWrap: 'wrap' }}>
          {REACTION_EMOJIS.map(emoji => {
            const count = (reactions[emoji] || []).length
            const mine = (reactions[emoji] || []).some(r => r.user_id === userId)
            return (
              <button key={emoji} onClick={() => toggleReaction(emoji)} style={{ padding: '3px 9px', borderRadius: '9999px', border: 'none', background: mine ? 'rgba(249,115,22,0.2)' : count > 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px', outline: mine ? '1px solid rgba(249,115,22,0.4)' : 'none', transition: 'all 0.15s', transform: mine ? 'scale(1.05)' : 'scale(1)' }}>
                <span>{emoji}</span>
                {count > 0 && <span style={{ color: mine ? '#f97316' : '#71717a', fontSize: '0.68rem', fontWeight: 700 }}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Buff akcje */}
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isAdmin && (isBuffed
            ? <button onClick={handleAdminUnbuff} style={{ padding: '4px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600, fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif' }}>✓ Odznacz buff</button>
            : <button onClick={handleAdminBuff} style={{ padding: '4px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'rgba(113,113,122,0.1)', color: '#a1a1aa', fontWeight: 600, fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif' }}>🪣 Oznacz BUFFED</button>
          )}
          {!isAdmin && !isBuffed && !buffSent && !confirmBuff && <button onClick={() => setConfirmBuff(true)} style={{ padding: '4px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'rgba(113,113,122,0.07)', color: '#52525b', fontWeight: 600, fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif' }}>🪣 Zgłoś Buff</button>}
          {confirmBuff && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: '#71717a', fontSize: '0.72rem' }}>Na pewno?</span>
              <button onClick={handleReportBuff} style={{ padding: '3px 9px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'rgba(113,113,122,0.15)', color: '#a1a1aa', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif' }}>Tak</button>
              <button onClick={() => setConfirmBuff(false)} style={{ padding: '3px 9px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'none', color: '#52525b', fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.72rem' }}>Nie</button>
            </div>
          )}
          {buffSent && <span style={{ color: '#71717a', fontSize: '0.72rem' }}>✅ Zgłoszono</span>}
        </div>

        {confirmDelete && (
          <div style={{ marginTop: '10px', padding: '10px', borderRadius: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '8px', fontWeight: 600 }}>⚠️ Usunąć tę pracę?</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '7px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: '#a1a1aa', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '0.8rem' }}>Anuluj</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '7px', borderRadius: '8px', border: 'none', background: '#ef4444', color: 'white', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '0.8rem', opacity: deleting ? 0.6 : 1 }}>{deleting ? '...' : '🗑 Usuń'}</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function CommentsPanel() {
    return (
      <>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column' }}>
          <p style={{ color: '#3f3f46', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Komentarze ({comments.length + Object.values(replies).flat().length})
          </p>
          {comments.length === 0 && <p style={{ color: '#3f3f46', fontSize: '0.82rem' }}>Brak komentarzy. Bądź pierwszy!</p>}
          {comments.map(c => <CommentItem key={c.id} c={c} />)}
        </div>

        {/* INPUT */}
        <div style={{ padding: '8px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {sent ? (
            <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '10px', color: '#22c55e', fontSize: '0.82rem', textAlign: 'center' }}>
              {userRank >= 1 ? '✅ Komentarz dodany!' : '✅ Czeka na zatwierdzenie'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {availableTypes.length > 1 && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  {availableTypes.map(t => <button key={t.value} onClick={() => setCommentType(t.value)} style={{ padding: '3px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', background: commentType === t.value ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.04)', color: commentType === t.value ? '#f97316' : '#71717a', outline: commentType === t.value ? '1px solid rgba(249,115,22,0.4)' : 'none' }}>{t.label}</button>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px' }}>
                <input style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: '0.85rem', fontFamily: 'Space Grotesk, sans-serif', outline: 'none' }} placeholder="Napisz komentarz..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendComment()} />
                <button onClick={handleSendComment} disabled={loading || !newComment.trim()} style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', background: '#f97316', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', opacity: !newComment.trim() ? 0.4 : 1 }}>→</button>
              </div>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .spot-modal-outer {
            padding: 0 !important;
            align-items: flex-end !important;
          }
          .spot-modal-inner {
            flex-direction: column !important;
            width: 100vw !important;
            height: 100dvh !important;
            max-width: 100vw !important;
            border-radius: 0 !important;
            height: unset !important;
          }
          .spot-img-panel {
            flex: 0 0 auto !important;
            width: 100% !important;
            aspect-ratio: 16/9 !important;
            max-height: 40vh !important;
            min-height: unset !important;
          }
          .spot-info-panel {
            flex: 1 !important;
            min-height: 0 !important;
            overflow-y: auto !important;
          }
          .spot-desktop-only { display: none !important; }
          .spot-mobile-tabs { display: flex !important; }
        }
        @media (min-width: 769px) {
          .spot-mobile-tabs { display: none !important; }
          .spot-desktop-only { display: flex !important; }
        }
      `}</style>

      <div onClick={onClose} className="spot-modal-outer" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'Space Grotesk, sans-serif' }}>
        <div onClick={e => e.stopPropagation()} className="spot-modal-inner" style={{ background: '#0c0c0e', border: isBuffed ? '1px solid rgba(113,113,122,0.35)' : '1px solid rgba(255,255,255,0.09)', borderRadius: '20px', width: '90vw', maxWidth: '1100px', height: 'min(56.25vw, 82vh)', display: 'flex', flexDirection: 'row', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.9)' }}>

          {/* LEWA: zdjęcia */}
          <div className="spot-img-panel" style={{ flex: '0 0 55%', background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {imageList.length > 0 ? (
              <>
                <img src={imageList[currentImg]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isBuffed ? 'grayscale(100%) brightness(0.55)' : 'none' }} />
                {isBuffed && <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}><span>🪣</span><span style={{ color: '#71717a', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.12em' }}>BUFFED</span></div>}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 70%, #0c0c0e 100%)', pointerEvents: 'none' }} />
                {imageList.length > 1 && (
                  <>
                    <button onClick={() => setCurrentImg(p => Math.max(0, p - 1))} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1.3rem' }}>‹</button>
                    <button onClick={() => setCurrentImg(p => Math.min(imageList.length - 1, p + 1))} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '1.3rem' }}>›</button>
                    <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '5px' }}>
                      {imageList.map((_, i) => <div key={i} onClick={() => setCurrentImg(i)} style={{ width: i === currentImg ? '18px' : '5px', height: '5px', borderRadius: '3px', cursor: 'pointer', background: i === currentImg ? '#f97316' : 'rgba(255,255,255,0.3)', transition: 'all 0.2s' }} />)}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ color: '#3f3f46', fontSize: '2.5rem', textAlign: 'center' }}>
                <div>{isBuffed ? '🪣' : '🎨'}</div>
                <div style={{ fontSize: '0.75rem', marginTop: '6px', color: '#52525b' }}>{isBuffed ? 'Zamalowane' : 'Brak zdjęć'}</div>
              </div>
            )}
          </div>

          {/* PRAWA */}
          <div className="spot-info-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>

            {/* DESKTOP: header + komentarze zawsze widoczne */}
            <div className="spot-desktop-only" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                <InfoPanel />
              </div>
              <CommentsPanel />
            </div>

            {/* MOBILE: tabs */}
            <div className="spot-mobile-tabs" style={{ display: 'none', gap: '4px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              {[{ id: 'info', label: 'ℹ️ Info' }, { id: 'comments', label: `💬 Komentarze (${comments.length})` }].map(t => (
                <button key={t.id} onClick={() => setMobileTab(t.id)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: mobileTab === t.id ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.04)', color: mobileTab === t.id ? '#f97316' : '#71717a', fontWeight: 600, fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif', outline: mobileTab === t.id ? '1px solid rgba(249,115,22,0.3)' : 'none' }}>{t.label}</button>
              ))}
            </div>

            {/* MOBILE: treść taba */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {mobileTab === 'info' ? (
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  <InfoPanel />
                </div>
              ) : (
                <CommentsPanel />
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
