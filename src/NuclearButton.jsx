import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function NuclearButton({ userId, username }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [progress, setProgress] = useState('')
  const [confirmText, setConfirmText] = useState('')

  async function handleNuclear() {
    setStep(3)
    setProgress('Pobieram listę prac...')

    const { data: spots } = await supabase
      .from('spots').select('id, image_url, image_urls').eq('user_id', userId)

    const allSpots = spots || []
    const allImagePaths = []
    allSpots.forEach(spot => {
      const urls = spot.image_urls?.length ? spot.image_urls : spot.image_url ? [spot.image_url] : []
      urls.forEach(url => {
        const path = url.split('/spot-images/')[1]
        if (path) allImagePaths.push(path)
      })
    })

    if (allImagePaths.length > 0) {
      setProgress(`Usuwam ${allImagePaths.length} zdjęć...`)
      for (let i = 0; i < allImagePaths.length; i += 20) {
        await supabase.storage.from('spot-images').remove(allImagePaths.slice(i, i + 20))
      }
    }

    setProgress('Usuwam avatar...')
    const { data: profile } = await supabase.from('profiles').select('avatar_url').eq('id', userId).single()
    if (profile?.avatar_url) {
      const avatarPath = profile.avatar_url.split('/avatars/')[1]
      if (avatarPath) await supabase.storage.from('avatars').remove([avatarPath])
    }

    setProgress('Usuwam komentarze...')
    await supabase.from('comments').delete().eq('user_id', userId)

    setProgress('Usuwam prace...')
    await supabase.from('spots').delete().eq('user_id', userId)

    setProgress('Usuwam profil...')
    await supabase.from('profiles').delete().eq('id', userId)

    setProgress('Wylogowuję...')
    await supabase.auth.signOut()
    navigate('/')
  }

  if (step === 0) return (
    <button onClick={() => setStep(1)} style={{
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
      color: '#ef4444', padding: '8px 16px', borderRadius: '10px',
      cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
      fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', gap: '7px',
    }}>☢️ Nuklearny guzik</button>
  )

  if (step === 3) return (
    <div style={{ padding: '20px', borderRadius: '14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontFamily: 'Space Grotesk, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #ef4444', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
        <p style={{ color: '#f87171', fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>☢️ Usuwam wszystko...</p>
      </div>
      <p style={{ color: '#71717a', fontSize: '0.78rem', margin: 0 }}>{progress}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ padding: '20px', borderRadius: '14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', fontFamily: 'Space Grotesk, sans-serif' }}>
      {step === 1 && (
        <>
          <p style={{ color: '#f87171', fontWeight: 700, fontSize: '0.95rem', margin: '0 0 8px' }}>☢️ Nuklearny guzik</p>
          <p style={{ color: '#a1a1aa', fontSize: '0.83rem', margin: '0 0 16px', lineHeight: 1.6 }}>
            Usuwa <strong style={{ color: 'white' }}>WSZYSTKO</strong> — prace, zdjęcia, komentarze i konto. Nieodwracalne.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep(0)} style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: '#71717a', cursor: 'pointer', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.85rem' }}>Anuluj</button>
            <button onClick={() => setStep(2)} style={{ flex: 2, padding: '9px', borderRadius: '9px', border: 'none', background: 'rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.85rem', outline: '1px solid rgba(239,68,68,0.35)' }}>Rozumiem →</button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <p style={{ color: '#f87171', fontWeight: 700, fontSize: '0.95rem', margin: '0 0 8px' }}>☢️ Ostatnie ostrzeżenie</p>
          <p style={{ color: '#a1a1aa', fontSize: '0.83rem', margin: '0 0 12px', lineHeight: 1.6 }}>
            Wpisz <strong style={{ color: 'white' }}>{username}</strong> żeby potwierdzić:
          </p>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={username}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '9px', boxSizing: 'border-box',
              border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.05)',
              color: 'white', fontSize: '0.88rem', fontFamily: 'Space Grotesk, sans-serif',
              outline: 'none', marginBottom: '12px',
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setStep(0); setConfirmText('') }} style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: '#71717a', cursor: 'pointer', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.85rem' }}>Anuluj</button>
            <button onClick={handleNuclear} disabled={confirmText !== username} style={{ flex: 2, padding: '9px', borderRadius: '9px', border: 'none', background: confirmText === username ? '#ef4444' : 'rgba(239,68,68,0.15)', color: confirmText === username ? 'white' : '#71717a', cursor: confirmText === username ? 'pointer' : 'not-allowed', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.85rem', transition: 'all 0.15s' }}>☢️ USUŃ WSZYSTKO</button>
          </div>
        </>
      )}
    </div>
  )
}
