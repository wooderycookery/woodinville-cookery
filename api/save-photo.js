import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, phase, storagePath, mimeType, caption, authorName, token, authorId } = req.body
  if (!eventId || !phase || !storagePath) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Light re-validation to prevent spoofed saves
  let resolvedAuthorName = authorName || 'Guest'

  if (token && !authorId) {
    const { data: guest } = await supabase
      .from('guests')
      .select('id, rsvp_status, contacts(name)')
      .eq('invite_token', token)
      .eq('event_id', eventId)
      .single()
    if (!guest || !['attending', 'maybe'].includes(guest.rsvp_status)) {
      return res.status(403).json({ error: 'Not authorized' })
    }
    resolvedAuthorName = guest.contacts?.name || 'Guest'
  } else if (authorId) {
    const { data: event } = await supabase
      .from('events')
      .select('host_id')
      .eq('id', eventId)
      .single()
    if (!event || event.host_id !== authorId) {
      return res.status(403).json({ error: 'Not authorized' })
    }
  }

  const { data: photo, error } = await supabase
    .from('photos')
    .insert({
      event_id: eventId,
      storage_path: storagePath,
      phase,
      mime_type: mimeType || null,
      caption: caption || null,
      author_name: resolvedAuthorName,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const { data: { publicUrl } } = supabase.storage
    .from('event-images')
    .getPublicUrl(storagePath)

  return res.status(200).json({ photo: { ...photo, url: publicUrl } })
}
