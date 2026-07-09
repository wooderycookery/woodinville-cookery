import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import imageCompression from 'browser-image-compression'

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })
}

export default function FromTheTable({ eventId, isHost, hostUserId, guestToken, guestName }) {
  const [items, setItems]           = useState([])
  const [text, setText]             = useState('')
  const [photoFile, setPhotoFile]   = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [error, setError]           = useState('')
  const fileInputRef                = useRef(null)

  const fetchFeed = useCallback(async () => {
    const [{ data: msgs }, { data: photos }] = await Promise.all([
      supabase
        .from('messages')
        .select('id, body, author_name, author_role, is_pinned, created_at')
        .eq('event_id', eventId)
        .eq('channel', 'attendees')
        .order('created_at', { ascending: false }),
      supabase
        .from('photos')
        .select('id, storage_path, caption, author_name, uploaded_at')
        .eq('event_id', eventId)
        .eq('phase', 'table')
        .order('uploaded_at', { ascending: false }),
    ])

    const msgItems = (msgs || []).map(m => ({ ...m, kind: 'message', sortKey: m.created_at }))
    const photoItems = (photos || []).map(p => {
      const { data: { publicUrl } } = supabase.storage.from('event-images').getPublicUrl(p.storage_path)
      return { ...p, kind: 'photo', sortKey: p.uploaded_at, url: publicUrl }
    })
    const merged = [...msgItems, ...photoItems].sort((a, b) => new Date(b.sortKey) - new Date(a.sortKey))
    setItems(merged)
  }, [eventId])

  useEffect(() => { fetchFeed() }, [fetchFeed])

  useEffect(() => {
    const sub = supabase
      .channel(`table-feed:${eventId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `event_id=eq.${eventId}`,
      }, () => fetchFeed())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [eventId, fetchFeed])

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function clearPhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim() && !photoFile) return
    setUploading(true)
    setError('')
    try {
      if (photoFile) {
        const compressed = await imageCompression(photoFile, {
          maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true,
        })
        const urlRes = await fetch('/api/gallery-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId, phase: 'table', filename: photoFile.name,
            token: isHost ? undefined : guestToken,
            authorId: isHost ? hostUserId : undefined,
          }),
        })
        const urlData = await urlRes.json()
        if (!urlRes.ok) throw new Error(urlData.error || 'Upload failed')
        const uploadRes = await fetch(urlData.signedUrl, {
          method: 'PUT', body: compressed,
          headers: { 'Content-Type': compressed.type || photoFile.type },
        })
        if (!uploadRes.ok) throw new Error('Upload to storage failed')
        await fetch('/api/save-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId, phase: 'table',
            storagePath: urlData.path,
            mimeType: compressed.type || photoFile.type,
            caption: text.trim() || null,
            authorName: urlData.authorName,
            token: isHost ? undefined : guestToken,
            authorId: isHost ? hostUserId : undefined,
          }),
        })
        clearPhoto()
      } else {
        const res = await fetch('/api/post-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId, body: text.trim(), channel: 'attendees',
            ...(isHost ? { authorId: hostUserId } : { token: guestToken }),
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error || 'Could not post')
        }
      }
      setText('')
      await fetchFeed()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const canPost = isHost || (!!guestToken && !!guestName)

  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', margin: '0 0 20px' }}>
        From the table
      </p>

      {/* Feed */}
      {items.length === 0 ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', padding: '24px 0', margin: 0, fontStyle: 'italic' }}>
          Nothing here yet. Be the first to leave a note.
        </p>
      ) : (
        <div>
          {items.map(item =>
            item.kind === 'message'
              ? <MessageItem key={`msg-${item.id}`} item={item} />
              : <PhotoItem key={`photo-${item.id}`} item={item} />
          )}
        </div>
      )}

      {/* Compose area */}
      {canPost ? (
        <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          {photoPreview && (
            <div style={{ marginBottom: 8, position: 'relative', display: 'inline-block' }}>
              <img src={photoPreview} alt="" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6, display: 'block' }} />
              <button
                type="button"
                onClick={clearPhoto}
                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 14, lineHeight: '22px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ×
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }}
              placeholder={photoFile ? 'A caption, if you like…' : 'Leave a note for the table…'}
              rows={2}
              style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 13, color: 'var(--wcs-green-dark)', resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <label title="Add a photograph" style={{ display: 'block', cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, border: `1px solid ${photoFile ? 'var(--wcs-copper)' : 'var(--wcs-cream-dark)'}`, borderRadius: 6, background: photoFile ? 'var(--wcs-copper)' : 'var(--wcs-white)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
                    <rect x="0.5" y="2.5" width="15" height="11" rx="1.5" stroke={photoFile ? '#fff' : 'var(--wcs-green-muted)'} strokeWidth="1.2"/>
                    <circle cx="8" cy="8" r="2.5" stroke={photoFile ? '#fff' : 'var(--wcs-green-muted)'} strokeWidth="1.2"/>
                    <path d="M5.5 2.5L6.5.5h3l1 2" stroke={photoFile ? '#fff' : 'var(--wcs-green-muted)'} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
              <button
                type="submit"
                disabled={(!text.trim() && !photoFile) || uploading}
                style={{ width: 36, height: 36, background: (text.trim() || photoFile) && !uploading ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, cursor: (text.trim() || photoFile) && !uploading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1 }}
              >
                {uploading ? '…' : '↑'}
              </button>
            </div>
          </div>
          {error && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 6, fontFamily: 'Inter, system-ui' }}>{error}</p>}
        </form>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', marginTop: 16, fontFamily: 'Inter, system-ui', fontStyle: 'italic' }}>
          RSVP to join the conversation.
        </p>
      )}
    </div>
  )
}

function MessageItem({ item: m }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '0.5px solid var(--wcs-cream-dark)', display: 'flex', gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: m.author_role === 'host' ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: m.author_role === 'host' ? 'var(--wcs-cream)' : 'var(--wcs-green-mid)', fontFamily: 'Inter, system-ui' }}>
        {(m.author_name || 'G')[0].toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui' }}>{m.author_name || 'Guest'}</span>
          {m.author_role === 'host' && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', border: '1px solid var(--wcs-copper)', borderRadius: 3, padding: '1px 5px' }}>Host</span>
          )}
          {m.is_pinned && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui' }}>· Pinned</span>
          )}
          <span style={{ fontSize: 10, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginLeft: 'auto' }}>{formatTime(m.created_at)}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--wcs-green-mid)', lineHeight: 1.6, margin: 0, fontFamily: 'Inter, system-ui', wordBreak: 'break-word' }}>{m.body}</p>
      </div>
    </div>
  )
}

function PhotoItem({ item: p }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '0.5px solid var(--wcs-cream-dark)' }}>
      <img src={p.url} alt={p.caption || ''} style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 8, display: 'block', marginBottom: 8 }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          {p.caption && (
            <p style={{ fontSize: 13, color: 'var(--wcs-green-mid)', lineHeight: 1.5, margin: '0 0 4px', fontFamily: 'Inter, system-ui' }}>{p.caption}</p>
          )}
          <span style={{ fontSize: 10, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>{p.author_name} · {formatTime(p.uploaded_at)}</span>
        </div>
      </div>
    </div>
  )
}
