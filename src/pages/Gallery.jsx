import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import imageCompression from 'browser-image-compression'

const ACCEPTED = 'image/jpeg,image/jpg,image/png,image/webp,image/heic'
const MAX_MB = 20

const CopperRule = () => (
  <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '16px auto' }} />
)

export default function Gallery() {
  const { eventId, type } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || localStorage.getItem('wcs_guest_token')

  const [eventName, setEventName] = useState('')
  const [isOpen, setIsOpen]       = useState(false)
  const [photos, setPhotos]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [notFound, setNotFound]   = useState(false)

  const [isHost, setIsHost]       = useState(false)
  const [hostUserId, setHostUserId] = useState(null)
  const [isGuest, setIsGuest]     = useState(false)
  const [authorName, setAuthorName] = useState('')

  const [uploading, setUploading]     = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [captionInput, setCaptionInput] = useState('')
  const fileInputRef = useRef(null)

  const phase = type === 'post' ? 'post' : 'pre'
  const phaseLabel = phase === 'pre' ? 'Pre-event' : 'Post-event'

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/get-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, phase }),
      })
      if (!res.ok) { setNotFound(true); setLoading(false); return }
      const data = await res.json()
      setEventName(data.eventName)
      setIsOpen(data.isOpen)
      setPhotos(data.photos || [])
      setLoading(false)

      // Determine identity
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: event } = await supabase
          .from('events')
          .select('host_id')
          .eq('id', eventId)
          .single()
        if (event?.host_id === user.id) {
          setIsHost(true)
          setHostUserId(user.id)
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single()
          setAuthorName(profile?.display_name || 'Host')
          return
        }
      }

      if (token) {
        const valRes = await fetch('/api/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const valData = await valRes.json()
        if (valData.valid && ['attending', 'maybe'].includes(valData.rsvpStatus)) {
          setIsGuest(true)
          setAuthorName(valData.guestName || 'Guest')
        }
      }
    }
    load()
  }, [eventId, phase, token])

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`File must be under ${MAX_MB} MB.`)
      return
    }

    setUploadError('')
    setUploading(true)
    setUploadProgress(10)

    try {
      // Compress client-side
      const compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        onProgress: p => setUploadProgress(10 + Math.floor(p * 0.4)),
      })
      setUploadProgress(50)

      // Get signed upload URL
      const urlRes = await fetch('/api/gallery-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          phase,
          filename: file.name,
          token: isGuest ? token : undefined,
          authorId: isHost ? hostUserId : undefined,
        }),
      })
      const urlData = await urlRes.json()
      if (!urlRes.ok) throw new Error(urlData.error || 'Could not get upload URL')
      setUploadProgress(60)

      // Upload directly to Supabase storage
      const uploadRes = await fetch(urlData.signedUrl, {
        method: 'PUT',
        body: compressed,
        headers: { 'Content-Type': compressed.type || file.type },
      })
      if (!uploadRes.ok) throw new Error('Upload to storage failed')
      setUploadProgress(85)

      // Save photo record
      const saveRes = await fetch('/api/save-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          phase,
          storagePath: urlData.path,
          mimeType: compressed.type || file.type,
          caption: captionInput.trim() || null,
          authorName: urlData.authorName,
          token: isGuest ? token : undefined,
          authorId: isHost ? hostUserId : undefined,
        }),
      })
      const saveData = await saveRes.json()
      if (!saveRes.ok) throw new Error(saveData.error || 'Could not save photo')
      setUploadProgress(100)

      setPhotos(prev => [...prev, saveData.photo])
      setCaptionInput('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setTimeout(() => setUploadProgress(0), 800)
    }
  }

  async function handleFeatureToggle(photoId, currentFeatured) {
    if (!isHost) return
    await supabase
      .from('photos')
      .update({ featured: !currentFeatured })
      .eq('id', photoId)
    setPhotos(prev =>
      prev
        .map(p => p.id === photoId ? { ...p, featured: !currentFeatured } : p)
        .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
    )
  }

  function formatTime(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--wcs-cream)' }}>
      <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--wcs-cream-dark)', borderTopColor: 'var(--wcs-green-dark)' }} />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--wcs-cream)' }}>
      <div className="text-center">
        <p className="font-serif text-xl" style={{ color: 'var(--wcs-green-dark)' }}>Gallery not found.</p>
        <Link to="/" style={{ fontSize: 12, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui' }}>← Back</Link>
      </div>
    </div>
  )

  const canUpload = isOpen && (isHost || isGuest)

  return (
    <div className="min-h-screen" style={{ background: 'var(--wcs-cream)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 60px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <Link to={`/event/${eventId}${token ? `?token=${token}` : ''}`} style={{ display: 'inline-block', lineHeight: 0, marginBottom: 24 }}>
            <img src="/wcs_logo.png" alt="Woodinville Cookery Society" style={{ width: 120, height: 'auto' }} />
          </Link>
          <CopperRule />
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 8, fontFamily: 'Inter, system-ui' }}>
            {phaseLabel} · {eventName}
          </p>
          <h1 className="font-serif" style={{ fontSize: 28, color: 'var(--wcs-green-dark)', marginBottom: 4 }}>
            {phase === 'pre' ? 'Photographs' : 'What we remember'}
          </h1>
          <Link
            to={`/event/${eventId}${token ? `?token=${token}` : ''}`}
            style={{ fontSize: 11, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', letterSpacing: '0.08em', textDecoration: 'none' }}
          >
            ← Back to the invitation
          </Link>
        </div>

        {/* Upload area */}
        {canUpload && (
          <div style={{ marginTop: 36, background: 'var(--wcs-white)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 10, padding: '24px' }}>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 14, fontFamily: 'Inter, system-ui' }}>
              Add a photograph
            </p>
            <input
              type="text"
              placeholder="A caption, if you like"
              value={captionInput}
              onChange={e => setCaptionInput(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-cream)', fontFamily: 'Inter, system-ui', fontSize: 14, color: 'var(--wcs-green-dark)', boxSizing: 'border-box', marginBottom: 12, outline: 'none' }}
            />
            <label style={{ display: 'block', cursor: uploading ? 'not-allowed' : 'pointer' }}>
              <div style={{ border: '1px dashed var(--wcs-cream-dark)', borderRadius: 6, padding: '20px 16px', textAlign: 'center', background: 'var(--wcs-cream)', opacity: uploading ? 0.6 : 1 }}>
                {uploading ? (
                  <div>
                    <div style={{ height: 3, background: 'var(--wcs-cream-dark)', borderRadius: 2, marginBottom: 10 }}>
                      <div style={{ height: 3, background: 'var(--wcs-copper)', borderRadius: 2, width: `${uploadProgress}%`, transition: 'width 0.3s ease' }} />
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>Uploading…</span>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui', display: 'block' }}>Choose a photograph</span>
                    <span style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginTop: 4, display: 'block' }}>
                      JPEG · PNG · WEBP · HEIC · max {MAX_MB} MB
                    </span>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                onChange={handleFileSelect}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
            {uploadError && (
              <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8, fontFamily: 'Inter, system-ui' }}>{uploadError}</p>
            )}
          </div>
        )}

        {/* Gallery closed state */}
        {!isOpen && !isHost && (
          <div style={{ marginTop: 48, textAlign: 'center' }}>
            <p className="font-serif" style={{ fontSize: 18, color: 'var(--wcs-green-dark)' }}>
              The gallery hasn't opened yet.
            </p>
            <p style={{ fontSize: 13, color: 'var(--wcs-green-muted)', marginTop: 8, fontFamily: 'Inter, system-ui' }}>
              You'll receive a note when photographs are available.
            </p>
          </div>
        )}

        {/* Photo grid */}
        {photos.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
            }}>
              {photos.map(photo => (
                <div key={photo.id} style={{ position: 'relative', background: 'var(--wcs-white)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--wcs-cream-dark)' }}>
                  <img
                    src={photo.url}
                    alt={photo.caption || ''}
                    loading="lazy"
                    style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                  />
                  {photo.featured && (
                    <div style={{ position: 'absolute', top: 8, left: 8, background: 'var(--wcs-copper)', color: '#fff', fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 3, fontFamily: 'Inter, system-ui' }}>
                      Featured
                    </div>
                  )}
                  <div style={{ padding: '10px 12px' }}>
                    {photo.caption && (
                      <p style={{ fontSize: 12, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui', margin: '0 0 4px', lineHeight: 1.4 }}>
                        {photo.caption}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>
                        {photo.author_name} · {formatTime(photo.uploaded_at)}
                      </span>
                      {isHost && (
                        <button
                          onClick={() => handleFeatureToggle(photo.id, photo.featured)}
                          style={{ fontSize: 10, color: photo.featured ? 'var(--wcs-copper)' : 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, system-ui', letterSpacing: '0.06em', padding: 0 }}
                        >
                          {photo.featured ? '★ Featured' : '☆ Feature'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {isOpen && photos.length === 0 && (
          <div style={{ marginTop: 48, textAlign: 'center' }}>
            <p className="font-serif" style={{ fontSize: 18, color: 'var(--wcs-green-dark)' }}>
              {phase === 'pre'
                ? 'No photographs yet. Be the first.'
                : 'Nothing shared yet. Add what you remember.'}
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--wcs-cream-dark)', marginTop: 56, paddingTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui' }}>
            Woodinville Cookery Society · woodinvillecookery.com
          </p>
        </div>

      </div>
    </div>
  )
}
