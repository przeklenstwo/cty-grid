import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

// Typy komentarzy
const COMMENT_TYPES = [
  { value: 'normal',   label: '💬 Komentarz',      minRank: 0 },
  { value: 'hazard',   label: '⚠️ Przypał',         minRank: 2, locked: true }, // widoczne tylko dla rank 2+
  { value: 'tip',      label: '💡 Tip',             minRank: 1 },
]

export default function SpotModal({ spot, userId, userRank = 0, isAdmin, onClose, onDeleted }) {
  const [comments, setComments]         = useState([])
  const [newComment, setNewComment]     = useState('')
  const [commentType, setCommentType]   = useState('normal')
  const [loading, setLoading]           = useState(false)
  const [sent, setSent]                 = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [currentImg, setCurrentImg]     = useState(0)

  const isOwner  = userId === spot.user_id
  const canDelete = isOwner || isAdmin
  const imageList = spot.image_urls?.length ? spot.image_urls : spot.image_url ? [spot.image_url] : []

  useEffect(() => { fetchComments() }, [spot.id])

  async function fetchComments() {
    let query = supabase
      .from('comments')
      .select('*, profiles(username, rank)')
      .eq('spot_id', spot.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: true })

    const { data } = await query
    const all = data || []

    // Filtruj komentarze o przypale — widoczne tylko dla rank 2+
    const filtered = all.filter(c => {
      if (c.comment_type === 'hazard') return (userRank >= 2) || isAdmin
      return true
    })

    setComments(filtered)
  }

  async function handleSendComment() {
    if (!newComment.trim()) return
    setLoading(true)
    await supabase.from('comments').insert({
      spot_id: spot.id,
      user_id: userId,
      content: newComment.trim(),
      comment_type: commentType,
      status: 'pending',
    })
    setNewComment('')
    setSent(true)
    setLoading(false)
    setTimeout(() => setSent(false), 3000)
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
    onDeleted()
    onClose()
  }

  function CommentTypeBadge({ type }) {
    const map = {
      hazard: { label: '⚠️ Przypał', bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.25)' },
      tip:    { label: '💡 Tip',     bg: 'rgba(234,179,8,0.1)',   color: '#eab308', border: 'rgba(234,179,8,0.2)' },
    }
    const m = map[type]
    if (!m) return null
    return (
      <span style={{
        fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px',
        borderRadius: '4px', background: m.bg, color: m.color,
        border: `1px solid ${m.border}`,
      }}>{m.label}</span>
    )
  }

  const availableTypes = COMMENT_TYPES.filter(t => (userRank >= t.minRank) || isAdmin)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', fontFamily: 'Space Grotesk, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0c0c0e',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: '20px',
          width: '90vw',
          maxWidth: '1100px',
          height: 'min(56.25vw, 82vh)',
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,0.9)',
        }}
      >

        {/* ── LEWA: zdjęcia ── */}
        <div style={{
          flex: '0 0 55%', background: '#000',
          position: 'relative', display: 'flex',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {imageList.length > 0 ? (
            <>
              <img
                src={imageList[currentImg]} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, transparent 70%, #0c0c0e 100%)',
                pointerEvents: 'none',
              }} />
              {imageList.length > 1 && (
                <>
                  <button onClick={() => setCurrentImg(p => Math.max(0, p - 1))} style={{
                    position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white',
                    borderRadius: '50%', width: '40px', height: '40px',
                    cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1,
                  }}>‹</button>
                  <button onClick={() => setCurrentImg(p => Math.min(imageList.length - 1, p + 1))} style={{
                    position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.65)', border: 'none', color: 'white',
                    borderRadius: '50%', width: '40px', height: '40px',
                    cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1,
                  }}>›</button>
                  <div style={{
                    position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', gap: '6px',
                  }}>
                    {imageList.map((_, i) => (
                      <div key={i} onClick={() => setCurrentImg(i)} style={{
                        width: i === currentImg ? '22px' : '6px', height: '6px',
                        borderRadius: '3px', cursor: 'pointer',
                        background: i === currentImg ? '#f97316' : 'rgba(255,255,255,0.3)',
                        transition: 'all 0.2s',
                      }} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{ color: '#3f3f46', fontSize: '3rem', textAlign: 'center' }}>
              <div>🎨</div>
              <div style={{ fontSize: '0.85rem', marginTop: '8px', color: '#52525b' }}>Brak zdjęć</div>
            </div>
          )}
        </div>

        {/* ── PRAWA: info + komentarze ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', borderLeft: '1px solid rgba(255,255,255,0.06)',
        }}>

          {/* Header */}
          <div style={{ padding: '22px 24px 14px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <h2 style={{ color: 'white', fontWeight: 700, fontSize: '1.4rem', letterSpacing: '-0.02em', margin: 0, flex: 1 }}>
                {spot.title}
              </h2>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {canDelete && !confirmDelete && (
                  <button onClick={() => setConfirmDelete(true)} style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                    color: '#ef4444', padding: '6px 12px', borderRadius: '8px',
                    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                    fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap',
                  }}>🗑 {isAdmin && !isOwner ? 'Admin: Usuń' : 'Usuń'}</button>
                )}
                <button onClick={onClose} style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#71717a', cursor: 'pointer', borderRadius: '8px',
                  width: '34px', height: '34px', fontSize: '1rem',
                }}>✕</button>
              </div>
            </div>

            {/* Meta tagi */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: '#52525b', fontSize: '0.73rem' }}>
                📌 {spot.location_fuzzed ? `~${spot.fuzz_radius}m` : `${spot.lat?.toFixed(4)}, ${spot.lng?.toFixed(4)}`}
              </span>
              <span style={{ color: spot.is_public ? '#22c55e' : '#f97316', fontSize: '0.73rem' }}>
                {spot.is_public ? '🌍 Public' : '🔒 Private'}
              </span>
              {spot.crew_tags?.length > 0 && (
                <span style={{ color: '#a78bfa', fontSize: '0.73rem' }}>👥 {spot.crew_tags.join(', ')}</span>
              )}
            </div>

            {/* Opis */}
            {spot.description && (
              <p style={{ color: '#a1a1aa', fontSize: '0.87rem', lineHeight: 1.6, marginTop: '10px', marginBottom: 0 }}>
                {spot.description.split(' ').map((word, i) =>
                  word.startsWith('#')
                    ? <span key={i} style={{ color: '#f97316', fontWeight: 600 }}>{word} </span>
                    : word + ' '
                )}
              </p>
            )}

            {/* Confirm delete */}
            {confirmDelete && (
              <div style={{
                marginTop: '10px', padding: '12px', borderRadius: '10px',
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
              }}>
                <p style={{ color: '#f87171', fontSize: '0.83rem', marginBottom: '8px', fontWeight: 600 }}>
                  ⚠️ Usunąć tę pracę? Nie można cofnąć.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setConfirmDelete(false)} style={{
                    flex: 1, padding: '8px', borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)', background: 'none',
                    color: '#a1a1aa', cursor: 'pointer',
                    fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '0.82rem',
                  }}>Anuluj</button>
                  <button onClick={handleDelete} disabled={deleting} style={{
                    flex: 1, padding: '8px', borderRadius: '8px',
                    border: 'none', background: '#ef4444', color: 'white',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '0.82rem',
                    opacity: deleting ? 0.6 : 1,
                  }}>{deleting ? 'Usuwanie...' : '🗑 Tak, usuń'}</button>
                </div>
              </div>
            )}
          </div>

          {/* Komentarze — scrollowalne */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px' }}>
            <p style={{ color: '#3f3f46', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
              Komentarze ({comments.length})
            </p>

            {userRank < 2 && !isAdmin && (
              <div style={{
                marginBottom: '12px', padding: '8px 12px', borderRadius: '8px',
                background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ fontSize: '0.75rem' }}>🔒</span>
                <p style={{ color: '#71717a', fontSize: '0.75rem', margin: 0 }}>
                  Komentarze o <strong style={{ color: '#a78bfa' }}>przypale</strong> widoczne od rangi <strong style={{ color: '#a78bfa' }}>Veteran</strong>
                </p>
              </div>
            )}

            {comments.length === 0 && (
              <p style={{ color: '#3f3f46', fontSize: '0.85rem' }}>Brak komentarzy. Bądź pierwszy!</p>
            )}

            {comments.map(c => {
              const rInfo = { 0: '#71717a', 1: '#38bdf8', 2: '#a78bfa', 3: '#f97316' }
              return (
                <div key={c.id} style={{
                  marginBottom: '10px', padding: '10px 14px',
                  background: c.comment_type === 'hazard'
                    ? 'rgba(239,68,68,0.05)'
                    : c.comment_type === 'tip'
                    ? 'rgba(234,179,8,0.04)'
                    : 'rgba(255,255,255,0.03)',
                  borderRadius: '10px',
                  border: c.comment_type === 'hazard'
                    ? '1px solid rgba(239,68,68,0.15)'
                    : c.comment_type === 'tip'
                    ? '1px solid rgba(234,179,8,0.12)'
                    : '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: rInfo[c.profiles?.rank ?? 0], fontWeight: 600, fontSize: '0.82rem' }}>
                        {c.profiles?.username || 'Anonim'}
                      </span>
                      <CommentTypeBadge type={c.comment_type} />
                    </div>
                    <span style={{ color: '#3f3f46', fontSize: '0.7rem', flexShrink: 0 }}>
                      {new Date(c.created_at).toLocaleDateString('pl-PL')}
                    </span>
                  </div>
                  <p style={{ color: '#d4d4d8', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>{c.content}</p>
                </div>
              )
            })}
          </div>

          {/* Input komentarza */}
          <div style={{ padding: '12px 24px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            {sent ? (
              <div style={{
                background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: '10px', padding: '10px 14px',
                color: '#22c55e', fontSize: '0.85rem', textAlign: 'center',
              }}>✅ Komentarz wysłany — czeka na zatwierdzenie</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Typ komentarza */}
                {availableTypes.length > 1 && (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {availableTypes.map(t => (
                      <button key={t.value} onClick={() => setCommentType(t.value)} style={{
                        padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        fontSize: '0.72rem', fontWeight: 600,
                        fontFamily: 'Space Grotesk, sans-serif',
                        background: commentType === t.value ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.04)',
                        color: commentType === t.value ? '#f97316' : '#71717a',
                        outline: commentType === t.value ? '1px solid rgba(249,115,22,0.4)' : 'none',
                      }}>{t.label}</button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.09)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'white', fontSize: '0.88rem',
                      fontFamily: 'Space Grotesk, sans-serif', outline: 'none',
                    }}
                    placeholder="Napisz komentarz..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendComment()}
                  />
                  <button
                    onClick={handleSendComment}
                    disabled={loading || !newComment.trim()}
                    style={{
                      padding: '10px 18px', borderRadius: '10px',
                      border: 'none', background: '#f97316',
                      color: 'white', fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'Space Grotesk, sans-serif',
                      opacity: !newComment.trim() ? 0.4 : 1,
                    }}
                  >→</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
