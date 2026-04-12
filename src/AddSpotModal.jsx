import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { notifyAdmin } from './notify'
import imageCompression from 'browser-image-compression'

async function stripExifAndCompress(file) {
  const options = { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg' }
  const compressed = await imageCompression(file, options)
  return new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
}

function fuzzLocation(lat, lng, radiusMeters) {
  if (!radiusMeters) return { lat, lng }
  const r = radiusMeters / 111320
  const angle = Math.random() * 2 * Math.PI
  const distance = Math.random() * r
  return {
    lat: lat + distance * Math.cos(angle),
    lng: lng + distance * Math.sin(angle) / Math.cos(lat * Math.PI / 180),
  }
}

const RADIUS_OPTIONS = [
  { label: '📍 Dokładna', value: 0 },
  { label: '~100m', value: 100 },
  { label: '~200m', value: 200 },
  { label: '~500m', value: 500 },
]

const VEHICLE_TYPES = [
  { value: 'train', label: '🚂 Pociąg towarowy' },
  { value: 'metro', label: '🚇 Metro' },
  { value: 'tram',  label: '🚋 Tramwaj' },
  { value: 'bus',   label: '🚌 Bus' },
  { value: 'other', label: '🚛 Inne' },
]

const COLOR_PALETTE = [
  '#f97316','#38bdf8','#a78bfa','#34d399','#f472b6',
  '#facc15','#fb7185','#818cf8','#2dd4bf','#c084fc',
  '#e879f9','#4ade80','#f87171','#60a5fa','#fbbf24',
]

export default function AddSpotModal({ coords, onClose, onAdded, userId }) {
  const [title, setTitle]               = useState('')
  const [description, setDescription]   = useState('')
  const [selectedCrews, setSelectedCrews] = useState([])
  const [allCrews, setAllCrews]         = useState([])
  const [isPublic, setIsPublic]         = useState(true)
  const [radiusMeters, setRadiusMeters] = useState(0)
  const [images, setImages]             = useState([])
  const [previews, setPreviews]         = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [progress, setProgress]         = useState('')
  const [isMoving, setIsMoving]         = useState(false)
  const [vehicleType, setVehicleType]   = useState('train')
  const [showNewCrew, setShowNewCrew]   = useState(false)
  const [newCrewName, setNewCrewName]   = useState('')
  const [newCrewColor, setNewCrewColor] = useState('#f97316')
  const [addingCrew, setAddingCrew]     = useState(false)
  const [crewError, setCrewError]       = useState('')

  useEffect(() => { fetchCrews() }, [])

  async function fetchCrews() {
    const { data } = await supabase.from('crews').select('*').order('name')
    setAllCrews(data || [])
  }

  if (!coords || coords.lat === undefined) return null

  function toggleCrew(crewName) {
    setSelectedCrews(prev => prev.includes(crewName) ? prev.filter(c => c !== crewName) : [...prev, crewName])
  }

  async function handleAddNewCrew() {
    if (!newCrewName.trim()) { setCrewError('Podaj nazwę crew'); return }
    setAddingCrew(true); setCrewError('')
    const name = newCrewName.trim().toUpperCase()
    const existing = allCrews.find(c => c.name === name)
    if (existing) {
      if (!selectedCrews.includes(name)) setSelectedCrews(prev => [...prev, name])
      setNewCrewName(''); setShowNewCrew(false); setAddingCrew(false); return
    }
    const { error: err } = await supabase.from('crews').insert({ name, color: newCrewColor })
    if (err) { setCrewError(err.message); setAddingCrew(false); return }
    await fetchCrews()
    setSelectedCrews(prev => [...prev, name])
    setNewCrewName(''); setShowNewCrew(false); setAddingCrew(false)
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files).slice(0, 8)
    setImages(files); setPreviews(files.map(f => URL.createObjectURL(f)))
  }

  function removeImage(idx) {
    setImages(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('Tytuł jest wymagany'); return }
    setLoading(true); setError('')

    const imageUrls = []
    for (let i = 0; i < images.length; i++) {
      setProgress(`Upload ${i + 1}/${images.length}...`)
      try {
        const clean = await stripExifAndCompress(images[i])
        const fileName = `${userId}_${Date.now()}_${i}.jpg`
        const { error: uploadError } = await supabase.storage.from('spot-images').upload(fileName, clean)
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('spot-images').getPublicUrl(fileName)
        imageUrls.push(urlData.publicUrl)
      } catch (err) {
        setError('Błąd uploadu: ' + err.message); setLoading(false); setProgress(''); return
      }
    }

    setProgress('Zapisywanie...')
    const { lat, lng } = isMoving ? coords : fuzzLocation(coords.lat, coords.lng, radiusMeters)

    const { error: insertError } = await supabase.from('spots').insert({
      user_id: userId,
      title: title.trim(),
      description: description.trim(),
      lat, lng,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      crew_tags: selectedCrews,
      is_public: isPublic,
      status: 'approved',
      location_fuzzed: isMoving ? true : radiusMeters > 0,
      fuzz_radius: isMoving ? 0 : radiusMeters,
      is_moving: isMoving,
      vehicle_type: isMoving ? vehicleType : null,
    })

    if (insertError) { setError(insertError.message); setLoading(false); setProgress(''); return }

    const { data: profile } = await supabase.from('profiles').select('username').eq('id', userId).single()
    notifyAdmin({ type: 'spot', title: title.trim(), username: profile?.username || 'Nieznany' })
    onAdded(); onClose()
  }

  const inp = {
    width: '100%', padding: '11px 14px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
    color: 'white', fontSize: '0.9rem', fontFamily: 'Space Grotesk, sans-serif',
    outline: 'none', boxSizing: 'border-box',
  }

  const selectedCrewObjs = allCrews.filter(c => selectedCrews.includes(c.name))
  const otherCrewObjs    = allCrews.filter(c => !selectedCrews.includes(c.name))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'rgba(12,12,14,0.97)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '500px', maxHeight: '92vh', overflowY: 'auto', fontFamily: 'Space Grotesk, sans-serif', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
          <div>
            <h2 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>🎨 Nowa Praca</h2>
            <p style={{ color: '#52525b', fontSize: '0.75rem', marginTop: '2px', marginBottom: 0 }}>
              {isMoving ? '🚂 Obiekt w ruchu — lokalizacja orientacyjna' : radiusMeters > 0 ? `📍 Rozmyta ~${radiusMeters}m` : `📍 ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#71717a', cursor: 'pointer', borderRadius: '8px', width: '32px', height: '32px', fontSize: '1rem' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input style={inp} placeholder="Nazwa pracy *" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea style={{ ...inp, minHeight: '72px', resize: 'vertical' }} placeholder="Opis, hashtagi (#wildstyle #throwup)..." value={description} onChange={e => setDescription(e.target.value)} />

          {/* OBIEKT W RUCHU */}
          <div style={{ borderRadius: '12px', border: isMoving ? '1px solid rgba(249,115,22,0.35)' : '1px solid rgba(255,255,255,0.07)', background: isMoving ? 'rgba(249,115,22,0.05)' : 'rgba(255,255,255,0.02)', padding: '14px', transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMoving ? '12px' : 0 }}>
              <div>
                <p style={{ color: isMoving ? '#f97316' : 'white', fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>🚂 Obiekt w ruchu</p>
                <p style={{ color: '#52525b', fontSize: '0.72rem', marginTop: '2px', marginBottom: 0 }}>{isMoving ? 'Nie pali spotu — lokalizacja orientacyjna!' : 'Pociąg, tramwaj, bus...'}</p>
              </div>
              <div onClick={() => setIsMoving(m => !m)} style={{ width: '44px', height: '24px', borderRadius: '9999px', background: isMoving ? '#f97316' : '#27272a', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '3px', left: isMoving ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
              </div>
            </div>
            {isMoving && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {VEHICLE_TYPES.map(v => (
                  <button key={v.value} onClick={() => setVehicleType(v.value)} style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: vehicleType === v.value ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.05)', color: vehicleType === v.value ? '#f97316' : '#71717a', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'Space Grotesk, sans-serif', outline: vehicleType === v.value ? '1px solid rgba(249,115,22,0.4)' : 'none', transition: 'all 0.15s' }}>{v.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* CREW */}
          <div style={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <p style={{ color: '#71717a', fontSize: '0.73rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>👥 Crew</p>
              <button onClick={() => { setShowNewCrew(s => !s); setCrewError('') }} style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: showNewCrew ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.06)', color: showNewCrew ? '#f97316' : '#71717a', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', outline: showNewCrew ? '1px solid rgba(249,115,22,0.35)' : 'none' }}>+ Nowe crew</button>
            </div>
            {showNewCrew && (
              <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.15)' }}>
                <input value={newCrewName} onChange={e => setNewCrewName(e.target.value.toUpperCase())} placeholder="Nazwa crew (np. TKO)" style={{ ...inp, marginBottom: '10px', background: 'rgba(255,255,255,0.06)' }} onKeyDown={e => e.key === 'Enter' && handleAddNewCrew()} />
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {COLOR_PALETTE.map(c => <div key={c} onClick={() => setNewCrewColor(c)} style={{ width: '22px', height: '22px', borderRadius: '6px', background: c, cursor: 'pointer', outline: newCrewColor === c ? '2px solid white' : '2px solid transparent', outlineOffset: '2px', transform: newCrewColor === c ? 'scale(1.2)' : 'scale(1)', transition: 'all 0.1s' }} />)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#52525b', fontSize: '0.72rem' }}>Podgląd:</span>
                    <span style={{ padding: '4px 14px', borderRadius: '9999px', background: newCrewColor, color: '#000', fontSize: '0.8rem', fontWeight: 700 }}>{newCrewName || 'CREW'}</span>
                  </div>
                  <button onClick={handleAddNewCrew} disabled={addingCrew} style={{ padding: '6px 16px', borderRadius: '8px', border: 'none', background: '#f97316', color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', opacity: addingCrew ? 0.6 : 1 }}>{addingCrew ? '...' : 'Dodaj ✔'}</button>
                </div>
                {crewError && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '6px' }}>{crewError}</p>}
              </div>
            )}
            {selectedCrewObjs.length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <p style={{ color: '#52525b', fontSize: '0.68rem', marginBottom: '5px' }}>Wybrane:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selectedCrewObjs.map(crew => <button key={crew.id} onClick={() => toggleCrew(crew.name)} style={{ padding: '5px 14px', borderRadius: '9999px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', background: crew.color, color: '#000', display: 'flex', alignItems: 'center', gap: '5px' }}>{crew.name} <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>✕</span></button>)}
                </div>
              </div>
            )}
            {otherCrewObjs.length > 0 && (
              <div>
                {selectedCrewObjs.length > 0 && <p style={{ color: '#3f3f46', fontSize: '0.68rem', marginBottom: '5px' }}>Dodaj więcej:</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {otherCrewObjs.map(crew => <button key={crew.id} onClick={() => toggleCrew(crew.name)} style={{ padding: '5px 14px', borderRadius: '9999px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', background: 'rgba(255,255,255,0.05)', color: crew.color, outline: `1px solid ${crew.color}45`, transition: 'all 0.15s' }}>{crew.name}</button>)}
                </div>
              </div>
            )}
            {allCrews.length === 0 && !showNewCrew && <p style={{ color: '#3f3f46', fontSize: '0.8rem', textAlign: 'center', padding: '8px 0' }}>Brak crew — kliknij "+ Nowe crew"</p>}
          </div>

          {/* RADIUS — tylko gdy nie w ruchu */}
          {!isMoving && (
            <div>
              <p style={{ color: '#71717a', fontSize: '0.73rem', marginBottom: '7px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>🔒 Precyzja lokalizacji</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {RADIUS_OPTIONS.map(opt => <button key={opt.value} onClick={() => setRadiusMeters(opt.value)} style={{ padding: '8px 4px', borderRadius: '8px', border: 'none', background: radiusMeters === opt.value ? '#f97316' : 'rgba(255,255,255,0.05)', color: radiusMeters === opt.value ? 'white' : '#71717a', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', transition: 'all 0.15s' }}>{opt.label}</button>)}
              </div>
              {radiusMeters > 0 && <p style={{ color: '#52525b', fontSize: '0.7rem', marginTop: '5px' }}>⚠️ Pinezka pojawi się w promieniu {radiusMeters}m</p>}
            </div>
          )}

          {/* ZDJĘCIA */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderRadius: '10px', border: '1px dashed rgba(249,115,22,0.35)', cursor: 'pointer', color: '#f97316', fontSize: '0.85rem', background: 'rgba(249,115,22,0.04)' }}>
              📷 Dodaj zdjęcia (max 8) — GPS/EXIF usuwane
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageSelect} />
            </label>
            {previews.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '8px' }}>
                {previews.map((url, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '8px', border: i === 0 ? '2px solid #f97316' : '1px solid rgba(255,255,255,0.08)' }} />
                    {i === 0 && <span style={{ position: 'absolute', top: '3px', left: '3px', background: '#f97316', color: 'white', fontSize: '0.55rem', fontWeight: 700, padding: '1px 4px', borderRadius: '3px' }}>COVER</span>}
                    <button onClick={() => removeImage(i)} style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,0,0,0.75)', border: 'none', color: 'white', borderRadius: '50%', width: '16px', height: '16px', cursor: 'pointer', fontSize: '0.6rem' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PUBLIC/PRIVATE */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
            <div>
              <p style={{ color: 'white', fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>{isPublic ? '🌍 Public' : '🔒 Private'}</p>
              <p style={{ color: '#52525b', fontSize: '0.73rem', marginTop: '1px', marginBottom: 0 }}>{isPublic ? 'Widoczna dla wszystkich' : 'Tylko Ty ją widzisz'}</p>
            </div>
            <div onClick={() => setIsPublic(!isPublic)} style={{ width: '44px', height: '24px', borderRadius: '9999px', background: isPublic ? '#f97316' : '#27272a', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: '3px', left: isPublic ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
            </div>
          </div>

          {progress && <p style={{ color: '#f97316', fontSize: '0.82rem' }}>⟳ {progress}</p>}
          {error && <p style={{ color: '#f87171', fontSize: '0.82rem' }}>⚠️ {error}</p>}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: '#71717a', cursor: 'pointer', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif' }}>Anuluj</button>
            <button onClick={handleSubmit} disabled={loading} style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', background: loading ? '#7c3d12' : '#f97316', color: 'white', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
              {loading ? 'Przetwarzanie...' : isMoving ? `Dodaj ${VEHICLE_TYPES.find(v => v.value === vehicleType)?.label.split(' ')[0]} 🚂` : 'Dodaj Pracę 🎨'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
