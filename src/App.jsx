import SpotModal from './SpotModal'
import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useNavigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
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
  0: { label: 'Newbie',  color: '#71717a', icon: '👶' },
  1: { label: 'Writer',  color: '#38bdf8', icon: '✏️' },
  2: { label: 'Veteran', color: '#a78bfa', icon: '🎯' },
  3: { label: 'Legend',  color: '#f97316', icon: '👑' },
}

function makePin(color, buffed = false) {
  const c = buffed ? '#4a4a4a' : color
  const opacity = buffed ? 0.55 : 1
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z"
      fill="${c}" opacity="${opacity}"/>
    <circle cx="14" cy="14" r="5.5" fill="rgba(0,0,0,0.35)"/>
    <circle cx="14" cy="14" r="4" fill="white" opacity="${buffed ? 0.4 : 0.9}"/>
  </svg>`
  return L.divIcon({
    html: svg, className: '',
    iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -38],
  })
}

// Custom cluster icon — ciemny styl pasujący do mapy
function createClusterIcon(cluster) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 36 : count < 50 ? 42 : 48
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:rgba(249,115,22,0.85);
      backdrop-filter:blur(4px);
      border:2px solid rgba(255,255,255,0.25);
      display:flex;align-items:center;justify-content:center;
      font-family:'Space Grotesk',sans-serif;
      font-weight:700;font-size:${count < 10 ? '0.85' : '0.78'}rem;
      color:white;
      box-shadow:0 4px 14px rgba(249,115,22,0.4);
    ">${count}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      if (e.latlng && e.latlng.lat !== undefined)
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    }
  })
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
  const [pendingCoords, setPendingCoords] = useState(null)
  const [selectedSpot, setSelectedSpot]   = useState(null)
  const [showAdmin, setShowAdmin]         = useState(false)
  const [isAdmin, setIsAdmin]             = useState(false)

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
    fetchSpots()
    fetchCrews()
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
    if (data) {
      const map = {}
      data.forEach(c => { map[c.name] = c.color })
      setCrewMap(map)
    }
  }

  async function fetchSpots() {
    const { data } = await supabase
      .from('spots').select('*')
      .eq('is_public', true)
      .in('status', ['approved', 'buffed'])
    setSpots(data || [])
  }

  async function handleRefresh() {
    await fetchSpots()
    await fetchCrews()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setProfile(null); setIsAdmin(false)
  }

  const allCrews = useMemo(() => {
    const set = new Set()
    spots.forEach(s => (s.crew_tags || []).forEach(c => set.add(c)))
    return [...set].sort()
  }, [spots])

  const filteredSpots = useMemo(() => spots.filter(spot => {
    if (!showBuffed && spot.status === 'buffed') return false
    if (activeCrew && !(spot.crew_tags || []).includes(activeCrew)) return false
    return true
  }), [spots, activeCrew, showBuffed])

  const userRank = profile?.rank ?? 0
  const rankInfo = RANKS[userRank] ?? RANKS[0]

  if (loading) return (
    <div style={{ background: '#09090b', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#71717a', fontFamily: 'Space Grotesk, sans-serif' }}>Ładowanie...</p>
    </div>
  )

  if (!user) return <Auth onLogin={setUser} />

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#09090b' }}>

      {/* NAVBAR */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'rgba(9,9,11,0.93)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontFamily: 'Space Grotesk, sans-serif', gap: '10px',
      }}>
        <h1 style={{ color: 'white', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '0.04em', flexShrink: 0 }}>
          CTY-GRID
        </h1>

        {/* FILTRY */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflowX: 'auto', flex: 1 }}>
          <button onClick={() => setActiveCrew(null)} style={{
            padding: '4px 12px', borderRadius: '9999px', border: 'none',
            background: activeCrew === null ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
            color: activeCrew === null ? 'white' : '#52525b',
            fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer',
            fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap',
            outline: activeCrew === null ? '1px solid rgba(255,255,255,0.18)' : 'none',
          }}>Wszystkie</button>

          {allCrews.map(crew => {
            const color = crewMap[crew] || '#f97316'
            const active = activeCrew === crew
            return (
              <button key={crew} onClick={() => setActiveCrew(active ? null : crew)} style={{
                padding: '4px 12px', borderRadius: '9999px', border: 'none',
                background: active ? color : 'rgba(255,255,255,0.04)',
                color: active ? '#000' : color,
                fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer',
                fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap',
                outline: active ? 'none' : `1px solid ${color}55`,
                boxShadow: active ? `0 0 10px ${color}50` : 'none',
                transition: 'all 0.15s',
              }}>{crew}</button>
            )
          })}

          <button onClick={() => setShowBuffed(b => !b)} style={{
            padding: '4px 12px', borderRadius: '9999px', border: 'none',
            background: showBuffed ? 'rgba(113,113,122,0.15)' : 'rgba(113,113,122,0.05)',
            color: showBuffed ? '#71717a' : '#3f3f46',
            fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer',
            fontFamily: 'Space Grotesk, sans-serif', whiteSpace: 'nowrap',
            outline: showBuffed ? '1px solid rgba(113,113,122,0.28)' : 'none',
          }}>{showBuffed ? '🪣 Buffed: ON' : '🪣 Buffed: OFF'}</button>
        </div>

        {/* PRAWA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '3px 10px', borderRadius: '9999px',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${rankInfo.color}38`,
          }}>
            <span style={{ fontSize: '0.72rem' }}>{rankInfo.icon}</span>
            <span style={{ color: rankInfo.color, fontSize: '0.7rem', fontWeight: 700 }}>{rankInfo.label}</span>
          </div>

          <button onClick={() => navigate('/profile')} style={{
            background: 'none', border: 'none', color: '#a1a1aa',
            fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif',
            padding: '4px 8px', borderRadius: '8px', transition: 'color 0.15s',
          }}
            onMouseEnter={e => e.target.style.color = 'white'}
            onMouseLeave={e => e.target.style.color = '#a1a1aa'}
          >
            {profile?.username || user.email}
          </button>

          {isAdmin && (
            <button onClick={() => setShowAdmin(true)} style={{
              background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.32)',
              color: '#f97316', padding: '5px 11px', borderRadius: '8px',
              cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
              fontFamily: 'Space Grotesk, sans-serif',
            }}>⚡ Admin</button>
          )}
          <button onClick={handleLogout} style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.07)',
            color: '#71717a', padding: '5px 11px', borderRadius: '8px',
            cursor: 'pointer', fontSize: '0.78rem',
            fontFamily: 'Space Grotesk, sans-serif',
          }}>Wyloguj</button>
        </div>
      </div>

      {/* HINT */}
      <div style={{
        position: 'absolute', bottom: '28px', left: '50%',
        transform: 'translateX(-50%)', zIndex: 1000,
        background: 'rgba(9,9,11,0.88)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.07)', borderRadius: '9999px',
        padding: '9px 18px', color: '#71717a',
        fontSize: '0.8rem', fontFamily: 'Space Grotesk, sans-serif',
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        🎨 Kliknij na mapie żeby dodać pracę
      </div>

      {/* MAPA */}
      <MapContainer
        center={[52.2297, 21.0122]}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <MapClickHandler onMapClick={coords => {
          if (!user || !coords || coords.lat === undefined) return
          setPendingCoords(coords)
        }} />

        <MarkerClusterGroup
          iconCreateFunction={createClusterIcon}
          showCoverageOnHover={false}
          maxClusterRadius={60}
          spiderfyOnMaxZoom={true}
          disableClusteringAtZoom={17}
        >
          {filteredSpots.map(spot => {
            const buffed = spot.status === 'buffed'
            const firstCrew = spot.crew_tags?.[0]
            const pinColor = firstCrew ? (crewMap[firstCrew] || '#f97316') : '#f97316'
            return (
              <Marker
                key={spot.id}
                position={[spot.lat, spot.lng]}
                icon={makePin(pinColor, buffed)}
                eventHandlers={{ click: () => setSelectedSpot(spot) }}
              />
            )
          })}
        </MarkerClusterGroup>
      </MapContainer>

      {/* MODALS */}
      {selectedSpot && (
        <SpotModal
          spot={selectedSpot}
          userId={user.id}
          userRank={userRank}
          isAdmin={isAdmin}
          onClose={() => setSelectedSpot(null)}
          onDeleted={() => { handleRefresh(); setSelectedSpot(null) }}
          onRefresh={handleRefresh}
        />
      )}

      {pendingCoords && (
        <AddSpotModal
          coords={pendingCoords}
          userId={user.id}
          onClose={() => setPendingCoords(null)}
          onAdded={() => { handleRefresh(); setPendingCoords(null) }}
        />
      )}

      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  )
}
