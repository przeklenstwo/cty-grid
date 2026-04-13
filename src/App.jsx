import SpotModal from './SpotModal'
import { useState, useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, useMapEvent } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useNavigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import 'leaflet.heat'
import { supabase } from './supabaseClient'
import Auth from './auth'
import AddSpotModal from './AddSpotModal'
import AdminPanel from './AdminPanel'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export const RANKS = {
  0: { label: 'Newbie',  color: '#71717a', icon: '👶', spotsNeeded: 0 },
  1: { label: 'Writer',  color: '#38bdf8', icon: '✏️', spotsNeeded: 30 },
  2: { label: 'Veteran', color: '#a78bfa', icon: '🎯', spotsNeeded: 100 },
  3: { label: 'Legend',  color: '#f97316', icon: '👑', spotsNeeded: 230 },
}

const DATE_FILTERS = [
  { label: 'Wszystkie', days: null },
  { label: '7 dni',     days: 7 },
  { label: '30 dni',    days: 30 },
  { label: '90 dni',    days: 90 },
]

const MAP_STORAGE_KEY = 'cty-grid-map-view'

function makePin(color, buffed = false, highlight = false) {
  const c = buffed ? '#4a4a4a' : color
  const opacity = buffed ? 0.55 : 1
  const glowFilter = highlight ? `filter: drop-shadow(0 0 6px ${color});` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" style="${glowFilter}">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z"
      fill="${c}" opacity="${opacity}"/>
    <circle cx="14" cy="14" r="5.5" fill="rgba(0,0,0,0.35)"/>
    <circle cx="14" cy="14" r="4" fill="white" opacity="${buffed ? 0.4 : 0.9}"/>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -38] })
}

function makeMovingPin(vehicleType) {
  const icons = { train: '🚂', metro: '🚇', tram: '🚋', bus: '🚌', other: '🚛' }
  const icon = icons[vehicleType] || '🚂'
  return L.divIcon({
    html: `<div style="font-size:1.4rem;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.8));line-height:1">${icon}</div>`,
    className: '', iconSize: [28, 28], iconAnchor: [14, 14],
  })
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 36 : count < 50 ? 42 : 48
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(249,115,22,0.85);backdrop-filter:blur(4px);border:2px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:${count < 10 ? '0.85' : '0.78'}rem;color:white;box-shadow:0 4px 14px rgba(249,115,22,0.4);">${count}</div>`,
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  })
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => { if (e.latlng?.lat !== undefined) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }) } })
  return null
}

function FlyToResult({ spot }) {
  const map = useMap()
  useEffect(() => { if (spot) map.flyTo([spot.lat, spot.lng], 16, { duration: 0.8 }) }, [spot])
  return null
}

function MapViewSaver() {
  useMapEvent('moveend', (e) => {
    const map = e.target
    const center = map.getCenter()
    try { localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify({ lat: center.lat, lng: center.lng, zoom: map.getZoom() })) } catch {}
  })
  return null
}

function HeatmapLayer({ spots }) {
  const map = useMap()
  const heatRef = useRef(null)
  useEffect(() => {
    if (!spots.length) return
    if (heatRef.current) map.removeLayer(heatRef.current)
    heatRef.current = L.heatLayer(spots.map(s => [s.lat, s.lng, 0.8]), {
      radius: 30, blur: 20, maxZoom: 17,
      gradient: { 0.2: '#1e3a5f', 0.4: '#0ea5e9', 0.6: '#f97316', 0.8: '#ef4444', 1.0: '#ffffff' },
    }).addTo(map)
    return () => { if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null } }
  }, [spots, map])
  return null
}

function getSavedView() {
  try { const s = localStorage.getItem(MAP_STORAGE_KEY); if (s) return JSON.parse(s) } catch {}
  return null
}

export default function App() {
  const navigate = useNavigate()

  const [user, setUser]                   = useState(null)
  const [profile, setProfile]             = useState(null)
  const [loading, setLoading]             = useState(true)
  const [spots, setSpots]                 = useState([])
  const [crewMap, setCrewMap]             = useState({})
  const [activeCrew, setActiveCrew]       = useState(null)
  const [showBuffed, setShowBuffed]       = useState(true)
  const [dateFilter, setDateFilter]       = useState(null)
  const [showHeatmap, setShowHeatmap]     = useState(false)
  const [pendingCoords, setPendingCoords] = useState(null)
  const [selectedSpot, setSelectedSpot]   = useState(null)
  const [showAdmin, setShowAdmin]         = useState(false)
  const [isAdmin, setIsAdmin]             = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchOpen, setSearchOpen]       = useState(false)
  const [menuOpen, setMenuOpen]           = useState(false)
  const searchRef                         = useRef(null)

  const savedView = useMemo(() => getSavedView(), [])
  const mapCenter = savedView ? [savedView.lat, savedView.lng] : [52.2297, 21.0122]
  const mapZoom   = savedView ? savedView.zoom : 13

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else { setProfile(null); setIsAdmin(false) }
    })
    fetchSpots(); fetchCrews()
    return () => listener.subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    const { data: adminData } = await supabase.from('admins').select('id').eq('user_id', userId).single()
    setIsAdmin(!!adminData)
  }

  async function fetchCrews() {
    const { data } = await supabase.from('crews').select('name, color')
    if (data) { const map = {}; data.forEach(c => { map[c.name] = c.color }); setCrewMap(map) }
  }

  async function fetchSpots() {
    const { data } = await supabase.from('spots').select('*').eq('is_public', true).in('status', ['approved', 'buffed'])
    setSpots(data || [])
  }

  async function handleRefresh() {
    await fetchSpots(); await fetchCrews()
    if (user) fetchProfile(user.id)
  }

  async function handleLogout() { await supabase.auth.signOut(); setProfile(null); setIsAdmin(false) }

  const allCrews = useMemo(() => {
    const set = new Set()
    spots.forEach(s => (s.crew_tags || []).forEach(c => set.add(c)))
    return [...set].sort()
  }, [spots])

  const filteredSpots = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const cutoff = dateFilter ? new Date(Date.now() - dateFilter * 24 * 60 * 60 * 1000) : null
    return spots.filter(spot => {
      if (!showBuffed && spot.status === 'buffed') return false
      if (activeCrew && !(spot.crew_tags || []).includes(activeCrew)) return false
      if (cutoff && new Date(spot.created_at) < cutoff) return false
      if (q) {
        const inTitle = spot.title?.toLowerCase().includes(q)
        const inDesc  = spot.description?.toLowerCase().includes(q)
        const inCrew  = (spot.crew_tags || []).some(t => t.toLowerCase().includes(q))
        if (!inTitle && !inDesc && !inCrew) return false
      }
      return true
    })
  }, [spots, activeCrew, showBuffed, searchQuery, dateFilter])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    return filteredSpots.slice(0, 6)
  }, [filteredSpots, searchQuery])

  const flyTarget = useMemo(() => {
    if (!searchQuery.trim() || searchResults.length === 0) return null
    return searchResults[0]
  }, [searchResults, searchQuery])

  const userRank = profile?.rank ?? 0
  const rankInfo = RANKS[userRank] ?? RANKS[0]
  const nextRank = RANKS[userRank + 1]
  const userSpotCount = spots.filter(s => s.user_id === user?.id && s.status !== 'buffed').length

  if (loading) return (
    <div style={{ background: '#09090b', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#71717a', fontFamily: 'Space Grotesk, sans-serif' }}>Ładowanie...</p>
    </div>
  )

  if (!user) return <Auth onLogin={setUser} />

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#09090b' }}>

      {/* NAVBAR */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(9,9,11,0.93)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'Space Grotesk, sans-serif', gap: '8px' }}>
        <h1 style={{ color: 'white', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.04em', flexShrink: 0 }}>CTY-GRID</h1>

        {/* DESKTOP FILTRY */}
        <div className="desktop-filters" style={{ display: 'flex', alignItems: 'center', gap: '5px', overflowX: 'auto', flex: 1 }}>
          <button onClick={() => setActiveCrew(null)} style={{ padding: '4px 12px', borderRadius: '9999px', border: 'none', background: activeCrew === null ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', color: activeCrew === null ? 'white' : '#52525b', fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap', outline: activeCrew === null ? '1px solid rgba(255,255,255,0.18)' : 'none' }}>Wszystkie</button>
          {allCrews.map(crew => {
            const color = crewMap[crew] || '#f97316'
            const active = activeCrew === crew
            return <button key={crew} onClick={() => setActiveCrew(active ? null : crew)} style={{ padding: '4px 12px', borderRadius: '9999px', border: 'none', background: active ? color : 'rgba(255,255,255,0.04)', color: active ? '#000' : color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap', outline: active ? 'none' : `1px solid ${color}55`, boxShadow: active ? `0 0 10px ${color}50` : 'none', transition: 'all 0.15s' }}>{crew}</button>
          })}
          <button onClick={() => setShowBuffed(b => !b)} style={{ padding: '4px 12px', borderRadius: '9999px', border: 'none', background: showBuffed ? 'rgba(113,113,122,0.15)' : 'rgba(113,113,122,0.05)', color: showBuffed ? '#71717a' : '#3f3f46', fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap', outline: showBuffed ? '1px solid rgba(113,113,122,0.28)' : 'none' }}>{showBuffed ? '🪣 Buffed: ON' : '🪣 Buffed: OFF'}</button>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <select value={dateFilter ?? ''} onChange={e => setDateFilter(e.target.value ? Number(e.target.value) : null)} style={{ padding: '4px 24px 4px 10px', borderRadius: '9999px', border: 'none', background: dateFilter ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.04)', color: dateFilter ? '#38bdf8' : '#52525b', fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', outline: dateFilter ? '1px solid rgba(56,189,248,0.3)' : 'none', appearance: 'none', WebkitAppearance: 'none' }}>
              {DATE_FILTERS.map(f => <option key={f.label} value={f.days ?? ''} style={{ background: '#0c0c0e', color: 'white' }}>📅 {f.label}</option>)}
            </select>
            <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: dateFilter ? '#38bdf8' : '#52525b', fontSize: '0.6rem', pointerEvents: 'none' }}>▼</span>
          </div>
          <button onClick={() => setShowHeatmap(h => !h)} style={{ padding: '4px 12px', borderRadius: '9999px', border: 'none', background: showHeatmap ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)', color: showHeatmap ? '#f87171' : '#52525b', fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap', outline: showHeatmap ? '1px solid rgba(239,68,68,0.3)' : 'none', transition: 'all 0.15s' }}>🌡️ Heat{showHeatmap ? ': ON' : ': OFF'}</button>

          {/* WYSZUKIWARKA */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={searchRef}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {searchOpen && <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }} placeholder="Szukaj spotu, crew..." style={{ padding: '4px 12px', borderRadius: '9999px', border: '1px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.07)', color: 'white', fontSize: '0.72rem', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', width: '180px' }} />}
              <button onClick={() => { setSearchOpen(s => !s); if (searchOpen) setSearchQuery('') }} style={{ padding: '4px 10px', borderRadius: '9999px', border: 'none', background: searchOpen || searchQuery ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.04)', color: searchOpen || searchQuery ? '#f97316' : '#52525b', cursor: 'pointer', fontSize: '0.85rem', outline: searchOpen ? '1px solid rgba(249,115,22,0.35)' : 'none' }}>🔍</button>
            </div>
            {searchOpen && searchQuery && searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'rgba(12,12,14,0.98)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', width: '280px', zIndex: 2000, boxShadow: '0 20px 40px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
                <p style={{ color: '#52525b', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 14px 6px', margin: 0 }}>{filteredSpots.length} wyników</p>
                {searchResults.map(spot => {
                  const color = spot.crew_tags?.[0] ? (crewMap[spot.crew_tags[0]] || '#f97316') : '#f97316'
                  return (
                    <div key={spot.id} onClick={() => { setSelectedSpot(spot); setSearchOpen(false) }} style={{ padding: '10px 14px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: spot.status === 'buffed' ? '#4a4a4a' : color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: spot.status === 'buffed' ? '#52525b' : 'white', fontWeight: 600, fontSize: '0.85rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spot.title}</p>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                          {(spot.crew_tags || []).map(crew => <span key={crew} style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: '9999px', background: crewMap[crew] || '#f97316', color: '#000' }}>{crew}</span>)}
                        </div>
                      </div>
                      <span style={{ color: '#3f3f46', fontSize: '0.7rem' }}>→</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* PRAWA — desktop */}
        <div className="desktop-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '9999px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${rankInfo.color}38`, cursor: 'default' }} title={nextRank ? `${userSpotCount}/${nextRank.spotsNeeded} prac do ${nextRank.label}` : 'Maksymalna ranga!'}>
            <span style={{ fontSize: '0.72rem' }}>{rankInfo.icon}</span>
            <span style={{ color: rankInfo.color, fontSize: '0.7rem', fontWeight: 700 }}>{rankInfo.label}</span>
            {nextRank && <span style={{ color: '#3f3f46', fontSize: '0.65rem' }}>{userSpotCount}/{nextRank.spotsNeeded}</span>}
          </div>
          <button onClick={() => window.open('/about.html', '_blank')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: '#71717a', padding: '5px 11px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif' }}>ℹ️ O nas</button>
          <button onClick={() => navigate('/feed')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: '#71717a', padding: '5px 11px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif' }}>📰 Feed</button>
          <button onClick={() => navigate('/profile')} style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', padding: '4px 8px', borderRadius: '8px' }} onMouseEnter={e => e.target.style.color = 'white'} onMouseLeave={e => e.target.style.color = '#a1a1aa'}>{profile?.username || user.email}</button>
          {isAdmin && <button onClick={() => setShowAdmin(true)} style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.32)', color: '#f97316', padding: '5px 11px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>⚡ Admin</button>}
          <button onClick={handleLogout} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: '#71717a', padding: '5px 11px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'Space Grotesk, sans-serif' }}>Wyloguj</button>
        </div>

        {/* MOBILE */}
        <div className="mobile-right" style={{ display: 'none', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => { setSearchOpen(s => !s); if (searchOpen) setSearchQuery('') }} style={{ background: searchOpen || searchQuery ? 'rgba(249,115,22,0.15)' : 'none', border: 'none', color: searchOpen || searchQuery ? '#f97316' : '#71717a', cursor: 'pointer', fontSize: '1.1rem', padding: '4px 8px', borderRadius: '8px' }}>🔍</button>
          <button onClick={() => setMenuOpen(m => !m)} style={{ background: menuOpen ? 'rgba(255,255,255,0.08)' : 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem', padding: '4px 8px', borderRadius: '8px' }}>☰</button>
        </div>
      </div>

      {/* MOBILE SEARCH */}
      <div className="mobile-search" style={{ display: 'none', position: 'absolute', top: '52px', left: 0, right: 0, zIndex: 999, padding: '8px 12px', background: 'rgba(9,9,11,0.97)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }} placeholder="Szukaj spotu, crew..." style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(249,115,22,0.4)', background: 'rgba(249,115,22,0.07)', color: 'white', fontSize: '0.88rem', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
        {searchQuery && searchResults.length > 0 && (
          <div style={{ marginTop: '6px', background: 'rgba(12,12,14,0.99)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
            {searchResults.map(spot => (
              <div key={spot.id} onClick={() => { setSelectedSpot(spot); setSearchOpen(false) }} style={{ padding: '12px 14px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.88rem' }}>{spot.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MOBILE MENU */}
      {menuOpen && (
        <div style={{ position: 'absolute', top: '52px', right: 0, zIndex: 1001, background: 'rgba(9,9,11,0.98)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0 0 0 16px', padding: '16px', minWidth: '220px', fontFamily: 'Space Grotesk, sans-serif', boxShadow: '-4px 4px 30px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '0.85rem' }}>{rankInfo.icon}</span>
            <div>
              <span style={{ color: rankInfo.color, fontWeight: 700, fontSize: '0.85rem' }}>{profile?.username || user.email}</span>
              {nextRank && <p style={{ color: '#52525b', fontSize: '0.68rem', margin: '2px 0 0' }}>{userSpotCount}/{nextRank.spotsNeeded} do {nextRank.label}</p>}
            </div>
          </div>
          <p style={{ color: '#52525b', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>Filtry</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
            <button onClick={() => { setActiveCrew(null); setMenuOpen(false) }} style={{ padding: '5px 12px', borderRadius: '9999px', border: 'none', background: activeCrew === null ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', color: activeCrew === null ? 'white' : '#52525b', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>Wszystkie</button>
            {allCrews.map(crew => {
              const color = crewMap[crew] || '#f97316'
              const active = activeCrew === crew
              return <button key={crew} onClick={() => { setActiveCrew(active ? null : crew); setMenuOpen(false) }} style={{ padding: '5px 12px', borderRadius: '9999px', border: 'none', background: active ? color : 'rgba(255,255,255,0.04)', color: active ? '#000' : color, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>{crew}</button>
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
            <button onClick={() => setShowBuffed(b => !b)} style={{ padding: '8px 12px', borderRadius: '9px', border: 'none', background: showBuffed ? 'rgba(113,113,122,0.15)' : 'rgba(255,255,255,0.04)', color: showBuffed ? '#a1a1aa' : '#52525b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', textAlign: 'left' }}>{showBuffed ? '🪣 Buffed: ON' : '🪣 Buffed: OFF'}</button>
            <button onClick={() => setShowHeatmap(h => !h)} style={{ padding: '8px 12px', borderRadius: '9px', border: 'none', background: showHeatmap ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)', color: showHeatmap ? '#f87171' : '#52525b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', textAlign: 'left' }}>🌡️ Heat{showHeatmap ? ': ON' : ': OFF'}</button>
            <select value={dateFilter ?? ''} onChange={e => setDateFilter(e.target.value ? Number(e.target.value) : null)} style={{ padding: '8px 12px', borderRadius: '9px', border: 'none', background: dateFilter ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)', color: dateFilter ? '#38bdf8' : '#52525b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', appearance: 'none' }}>
              {DATE_FILTERS.map(f => <option key={f.label} value={f.days ?? ''} style={{ background: '#0c0c0e', color: 'white' }}>📅 {f.label}</option>)}
            </select>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button onClick={() => { window.open('/about.html', '_blank'); setMenuOpen(false) }} style={{ padding: '10px 12px', borderRadius: '9px', border: 'none', background: 'rgba(255,255,255,0.04)', color: '#a1a1aa', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', textAlign: 'left' }}>ℹ️ O nas</button>
            <button onClick={() => { navigate('/feed'); setMenuOpen(false) }} style={{ padding: '10px 12px', borderRadius: '9px', border: 'none', background: 'rgba(255,255,255,0.04)', color: '#a1a1aa', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', textAlign: 'left' }}>📰 Feed</button>
            <button onClick={() => { navigate('/profile'); setMenuOpen(false) }} style={{ padding: '10px 12px', borderRadius: '9px', border: 'none', background: 'rgba(255,255,255,0.04)', color: '#a1a1aa', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', textAlign: 'left' }}>👤 Profil</button>
            {isAdmin && <button onClick={() => { setShowAdmin(true); setMenuOpen(false) }} style={{ padding: '10px 12px', borderRadius: '9px', border: 'none', background: 'rgba(249,115,22,0.1)', color: '#f97316', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', textAlign: 'left' }}>⚡ Admin</button>}
            <button onClick={handleLogout} style={{ padding: '10px 12px', borderRadius: '9px', border: 'none', background: 'rgba(255,255,255,0.04)', color: '#71717a', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', textAlign: 'left' }}>Wyloguj</button>
          </div>
        </div>
      )}

      {/* HINT */}
      <div style={{ position: 'absolute', bottom: '28px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(9,9,11,0.88)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '9999px', padding: '9px 18px', color: '#71717a', fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        {searchQuery ? `🔍 ${filteredSpots.length} wyników` : dateFilter ? `📅 Ostatnie ${dateFilter} dni — ${filteredSpots.length} prac` : showHeatmap ? `🌡️ Heatmapa — ${spots.length} prac` : '🎨 Dotknij mapę żeby dodać pracę'}
      </div>

      {/* MAPA */}
      <MapContainer center={mapCenter} zoom={mapZoom} style={{ width: '100%', height: '100%' }} zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
        <MapClickHandler onMapClick={coords => { if (!user || !coords || coords.lat === undefined) return; setPendingCoords(coords) }} />
        <MapViewSaver />
        {flyTarget && <FlyToResult spot={flyTarget} />}
        {showHeatmap && <HeatmapLayer spots={spots} />}
        {!showHeatmap && (
          <MarkerClusterGroup iconCreateFunction={createClusterIcon} showCoverageOnHover={false} maxClusterRadius={60} spiderfyOnMaxZoom={true} disableClusteringAtZoom={17}>
            {filteredSpots.map(spot => {
              const buffed = spot.status === 'buffed'
              const firstCrew = spot.crew_tags?.[0]
              const pinColor = firstCrew ? (crewMap[firstCrew] || '#f97316') : '#f97316'
              return (
                <Marker key={spot.id} position={[spot.lat, spot.lng]} icon={spot.is_moving ? makeMovingPin(spot.vehicle_type) : makePin(pinColor, buffed, !!searchQuery)} eventHandlers={{ click: () => setSelectedSpot(spot) }} />
              )
            })}
          </MarkerClusterGroup>
        )}
      </MapContainer>

      <style>{`
        @media (max-width: 768px) {
          .desktop-filters { display: none !important; }
          .desktop-right { display: none !important; }
          .mobile-right { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-search { display: none !important; }
        }
      `}</style>
      {searchOpen && <style>{`.mobile-search { display: block !important; }`}</style>}

      {selectedSpot && <SpotModal spot={selectedSpot} userId={user.id} userRank={userRank} isAdmin={isAdmin} onClose={() => setSelectedSpot(null)} onDeleted={() => { handleRefresh(); setSelectedSpot(null) }} onRefresh={handleRefresh} />}
      {pendingCoords && <AddSpotModal coords={pendingCoords} userId={user.id} onClose={() => setPendingCoords(null)} onAdded={() => { handleRefresh(); setPendingCoords(null) }} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} onRefresh={handleRefresh} />}
    </div>
  )
}
