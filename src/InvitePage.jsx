import { t } from './i18n'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function InvitePage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [invite, setInvite]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUser(data.session?.user ?? null)
    })
    fetchInvite()
  }, [code])

  async function fetchInvite() {
    const { data } = await supabase.from('invites').select('*, profiles!invites_created_by_fkey(username)').eq('code', code).single()
    setInvite(data)
    setLoading(false)
  }

  async function handleAccept() {
    if (!currentUser) { navigate(`/register?invite=${code}`); return }
    if (invite.used_by) { setError(t('inviteUsed')); return }

    const { data: profile } = await supabase.from('profiles').select('id').eq('id', currentUser.id).single()
    if (!profile) { setError(t('profileNotFoundInvite')); return }

    await supabase.from('invites').update({ used_by: currentUser.id, used_at: new Date().toISOString() }).eq('code', code)
    navigate('/')
  }

  if (loading) return (
    <div style={{ background: '#09090b', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#71717a', fontFamily: 'Space Grotesk, sans-serif' }}>Sprawdzam zaproszenie...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Space Grotesk, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '420px', background: 'rgba(12,12,14,0.97)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '40px 36px', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>
        <h1 style={{ color: 'white', fontWeight: 700, fontSize: '2rem', letterSpacing: '0.06em', margin: 0 }}>CTY-GRID</h1>

        {!invite ? (
          <div style={{ marginTop: '24px' }}>
            <p style={{ color: '#f87171', fontSize: '0.9rem' }}>❌ Nieprawidłowe lub wygasłe zaproszenie.</p>
            <button onClick={() => navigate('/')} style={{ marginTop: '16px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'white', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>{t('back')}</button>
          </div>
        ) : invite.used_by ? (
          <div style={{ marginTop: '24px' }}>
            <p style={{ color: '#f87171', fontSize: '0.9rem' }}>❌ To zaproszenie zostało już użyte.</p>
            <button onClick={() => navigate('/')} style={{ marginTop: '16px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.08)', color: 'white', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>{t('back')}</button>
          </div>
        ) : (
          <div style={{ marginTop: '24px' }}>
            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: '24px' }}>
              <p style={{ color: '#f97316', fontWeight: 700, fontSize: '0.9rem', margin: '0 0 6px' }}>🎨 Masz zaproszenie!</p>
              <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: 0 }}>
                <strong style={{ color: 'white' }}>{invite.profiles?.username || 'Ktoś'}</strong> {invite.profiles?.username || 'Someone'} {t('invitesYou')}
              </p>
            </div>

            {error && <p style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '12px' }}>{error}</p>}

            {currentUser ? (
              <button onClick={handleAccept} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', boxShadow: '0 4px 20px rgba(249,115,22,0.35)' }}>
                Dołącz do CTY-GRID →
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => navigate(`/?invite=${code}`)} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', boxShadow: '0 4px 20px rgba(249,115,22,0.35)' }}>
                  Zarejestruj się →
                </button>
                <p style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', margin: 0 }}>
                  Masz konto? <span onClick={() => navigate(`/?invite=${code}&login=1`)} style={{ color: '#f97316', cursor: 'pointer' }}>{t('loginLink')}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
