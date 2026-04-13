import { t } from './i18n'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import SpotModal from './SpotModal'
import NuclearButton from './NuclearButton'

const RANKS = {
  0: { label: 'Newbie',  color: '#71717a', icon: '👶' },
  1: { label: 'Writer',  color: '#38bdf8', icon: '✏️' },
  2: { label: 'Veteran', color: '#a78bfa', icon: '🎯' },
  3: { label: 'Legend',  color: '#f97316', icon: '👑' },
}

function getInitials(username) {
  if (!username) return '?'
  return username.slice(0, 2).toUpperCase()
}

function Avatar({ profile, size = 64, rankColor = '#71717a', onClick }) {
  const [imgError, setImgError] = useState(false)
  const style = { width: size, height: size, borderRadius: size * 0.22, border: `2px solid ${rankColor}50`, flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }
  if (profile?.avatar_url && !imgError) {
    return <img src={profile.avatar_url} alt="" onError={() => setImgError(true)} onClick={onClick} style={{ ...style, objectFit: 'cover', display: 'block' }} />
  }
  return (
    <div onClick={onClick} style={{ ...style, background: `linear-gradient(135deg, ${rankColor}40, ${rankColor}15)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.32, fontWeight: 700, color: rankColor, fontFamily: 'Space Grotesk, sans-serif' }}>
      {getInitials(profile?.username)}
    </div>
  )
}

function generateCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

export default function ProfilePage() {
  const { userId: paramUserId } = useParams()
  const navigate = useNavigate()

  const [currentUser, setCurrentUser]         = useState(null)
  const [currentUserRank, setCurrentUserRank] = useState(0)
  const [isAdmin, setIsAdmin]                 = useState(false)
  const [profile, setProfile]                 = useState(null)
  const [spots, setSpots]                     = useState([])
  const [comments, setComments]               = useState([])
  const [crewMap, setCrewMap]                 = useState({})
  const [loading, setLoading]                 = useState(true)
  const [tab, setTab]                         = useState('gallery')
  const [selectedSpot, setSelectedSpot]       = useState(null)
  const [leaderboard, setLeaderboard]         = useState([])
  const [lbLoading, setLbLoading]             = useState(false)
  const [activeCrew, setActiveCrew]           = useState(null)
  const [showBuffed, setShowBuffed]           = useState(false)
  const [showPrivate, setShowPrivate]         = useState(false)
  const [editMode, setEditMode]               = useState(false)
  const [editUsername, setEditUsername]       = useState('')
  const [editDiscord, setEditDiscord]         = useState('')
  const [editBio, setEditBio]                 = useState('')
  const [saving, setSaving]                   = useState(false)
  const [saveError, setSaveError]             = useState('')
  const [avatarPreview, setAvatarPreview]     = useState(null)
  const [avatarFile, setAvatarFile]           = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showPwForm, setShowPwForm]           = useState(false)
  const [newPw, setNewPw]                     = useState('')
  const [confirmPw, setConfirmPw]             = useState('')
  const [pwError, setPwError]                 = useState('')
  const [pwSuccess, setPwSuccess]             = useState(false)
  const [changingPw, setChangingPw]           = useState(false)
  const [togglingGhost, setTogglingGhost]     = useState(false)
  const [isFollowing, setIsFollowing]         = useState(false)
  const [followersCount, setFollowersCount]   = useState(0)
  const [followingCount, setFollowingCount]   = useState(0)
  const [togglingFollow, setTogglingFollow]   = useState(false)
  const [inviteLink, setInviteLink]           = useState('')
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [inviteCopied, setInviteCopied]       = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setCurrentUser(u)
      const targetId = paramUserId || u?.id
      if (targetId) fetchAll(targetId, u?.id)
      else setLoading(false)
    })
  }, [paramUserId])

  useEffect(() => {
    if (tab === 'leaderboard' && leaderboard.length === 0) fetchLeaderboard()
  }, [tab])

  async function fetchAll(userId, currentUserId) {
    setLoading(true)
    const [p, s, c, cr, adm, curProf] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('spots').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('comments').select('*, spots(title)').eq('user_id', userId).eq('status', 'approved').is('parent_id', null).order('created_at', { ascending: false }),
      supabase.from('crews').select('name, color'),
      currentUserId ? supabase.from('admins').select('id').eq('user_id', currentUserId).single() : Promise.resolve({ data: null }),
      currentUserId ? supabase.from('profiles').select('rank').eq('id', currentUserId).single() : Promise.resolve({ data: null }),
    ])
    setProfile(p.data); setSpots(s.data || []); setComments(c.data || [])
    if (cr.data) { const map = {}; cr.data.forEach(c => { map[c.name] = c.color }); setCrewMap(map) }
    setIsAdmin(!!adm.data); setCurrentUserRank(curProf.data?.rank ?? 0)
    const [followers, following, myFollow] = await Promise.all([
      supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', userId),
      supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', userId),
      currentUserId && currentUserId !== userId ? supabase.from('follows').select('id').eq('follower_id', currentUserId).eq('following_id', userId).single() : Promise.resolve({ data: null }),
    ])
    setFollowersCount(followers.count || 0); setFollowingCount(following.count || 0); setIsFollowing(!!myFollow.data)
    setLoading(false)
  }

  async function fetchLeaderboard() {
    setLbLoading(true)
    const [{ data: profiles }, { data: allSpots }] = await Promise.all([
      supabase.from('profiles').select('id, username, rank, discord, avatar_url, is_ghost'),
      supabase.from('spots').select('user_id, status, crew_tags'),
    ])
    if (!profiles || !allSpots) { setLbLoading(false); return }
    const rankBonus = [0, 50, 150, 300]
    const lb = profiles.filter(p => !p.is_ghost).map(p => {
      const userSpots = allSpots.filter(s => s.user_id === p.id)
      const active = userSpots.filter(s => s.status !== 'buffed')
      const buffed = userSpots.filter(s => s.status === 'buffed')
      const crews = [...new Set(userSpots.flatMap(s => s.crew_tags || []))]
      const score = active.length * 10 + buffed.length * 2 + (rankBonus[p.rank ?? 0] || 0)
      return { ...p, totalSpots: userSpots.length, activeSpots: active.length, buffedSpots: buffed.length, crews, score }
    }).sort((a, b) => b.score - a.score)
    setLeaderboard(lb); setLbLoading(false)
  }

  async function toggleFollow() {
    if (!currentUser || !profile) return
    setTogglingFollow(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', profile.id)
      setIsFollowing(false); setFollowersCount(c => c - 1)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: profile.id })
      setIsFollowing(true); setFollowersCount(c => c + 1)
    }
    setTogglingFollow(false)
  }

  async function generateInvite() {
    if (!currentUser) return
    setGeneratingInvite(true)
    const code = generateCode()
    await supabase.from('invites').insert({ code, created_by: currentUser.id })
    setInviteLink(`${window.location.origin}/invite/${code}`)
    setGeneratingInvite(false)
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteLink)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2500)
  }

  async function toggleGhost() {
    setTogglingGhost(true)
    const newVal = !profile.is_ghost
    await supabase.from('profiles').update({ is_ghost: newVal }).eq('id', profile.id)
    setProfile(p => ({ ...p, is_ghost: newVal }))
    setTogglingGhost(false)
  }

  async function handleAvatarSelect(e) {
    const file = e.target.files[0]; if (!file) return
    setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleAvatarUpload() {
    if (!avatarFile) return
    setUploadingAvatar(true)
    const ext = avatarFile.name.split('.').pop()
    const fileName = `avatar_${profile.id}_${Date.now()}.${ext}`
    if (profile.avatar_url) { const oldPath = profile.avatar_url.split('/avatars/')[1]; if (oldPath) await supabase.storage.from('avatars').remove([oldPath]) }
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(fileName, avatarFile, { upsert: true })
    if (uploadErr) { setUploadingAvatar(false); return }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)
    await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', profile.id)
    setProfile(p => ({ ...p, avatar_url: urlData.publicUrl }))
    setAvatarFile(null); setAvatarPreview(null); setUploadingAvatar(false)
  }

  async function handleRemoveAvatar() {
    if (!profile.avatar_url) return
    const oldPath = profile.avatar_url.split('/avatars/')[1]
    if (oldPath) await supabase.storage.from('avatars').remove([oldPath])
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
    setProfile(p => ({ ...p, avatar_url: null })); setAvatarFile(null); setAvatarPreview(null)
  }

  async function handleSaveProfile() {
    setSaving(true); setSaveError('')
    if (editUsername !== profile.username) {
      const { data: existing } = await supabase.from('profiles').select('id').eq('username', editUsername).single()
      if (existing) { setSaveError(t('usernameTakenErr')); setSaving(false); return }
    }
    const { error } = await supabase.from('profiles').update({ username: editUsername.trim(), discord: editDiscord.trim() || null, bio: editBio.trim() || null }).eq('id', profile.id)
    if (error) { setSaveError(error.message); setSaving(false); return }
    setProfile(p => ({ ...p, username: editUsername, discord: editDiscord, bio: editBio }))
    setEditMode(false); setSaving(false)
  }

  async function handleChangePassword() {
    setPwError(''); setPwSuccess(false)
    if (newPw.length < 6) { setPwError(t('passwordTooShort')); return }
    if (newPw !== confirmPw) { setPwError(t('passwordMismatch')); return }
    setChangingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwError(error.message); setChangingPw(false); return }
    setPwSuccess(true); setNewPw(''); setConfirmPw(''); setChangingPw(false)
    setTimeout(() => { setPwSuccess(false); setShowPwForm(false) }, 2500)
  }

  const isOwnProfile = currentUser?.id === profile?.id
  const rank = profile?.rank ?? 0
  const rankInfo = RANKS[rank] ?? RANKS[0]
  const publicSpots = spots.filter(s => s.is_public)
  const buffedSpots = spots.filter(s => s.status === 'buffed')
  const allCrews = [...new Set(spots.flatMap(s => s.crew_tags || []))]
  const gallerySource = useMemo(() => spots.filter(s => isOwnProfile || s.is_public), [spots, isOwnProfile])
  const filteredGallery = useMemo(() => gallerySource.filter(spot => {
    if (!showBuffed && spot.status === 'buffed') return false
    if (!showPrivate && !spot.is_public) return false
    if (activeCrew && !(spot.crew_tags || []).includes(activeCrew)) return false
    return true
  }), [gallerySource, activeCrew, showBuffed, showPrivate])
  const activity = [...spots.map(s => ({ type: 'spot', date: s.created_at, data: s })), ...comments.map(c => ({ type: 'comment', date: c.created_at, data: c }))].sort((a, b) => new Date(b.date) - new Date(a.date))

  const inp = { width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '0.9rem', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }

  if (loading) return <div style={{ background: '#09090b', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#71717a', fontFamily: 'Space Grotesk, sans-serif' }}>Ładowanie...</p></div>
  if (!profile) return <div style={{ background: '#09090b', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#71717a', fontFamily: 'Space Grotesk, sans-serif' }}>Nie znaleziono profilu</p></div>

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', fontFamily: 'Space Grotesk, sans-serif' }}>
      <style>{`
        @media (max-width: 768px) {
          .profile-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .profile-header-inner { flex-direction: column !important; align-items: flex-start !important; }
          .profile-gallery-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .profile-tabs { overflow-x: auto; }
          .profile-tabs button { white-space: nowrap; }
        }
      `}</style>

      {/* NAVBAR */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(9,9,11,0.93)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'Space Grotesk, sans-serif' }}>{t('map')}</button>
        <h1 style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.05em' }}>CTY-GRID</h1>
        <button onClick={() => navigate('/feed')} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'Space Grotesk, sans-serif' }}>📰</button>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 14px' }}>

        {/* PROFIL HEADER */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '20px', padding: '20px', marginBottom: '18px' }}>
          {!editMode ? (
            <div>
              <div className="profile-header-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ position: 'relative' }}>
                    <Avatar profile={profile} size={66} rankColor={rankInfo.color} />
                    {isOwnProfile && (
                      <label style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: '#f97316', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.6rem', border: '2px solid #09090b' }}>
                        📷<input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarSelect} />
                      </label>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                      <h2 style={{ color: 'white', fontWeight: 700, fontSize: '1.3rem', letterSpacing: '-0.02em', margin: 0 }}>{profile.username}</h2>
                      {profile.is_ghost && <span style={{ padding: '2px 7px', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(113,113,122,0.15)', color: '#71717a', border: '1px solid rgba(113,113,122,0.25)' }}>👻</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '7px', alignItems: 'center', marginTop: '5px', flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 9px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, background: `${rankInfo.color}18`, color: rankInfo.color, border: `1px solid ${rankInfo.color}40` }}>{rankInfo.icon} {rankInfo.label}</span>
                      {profile.discord && <span style={{ color: '#71717a', fontSize: '0.75rem' }}>🎮 {profile.discord}</span>}
                    </div>
                    {profile.bio && <p style={{ color: '#a1a1aa', fontSize: '0.83rem', marginTop: '8px', lineHeight: 1.5, maxWidth: '460px' }}>{profile.bio}</p>}
                    <div style={{ display: 'flex', gap: '14px', marginTop: '8px' }}>
                      <span style={{ color: '#71717a', fontSize: '0.75rem' }}><strong style={{ color: 'white' }}>{followersCount}</strong> obserwujących</span>
                      <span style={{ color: '#71717a', fontSize: '0.75rem' }}><strong style={{ color: 'white' }}>{followingCount}</strong> obserwuje</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '7px', flexShrink: 0 }}>
                  {!isOwnProfile && currentUser && (
                    <button onClick={toggleFollow} disabled={togglingFollow} style={{ padding: '7px 14px', borderRadius: '9px', border: 'none', background: isFollowing ? 'rgba(255,255,255,0.08)' : '#f97316', color: isFollowing ? '#71717a' : 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', opacity: togglingFollow ? 0.6 : 1 }}>
                      {isFollowing ? t('unfollow') : t('follow')}
                    </button>
                  )}
                  {isOwnProfile && <button onClick={() => { setEditUsername(profile.username); setEditDiscord(profile.discord || ''); setEditBio(profile.bio || ''); setEditMode(true) }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1aa', padding: '7px 12px', borderRadius: '9px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif' }}>{t('editBtn')}</button>}
                </div>
              </div>

              {avatarPreview && (
                <div style={{ marginTop: '12px', padding: '12px', borderRadius: '12px', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={avatarPreview} alt="" style={{ width: '46px', height: '46px', borderRadius: '10px', objectFit: 'cover' }} />
                  <p style={{ color: '#a1a1aa', fontSize: '0.8rem', margin: 0, flex: 1 }}>Nowe zdjęcie profilowe</p>
                  <button onClick={handleAvatarUpload} disabled={uploadingAvatar} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: '#f97316', color: 'white', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>{uploadingAvatar ? '...' : t('saveAvatar')}</button>
                  <button onClick={() => { setAvatarFile(null); setAvatarPreview(null) }} style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.06)', color: '#71717a', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                </div>
              )}

              {allCrews.length > 0 && <div style={{ display: 'flex', gap: '5px', marginTop: '12px', flexWrap: 'wrap' }}>{allCrews.map(crew => <span key={crew} style={{ padding: '3px 12px', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, background: crewMap[crew] || '#f97316', color: '#000' }}>{crew}</span>)}</div>}

              <div className="profile-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '14px' }}>
                {[{ label: t('spotsCount'), value: spots.length, color: '#f97316' }, { label: t('publicCount'), value: publicSpots.length, color: '#22c55e' }, { label: t('buffedCount'), value: buffedSpots.length, color: '#71717a' }, { label: t('commentsCount'), value: comments.length, color: '#38bdf8' }].map(stat => (
                  <div key={stat.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ color: stat.color, fontWeight: 700, fontSize: '1.4rem', margin: 0 }}>{stat.value}</p>
                    <p style={{ color: '#52525b', fontSize: '0.68rem', margin: '2px 0 0', fontWeight: 600 }}>{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <Avatar profile={{ ...profile, avatar_url: avatarPreview || profile.avatar_url }} size={54} rankColor={rankInfo.color} />
                <div>
                  <p style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Edycja profilu</p>
                  <div style={{ display: 'flex', gap: '7px', marginTop: '5px', flexWrap: 'wrap' }}>
                    <label style={{ padding: '4px 10px', borderRadius: '8px', background: 'rgba(249,115,22,0.12)', color: '#f97316', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(249,115,22,0.25)' }}>
                      📷 Zmień<input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarSelect} />
                    </label>
                    {profile.avatar_url && <button onClick={handleRemoveAvatar} style={{ padding: '4px 10px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.22)', fontFamily: 'Space Grotesk, sans-serif' }}>🗑</button>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                <input style={inp} placeholder={t('usernamePlaceholder')} value={editUsername} onChange={e => setEditUsername(e.target.value)} />
                <input style={inp} placeholder={t('discordPlaceholder')} value={editDiscord} onChange={e => setEditDiscord(e.target.value)} />
                <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical' }} placeholder={t('bioPlaceholder')} value={editBio} onChange={e => setEditBio(e.target.value)} />
                {saveError && <p style={{ color: '#f87171', fontSize: '0.8rem' }}>{saveError}</p>}
                <div style={{ display: 'flex', gap: '9px' }}>
                  <button onClick={() => setEditMode(false)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: '#71717a', cursor: 'pointer', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif' }}>Anuluj</button>
                  <button onClick={handleSaveProfile} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: '10px', border: 'none', background: '#f97316', color: 'white', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Space Grotesk, sans-serif', opacity: saving ? 0.7 : 1 }}>{saving ? '...' : t('saveProfile')}</button>
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <button onClick={() => setShowPwForm(s => !s)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', padding: 0, fontWeight: 600 }}>🔑 {showPwForm ? t('hidePassword') : t('changePassword')}</button>
                  {showPwForm && (
                    <div style={{ marginTop: '9px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      <input style={inp} type="password" placeholder={t('newPasswordPlaceholder')} value={newPw} onChange={e => setNewPw(e.target.value)} />
                      <input style={inp} type="password" placeholder={t('confirmPasswordPlaceholder')} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                      {pwError && <p style={{ color: '#f87171', fontSize: '0.78rem' }}>{pwError}</p>}
                      {pwSuccess && <p style={{ color: '#22c55e', fontSize: '0.78rem' }}>✅ Hasło zmienione!</p>}
                      <button onClick={handleChangePassword} disabled={changingPw} style={{ padding: '9px', borderRadius: '9px', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'white', fontWeight: 600, cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.83rem' }}>{changingPw ? '...' : t('changePasswordBtn')}</button>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <p style={{ color: '#71717a', fontSize: '0.8rem', fontWeight: 600, marginBottom: '7px' }}>🔗 Zaproś znajomego</p>
                  {!inviteLink ? (
                    <button onClick={generateInvite} disabled={generatingInvite} style={{ padding: '8px 14px', borderRadius: '9px', border: 'none', background: 'rgba(249,115,22,0.12)', color: '#f97316', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', outline: '1px solid rgba(249,115,22,0.25)', opacity: generatingInvite ? 0.6 : 1 }}>
                      {generatingInvite ? '...' : t('generateInvite')}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <input readOnly value={inviteLink} style={{ ...inp, fontSize: '0.72rem', color: '#a1a1aa' }} />
                      <button onClick={copyInvite} style={{ padding: '10px 12px', borderRadius: '9px', border: 'none', background: inviteCopied ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.12)', color: inviteCopied ? '#22c55e' : '#f97316', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif', flexShrink: 0, outline: '1px solid rgba(249,115,22,0.25)' }}>
                        {inviteCopied ? '✅' : '📋'}
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', background: profile.is_ghost ? 'rgba(113,113,122,0.1)' : 'rgba(255,255,255,0.02)', border: profile.is_ghost ? '1px solid rgba(113,113,122,0.25)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <p style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>👻 Tryb Ghost {profile.is_ghost && <span style={{ color: '#71717a', fontSize: '0.72rem', fontWeight: 400 }}>— aktywny</span>}</p>
                      <p style={{ color: '#52525b', fontSize: '0.7rem', marginTop: '2px', marginBottom: 0 }}>Ukrywa z rankingu</p>
                    </div>
                    <div onClick={togglingGhost ? undefined : toggleGhost} style={{ width: '44px', height: '24px', borderRadius: '9999px', background: profile.is_ghost ? '#71717a' : '#27272a', cursor: togglingGhost ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '3px', left: profile.is_ghost ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid rgba(239,68,68,0.1)', paddingTop: '12px' }}>
                  <NuclearButton userId={profile.id} username={profile.username} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* TABS */}
        <div className="profile-tabs" style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {[{ id: 'gallery', label: `${t('gallery')} (${gallerySource.length})` }, { id: 'activity', label: `${t('activity')} (${activity.length})` }, { id: 'leaderboard', label: t('leaderboard') }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 14px', borderRadius: '9px', border: 'none', cursor: 'pointer', background: tab === t.id ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.04)', color: tab === t.id ? '#f97316' : '#71717a', fontWeight: 600, fontSize: '0.82rem', fontFamily: 'Space Grotesk, sans-serif', outline: tab === t.id ? '1px solid rgba(249,115,22,0.35)' : 'none', whiteSpace: 'nowrap' }}>{t.label}</button>
          ))}
        </div>

        {/* GALERIA */}
        {tab === 'gallery' && (
          <div>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setActiveCrew(null)} style={{ padding: '4px 12px', borderRadius: '9999px', border: 'none', cursor: 'pointer', background: activeCrew === null ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', color: activeCrew === null ? 'white' : '#52525b', fontWeight: 600, fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif', outline: activeCrew === null ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>Wszystkie</button>
              {allCrews.map(crew => { const color = crewMap[crew] || '#f97316'; const active = activeCrew === crew; return <button key={crew} onClick={() => setActiveCrew(active ? null : crew)} style={{ padding: '4px 12px', borderRadius: '9999px', border: 'none', cursor: 'pointer', background: active ? color : 'rgba(255,255,255,0.04)', color: active ? '#000' : color, fontWeight: 700, fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif', outline: active ? 'none' : `1px solid ${color}50` }}>{crew}</button> })}
              <button onClick={() => setShowBuffed(b => !b)} style={{ padding: '4px 12px', borderRadius: '9999px', border: 'none', cursor: 'pointer', background: showBuffed ? 'rgba(113,113,122,0.15)' : 'rgba(255,255,255,0.04)', color: showBuffed ? '#a1a1aa' : '#52525b', fontWeight: 600, fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif' }}>🪣</button>
              {isOwnProfile && <button onClick={() => setShowPrivate(b => !b)} style={{ padding: '4px 12px', borderRadius: '9999px', border: 'none', cursor: 'pointer', background: showPrivate ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.04)', color: showPrivate ? '#f97316' : '#52525b', fontWeight: 600, fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif' }}>🔒</button>}
              <span style={{ color: '#3f3f46', fontSize: '0.7rem' }}>{filteredGallery.length} prac</span>
            </div>
            {filteredGallery.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: '#3f3f46' }}><div style={{ fontSize: '2rem', marginBottom: '10px' }}>🎨</div>Brak prac</div>
            ) : (
              <div className="profile-gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '9px' }}>
                {filteredGallery.map(spot => (
                  <div key={spot.id} onClick={() => setSelectedSpot(spot)} style={{ borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: spot.status === 'buffed' ? '1px solid rgba(113,113,122,0.25)' : '1px solid rgba(255,255,255,0.07)', position: 'relative' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.4)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    {spot.image_url ? <img src={spot.image_url} alt={spot.title} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', filter: spot.status === 'buffed' ? 'grayscale(100%) brightness(0.6)' : 'none' }} /> : <div style={{ aspectRatio: '1', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🎨</div>}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)', pointerEvents: 'none' }} />
                    <div style={{ padding: '8px 10px' }}>
                      <p style={{ color: spot.status === 'buffed' ? '#52525b' : 'white', fontWeight: 600, fontSize: '0.82rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spot.title}</p>
                      <p style={{ color: '#3f3f46', fontSize: '0.65rem', marginTop: '3px', marginBottom: 0 }}>{new Date(spot.created_at).toLocaleDateString('en-GB')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AKTYWNOŚĆ */}
        {tab === 'activity' && (
          <div>
            {activity.length === 0 && <p style={{ color: '#52525b', textAlign: 'center', padding: '40px' }}>Brak aktywności</p>}
            {activity.map((item, i) => (
              <div key={i} onClick={() => item.type === 'spot' && setSelectedSpot(item.data)} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: item.type === 'spot' ? 'pointer' : 'default' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', background: item.type === 'spot' ? 'rgba(249,115,22,0.12)' : 'rgba(56,189,248,0.1)' }}>
                  {item.type === 'spot' ? '📍' : '💬'}
                </div>
                <div style={{ flex: 1 }}>
                  {item.type === 'spot' ? (
                    <p style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>Dodano: <span style={{ color: '#f97316' }}>{item.data.title}</span></p>
                  ) : (
                    <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: 0 }}>Komentarz do <span style={{ color: '#38bdf8' }}>{item.data.spots?.title || t('work')}</span></p>
                  )}
                  <p style={{ color: '#3f3f46', fontSize: '0.68rem', marginTop: '3px' }}>{new Date(item.date).toLocaleString('en-GB')}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LEADERBOARD */}
        {tab === 'leaderboard' && (
          <div>
            <p style={{ color: '#52525b', fontSize: '0.75rem', marginBottom: '14px' }}>10 pkt/praca · 2 pkt/buffed · bonus za rangę · 👻 Ghost ukryty</p>
            {lbLoading ? <p style={{ color: '#52525b', textAlign: 'center', padding: '40px' }}>Ładowanie...</p> : leaderboard.map((user, i) => {
              const rInfo = RANKS[user.rank ?? 0] ?? RANKS[0]
              const isMe = user.id === currentUser?.id
              const isThis = user.id === profile?.id
              const medals = ['🥇', '🥈', '🥉']
              return (
                <div key={user.id} onClick={() => navigate(`/profile/${user.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '6px', borderRadius: '12px', background: isThis ? `${rInfo.color}10` : isMe ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.03)', border: isThis ? `1px solid ${rInfo.color}35` : isMe ? '1px solid rgba(249,115,22,0.2)' : '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                  <div style={{ width: '28px', textAlign: 'center', flexShrink: 0 }}>
                    {i < 3 ? <span style={{ fontSize: '1.2rem' }}>{medals[i]}</span> : <span style={{ color: '#52525b', fontWeight: 700, fontSize: '0.85rem' }}>#{i + 1}</span>}
                  </div>
                  <Avatar profile={user} size={36} rankColor={rInfo.color} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'white', fontWeight: 700, fontSize: '0.88rem' }}>{user.username}</span>
                      <span style={{ padding: '1px 6px', borderRadius: '9999px', fontSize: '0.63rem', fontWeight: 700, background: `${rInfo.color}18`, color: rInfo.color }}>{rInfo.label}</span>
                    </div>
                    <span style={{ color: '#52525b', fontSize: '0.68rem' }}>📍 {user.activeSpots}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: i === 0 ? '#facc15' : i === 1 ? '#a1a1aa' : i === 2 ? '#cd7c2f' : '#52525b', fontWeight: 700, fontSize: '1rem', margin: 0 }}>{user.score}</p>
                    <p style={{ color: '#3f3f46', fontSize: '0.63rem', margin: 0 }}>pkt</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedSpot && (
        <SpotModal spot={selectedSpot} userId={currentUser?.id} userRank={currentUserRank} isAdmin={isAdmin} onClose={() => setSelectedSpot(null)}
          onDeleted={() => { setSelectedSpot(null); const id = paramUserId || currentUser?.id; if (id) fetchAll(id, currentUser?.id) }}
          onRefresh={() => { const id = paramUserId || currentUser?.id; if (id) fetchAll(id, currentUser?.id) }}
        />
      )}
    </div>
  )
}
