const FUNCTION_URL = 'https://jlfrshlgwdlhyjkfxwbm.supabase.co/functions/v1/clever-action'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZnJzaGxnd2RsaHlqa2Z4d2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzQ4OTIsImV4cCI6MjA5MTUxMDg5Mn0.qOoh08VNzLZbOg4DArZKKewYrJphgKwkyvcZUjZSGPI'

export async function notifyAdmin({ type, title, username, comment = '' }) {
  try {
    await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify({ type, title, username, comment }),
    })
  } catch (e) {
    console.warn('Notify failed:', e.message)
  }
}
