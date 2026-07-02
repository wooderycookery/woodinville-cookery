import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { photoId, token, authorId } = req.body
  if (!photoId) return res.status(400).json({ error: 'photoId required' })
  if (!token && !authorId) return res.status(400).json({ error: 'token or authorId required' })

  const { data: photo, error: fetchError } = await supabase
    .from('photos')
    .select('id, event_id, storage_path, author_token')
    .eq('id', photoId)
    .single()

  if (fetchError || !photo) return res.status(404).json({ error: 'Photo not found' })

  let authorized = false

  if (authorId) {
    const { data: event } = await supabase
      .from('events')
      .select('host_id')
      .eq('id', photo.event_id)
      .single()
    authorized = event?.host_id === authorId
  } else if (token) {
    authorized = photo.author_token === token
  }

  if (!authorized) return res.status(403).json({ error: 'Not authorized' })

  await supabase.storage.from('event-images').remove([photo.storage_path])

  const { error: deleteError } = await supabase
    .from('photos')
    .delete()
    .eq('id', photoId)

  if (deleteError) return res.status(500).json({ error: deleteError.message })

  return res.status(200).json({ ok: true })
}
