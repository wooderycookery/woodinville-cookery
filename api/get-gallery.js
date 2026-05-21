import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // GET with no body = keep-alive ping (used by Vercel cron)
  if (req.method === 'GET') {
    const { count, error } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.status(200).json({ ok: true, event_count: count })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { eventId, phase } = req.body
  if (!eventId || !phase) return res.status(400).json({ error: 'Missing required fields' })

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, pre_gallery_open, post_gallery_open')
    .eq('id', eventId)
    .single()

  if (eventError || !event) return res.status(404).json({ error: 'Event not found' })

  const isOpen = phase === 'pre' ? event.pre_gallery_open : event.post_gallery_open

  const { data: photos, error: photosError } = await supabase
    .from('photos')
    .select('id, storage_path, phase, caption, featured, author_name, uploaded_at')
    .eq('event_id', eventId)
    .eq('phase', phase)
    .order('featured', { ascending: false })
    .order('uploaded_at', { ascending: true })

  if (photosError) return res.status(500).json({ error: photosError.message })

  const photosWithUrls = (photos || []).map(p => {
    const { data: { publicUrl } } = supabase.storage
      .from('event-images')
      .getPublicUrl(p.storage_path)
    return { ...p, url: publicUrl }
  })

  return res.status(200).json({
    eventName: event.name,
    isOpen,
    photos: photosWithUrls,
  })
}
