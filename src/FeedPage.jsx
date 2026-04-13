import { t } from './i18n'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import SpotModal from './SpotModal'

const RANKS = {
  0: { label: 'Newbie',  color: '#71717a', icon: '👶' },
  1: { label: 'Writer',  color: '#38bdf8', icon: '✏️' },
  2: { label: 'Veteran', color: '#a78bfa', icon: '🎯' },
  3: { label: 'Legend',  color: '#f97316', icon: '👑' },
}

export default function FeedPage() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser]         = useState(null)
  const [currentUserRank, setCurrentUserRank] = useState(0)
  const [isAdmin, setIsAdmin]                 = useState(false)
  const [feed, setFeed]                       = useState([])
  const [following, setFollowing]             = useState([])
  const [suggestions, setSuggestions]         = useState([])
  const [crewMap, setCrewMap]                 = useState({})
  const [loading, setLoading]                 = useState(true)
  const [selectedSpot, setSelectedSpot]       = useState(null)
  const [tab, setTab]                         = useState('feed')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setCurrentUser(u)
      if (u) fetchAll(u.id)
      else setLoading(false)
    })
  }, [])

  async function fetchAll(userId) {
    setLoading(true)
    const [cr, adm, curProf] = await Promise.all([
      supabase.from('crews').select('name, color'),
      supabase.from('admins').select('id').eq('user_id', userId).single(),
      supabase.from('profiles').select('rank').eq('id', userId).single(),
    ])
    if (cr.data) { const map = {}; cr.data.forEach(c => { map[c.name] = c.color }); setCrewMap(map) }
    setIsAdmin(!!adm.data)
    setCurrentUserRank(curProf.data?.rank ?? 0)
    await fetchFollowing(userId)
    setLoading(false)
  }

  async function fetchFollowing(userId) {
    const { data: followData } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
    const ids = (followData || []).map(f => f.following_id)
    setFollowing(ids)
    if (ids.length > 0) {
      const { data: feedData } = await supabase.from('spots').select('*, profiles(username, rank, avatar_url)').in('user_id', ids).eq('is_public', true).in('status', ['approved', 'buffed']).order('created_at', { ascending: false }).limit(50)
      setFeed(feedData || [])
    } else setFeed([])
    const { data: allProfiles } = await supabase.from('profiles').select('id, username, rank, avatar_url').neq('id', userId).not('is_ghost', 'eq', true)
    setSuggestions((allProfiles || []).filter(p => !ids.includes(p.id)).slice(0, 10))
  }

  async function toggleFollow(targetId) {
    if (!currentUser) return
    const isFollowingUser = following.includes(targetId)
    if (isFollowingUser) {
      await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', targetId)
      setFollowing(prev => prev.filter(id => id !== targetId))
      setFeed(prev => prev.filter(s => s.user_id !== targetId))
    } else {
      await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: targetId })
      setFollowing(prev => [...prev, targetId])
      const { data } = await supabase.from('spots').select('*, profiles(username, rank, avatar_url)').eq('user_id', targetId).eq('is_public', true).in('status', ['approved', 'buffed']).order('created_at', { ascending: false }).limit(10)
      if (data) setFeed(prev => [...data, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
    }
    setSuggestions(prev => prev.filter(p => p.id !== targetId))
  }

  function Avatar({ profile, size = 40 }) {
    const rInfo = RANKS[profile?.rank ?? 0] ?? RANKS[0]
    const [imgError, setImgError] = useState(false)
    if (profile?.avatar_url && !imgError) {
      return <img src={profile.avatar_url} alt="" onError={() => setImgError(true)} style={{ width: size, height: size, borderRadius: size * 0.25, objectFit: 'cover', border: `2px solid ${rInfo.color}50`, flexShrink: 0 }} />
    }
    return <div style={{ width: size, height: size, borderRadius: size * 0.25, background: `linear-gradient(135deg, ${rInfo.color}40, ${rInfo.color}15)`, border: `2px solid ${rInfo.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.32, fontWeight: 700, color: rInfo.color, fontFamily: 'Space Grotesk, sans-serif', flexShrink: 0 }}>{(profile?.username || '?').slice(0, 2).toUpperCase()}</div>
  }

  if (loading) return <div style={{ background: '#09090b', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#71717a', fontFamily: 'Space Grotesk, sans-serif' }}>Ładowanie...</p></div>

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', fontFamily: 'Space Grotesk, sans-serif' }}>

      {/* NAVBAR */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(9,9,11,0.93)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'Space Grotesk, sans-serif' }}>{t('map')}</button>
        <h1 style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.05em' }}>CTY-GRID</h1>
        <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'Space Grotesk, sans-serif' }}>👤</button>
      </div>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '20px 14px' }}>

        {/* TABS */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
          {[{ id: 'feed', label: `${t('feedTab')} (${feed.length})` }, { id: 'discover', label: `${t('discoverTab')} (${suggestions.length})` }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '9px', borderRadius: '9px', border: 'none', cursor: 'pointer', background: tab === t.id ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.04)', color: tab === t.id ? '#f97316' : '#71717a', fontWeight: 600, fontSize: '0.85rem', fontFamily: 'Space Grotesk, sans-serif', outline: tab === t.id ? '1px solid rgba(249,115,22,0.35)' : 'none' }}>{t.label}</button>
          ))}
        </div>

        {/* FEED */}
        {tab === 'feed' && (
          <div>
            {feed.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📰</div>
                <p style={{ color: '#52525b', fontSize: '0.88rem', marginBottom: '16px' }}>Obserwuj innych żeby zobaczyć ich prace tutaj</p>
                <button onClick={() => setTab('discover')} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#f97316', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>{t('discoverUsers')}</button>
              </div>
            ) : feed.map(spot => (
              <div key={spot.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', overflow: 'hidden', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px 8px' }}>
                  <Avatar profile={spot.profiles} size={36} />
                  <div style={{ flex: 1 }}>
                    <button onClick={() => navigate(`/profile/${spot.user_id}`)} style={{ background: 'none', border: 'none', color: RANKS[spot.profiles?.rank ?? 0]?.color || '#71717a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', padding: 0, fontFamily: 'Space Grotesk, sans-serif' }}>{spot.profiles?.username || 'Anonim'}</button>
                    <p style={{ color: '#3f3f46', fontSize: '0.7rem', margin: 0 }}>{new Date(spot.created_at).toLocaleString('en-GB')}</p>
                  </div>
                  {spot.status === 'buffed' && <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '9999px', background: 'rgba(113,113,122,0.15)', color: '#71717a' }}>🪣</span>}
                </div>
                {spot.image_url && <img src={spot.image_url} alt={spot.title} onClick={() => setSelectedSpot(spot)} style={{ width: '100%', maxHeight: '380px', objectFit: 'cover', cursor: 'pointer', display: 'block', filter: spot.status === 'buffed' ? 'grayscale(100%) brightness(0.6)' : 'none' }} />}
                <div style={{ padding: '10px 14px' }}>
                  <p style={{ color: spot.status === 'buffed' ? '#52525b' : 'white', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 5px', cursor: 'pointer' }} onClick={() => setSelectedSpot(spot)}>{spot.title}</p>
                  {spot.description && <p style={{ color: '#71717a', fontSize: '0.8rem', margin: '0 0 7px', lineHeight: 1.5 }}>{spot.description.split(' ').map((w, i) => w.startsWith('#') ? <span key={i} style={{ color: '#f97316' }}>{w} </span> : w + ' ')}</p>}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {(spot.crew_tags || []).map(crew => <span key={crew} style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '9999px', background: crewMap[crew] || '#f97316', color: '#000' }}>{crew}</span>)}
                  </div>
                  <button onClick={() => setSelectedSpot(spot)} style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', padding: 0 }}>{t('commentsLink')}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DISCOVER */}
        {tab === 'discover' && (
          <div>
            <p style={{ color: '#52525b', fontSize: '0.78rem', marginBottom: '14px' }}>Obserwujesz {following.length} {following.length === 1 ? 'osobę' : 'osób'}</p>
            {suggestions.length === 0 ? (
              <p style={{ color: '#52525b', textAlign: 'center', padding: '40px' }}>Obserwujesz wszystkich! 🎉</p>
            ) : suggestions.map(user => {
              const rInfo = RANKS[user.rank ?? 0] ?? RANKS[0]
              const isFollowingUser = following.includes(user.id)
              return (
                <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', marginBottom: '7px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div onClick={() => navigate(`/profile/${user.id}`)} style={{ cursor: 'pointer', width: '42px', height: '42px', borderRadius: '11px', background: `linear-gradient(135deg, ${rInfo.color}40, ${rInfo.color}15)`, border: `2px solid ${rInfo.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, color: rInfo.color, fontFamily: 'Space Grotesk, sans-serif', flexShrink: 0 }}>
                    {user.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <button onClick={() => navigate(`/profile/${user.id}`)} style={{ background: 'none', border: 'none', color: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', padding: 0, fontFamily: 'Space Grotesk, sans-serif' }}>{user.username}</button>
                    <span style={{ marginLeft: '7px', padding: '1px 6px', borderRadius: '9999px', fontSize: '0.63rem', fontWeight: 700, background: `${rInfo.color}18`, color: rInfo.color }}>{rInfo.label}</span>
                  </div>
                  <button onClick={() => toggleFollow(user.id)} style={{ padding: '7px 14px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif', background: isFollowingUser ? 'rgba(255,255,255,0.08)' : '#f97316', color: isFollowingUser ? '#71717a' : 'white', whiteSpace: 'nowrap' }}>
                    {isFollowingUser ? t('unfollow') : t('follow')}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedSpot && (
        <SpotModal spot={selectedSpot} userId={currentUser?.id} userRank={currentUserRank} isAdmin={isAdmin} onClose={() => setSelectedSpot(null)}
          onDeleted={() => { setSelectedSpot(null); if (currentUser) fetchAll(currentUser.id) }}
          onRefresh={() => { if (currentUser) fetchAll(currentUser.id) }}
        />
      )}
    </div>
  )
}
