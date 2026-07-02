import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, phase, filename, token, authorId } = req.body
  if (!eventId || !phase || !filename) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (!['pre', 'post', 'table'].includes(phase)) {
    return res.status(400).json({ error: 'Invalid phase' })
  }

  let authorName = 'Guest'

  if (token && !authorId) {
    const { data: guest, error } = await supabase
      .from('guests')
      .select('id, rsvp_status, contacts(name)')
      .eq('invite_token', token)
      .eq('event_id', eventId)
      .single()

    if (error || !guest) return res.status(403).json({ error: 'Invalid token' })
    if (!['attending', 'maybe'].includes(guest.rsvp_status)) {
      return res.status(403).json({ error: 'RSVP required before uploading' })
    }
    authorName = guest.contacts?.name || 'Guest'
  } else if (authorId) {
    const { data: event } = await supabase
      .from('events')
      .select('host_id')
      .eq('id', eventId)
      .single()
    if (!event || event.host_id !== authorId) {
      return res.status(403).json({ error: 'Not authorized' })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', authorId)
      .single()
    authorName = profile?.display_name || 'Host'
  } else {
    return res.status(403).json({ error: 'Authentication required' })
  }

  const ext = filename.split('.').pop().toLowerCase()
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const storagePath = `${eventId}/${phase}/${safeName}`

  const { data, error: urlError } = await supabase.storage
    .from('event-images')
    .createSignedUploadUrl(storagePath)

  if (urlError) {
    return res.status(500).json({ error: urlError.message })
  }

  return res.status(200).json({
    signedUrl: data.signedUrl,
    path: storagePath,
    authorName,
    token: data.token,
  })
}
