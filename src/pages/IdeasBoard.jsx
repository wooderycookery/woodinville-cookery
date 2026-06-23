import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

function tagStyle(color = 'var(--wcs-green-muted)') {
  return {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color,
    background: 'var(--wcs-cream-mid)',
    border: '0.5px solid var(--wcs-cream-dark)',
    borderRadius: 3,
    padding: '2px 7px',
    fontFamily: 'Inter, system-ui',
    marginRight: 4,
  }
}

function interestLabel(count) {
  if (count === 0) return null
  if (count === 1) return 'One member would be into this'
  if (count < 5) return `${count} members would be into this`
  return `Several members would be into this`
}

export default function IdeasBoard() {
  const [ideas, setIdeas]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [token, setToken]         = useState(null)
  const [guestName, setGuestName] = useState('')
  const [isAdmin, setIsAdmin]     = useState(false)
  const [toggling, setToggling]   = useState(null)

  const [formBody, setFormBody]   = useState('')
  const [formName, setFormName]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted]   = useState(false)

  const [impulse, setImpulse]         = useState('')
  const [suggesting, setSuggesting]   = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [suggestError, setSuggestError] = useState('')

  const [adminAction, setAdminAction] = useState(null)

  const fetchIdeas = useCallback(async (tok) => {
    const params = tok ? `?token=${encodeURIComponent(tok)}` : ''
    try {
      const res = await fetch(`/api/ideas${params}`)
      if (!res.ok) return
      const data = await res.json()
      setIdeas(data.ideas || [])
    } catch {}
  }, [])

  useEffect(() => {
    async function init() {
      // Check for authenticated admin
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setIsAdmin(true)

      // Restore guest token
      const stored = localStorage.getItem('wcs_guest_token')
      if (stored) {
        try {
          const r = await fetch('/api/validate-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: stored }),
          })
          const data = await r.json()
          if (data.valid) {
            setToken(stored)
            setGuestName(data.guestName || '')
            setFormName(data.guestName || '')
            await fetchIdeas(stored)
            setLoading(false)
            return
          }
        } catch {}
      }

      await fetchIdeas(null)
      setLoading(false)
    }
    init()
  }, [fetchIdeas])

  async function handleInterest(ideaId, currentlyInterested) {
    if (!token) return
    setToggling(ideaId)
    try {
      const res = await fetch('/api/idea-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ideaId }),
      })
      if (!res.ok) return
      const data = await res.json()
      setIdeas(prev => prev.map(idea => {
        if (idea.id !== ideaId) return idea
        const delta = data.interested ? 1 : -1
        return { ...idea, my_interest: data.interested, interest_count: idea.interest_count + delta }
      }))
    } catch {}
    setToggling(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token || !formBody.trim() || !formName.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: formBody,
          author_name: formName,
          token,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSubmitError(err.error || 'Something went wrong.')
        return
      }
      const data = await res.json()
      setIdeas(prev => [data.idea, ...prev])
      setFormBody('')
      setSuggestions([])
      setImpulse('')
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 4000)
    } catch {
      setSubmitError('Something went wrong.')
    }
    setSubmitting(false)
  }

  async function handleSuggest() {
    if (!impulse.trim()) return
    setSuggesting(true)
    setSuggestError('')
    setSuggestions([])
    try {
      const res = await fetch('/api/ideas-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ impulse }),
      })
      if (!res.ok) { setSuggestError('Could not reach the suggestion service.'); return }
      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch {
      setSuggestError('Could not reach the suggestion service.')
    }
    setSuggesting(false)
  }

  async function handleAdminPin(ideaId, currentPinned) {
    setAdminAction(ideaId + ':pin')
    await supabase.from('ideas').update({ pinned: !currentPinned }).eq('id', ideaId)
    setIdeas(prev => {
      const updated = prev.map(i => i.id === ideaId ? { ...i, pinned: !currentPinned } : i)
      return [
        ...updated.filter(i => i.pinned),
        ...updated.filter(i => !i.pinned),
      ]
    })
    setAdminAction(null)
  }

  async function handleAdminArchive(ideaId) {
    setAdminAction(ideaId + ':archive')
    await supabase.from('ideas').update({ archived: true }).eq('id', ideaId)
    setIdeas(prev => prev.filter(i => i.id !== ideaId))
    setAdminAction(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--wcs-cream)' }}>
        <p style={{ fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>…</p>
      </div>
    )
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--wcs-cream-dark)',
    borderRadius: 6,
    background: 'var(--wcs-white)',
    fontFamily: 'Inter, system-ui',
    fontSize: 14,
    color: 'var(--wcs-green-dark)',
    boxSizing: 'border-box',
    outline: 'none',
    lineHeight: 1.6,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)', padding: '48px 20px 80px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 24px' }} />
          <h1 className="font-serif" style={{ fontSize: 32, fontStyle: 'italic', color: 'var(--wcs-green-dark)', marginBottom: 12, lineHeight: 1.2 }}>
            Gather With Us
          </h1>
          <p style={{ fontSize: 14, color: 'var(--wcs-green-light)', fontFamily: 'Inter, system-ui', lineHeight: 1.7, maxWidth: 480, margin: '0 auto' }}>
            Float an idea.
          </p>
          <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '24px auto 0' }} />
        </div>

        {/* Ideas grid */}
        {ideas.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 48 }}>
            No ideas yet. Be the first to suggest a gathering.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" style={{ marginBottom: 56 }}>
            {ideas.map(idea => {
              const isToggling = toggling === idea.id
              const isArchiving = adminAction === idea.id + ':archive'
              const isPinning = adminAction === idea.id + ':pin'
              const count = idea.interest_count || 0
              const label = interestLabel(count)

              return (
                <div
                  key={idea.id}
                  style={{
                    background: 'var(--wcs-white)',
                    border: idea.pinned ? '1px solid var(--wcs-copper)' : '1px solid var(--wcs-cream-dark)',
                    borderRadius: 10,
                    padding: '22px 20px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    position: 'relative',
                  }}
                >
                  {idea.pinned && (
                    <span style={{ position: 'absolute', top: 12, right: 14, fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui' }}>
                      ✦ Pinned
                    </span>
                  )}

                  <p style={{ fontSize: 15, color: 'var(--wcs-green-dark)', fontFamily: 'Georgia, serif', lineHeight: 1.65, margin: 0, paddingRight: idea.pinned ? 48 : 0 }}>
                    {idea.body}
                  </p>

                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {idea.season && <span style={tagStyle('var(--wcs-copper)')}>{idea.season}</span>}
                    {idea.scale  && <span style={tagStyle()}>{idea.scale}</span>}
                  </div>

                  <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: 0 }}>
                    {idea.author_name}
                  </p>

                  <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                    {/* Interest toggle */}
                    {token ? (
                      <button
                        onClick={() => !isToggling && handleInterest(idea.id, idea.my_interest)}
                        disabled={isToggling}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          letterSpacing: '0.06em',
                          fontFamily: 'Inter, system-ui',
                          color: idea.my_interest ? 'var(--wcs-copper)' : 'var(--wcs-green-muted)',
                          background: idea.my_interest ? '#fdf5ee' : 'transparent',
                          border: idea.my_interest ? '1px solid #e8c9a8' : '1px solid var(--wcs-cream-dark)',
                          borderRadius: 5,
                          padding: '7px 12px',
                          cursor: isToggling ? 'default' : 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 13 }}>✦</span>
                        {idea.my_interest ? "I'd be into this" : "I'd be into this"}
                      </button>
                    ) : (
                      <button
                        disabled
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          letterSpacing: '0.06em',
                          fontFamily: 'Inter, system-ui',
                          color: 'var(--wcs-cream-dark)',
                          background: 'transparent',
                          border: '1px solid var(--wcs-cream-dark)',
                          borderRadius: 5,
                          padding: '7px 12px',
                          cursor: 'default',
                        }}
                        title="RSVP to an event to signal interest"
                      >
                        <span style={{ fontSize: 13 }}>✦</span>
                        I'd be into this
                      </button>
                    )}

                    {/* Interest count (non-admin: soft language; admin: exact) */}
                    {isAdmin && count > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginTop: 6, marginBottom: 0 }}>
                        {count} {count === 1 ? 'signal' : 'signals'}
                      </p>
                    )}
                    {!isAdmin && label && (
                      <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginTop: 6, marginBottom: 0 }}>
                        {label}
                      </p>
                    )}

                    {/* Admin controls */}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => !isPinning && handleAdminPin(idea.id, idea.pinned)}
                          disabled={isPinning}
                          style={{ fontSize: 11, fontFamily: 'Inter, system-ui', color: idea.pinned ? 'var(--wcs-copper)' : 'var(--wcs-green-muted)', background: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
                        >
                          {idea.pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          onClick={() => !isArchiving && handleAdminArchive(idea.id)}
                          disabled={isArchiving}
                          style={{ fontSize: 11, fontFamily: 'Inter, system-ui', color: '#b91c1c', background: 'none', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
                        >
                          {isArchiving ? '…' : 'Archive'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Submit form */}
        <div style={{ borderTop: '1px solid var(--wcs-cream-dark)', paddingTop: 40 }}>
          <form onSubmit={handleSubmit} style={{ maxWidth: 560, margin: '0 auto' }}>
              {/* AI assist */}
              <div style={{ marginBottom: 16, background: 'var(--wcs-cream-mid)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 8, padding: '16px 18px' }}>
                <p style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 10, lineHeight: 1.6 }}>
                  Have a vague sense of something you'd want, but not the words for it yet?
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={impulse}
                    onChange={e => { setImpulse(e.target.value); setSuggestions([]); setSuggestError('') }}
                    placeholder="something outdoors before the rain comes back…"
                    style={{ ...inputStyle, flex: 1, fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={suggesting || !impulse.trim()}
                    style={{
                      padding: '9px 16px',
                      background: impulse.trim() && !suggesting ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)',
                      color: 'var(--wcs-cream)',
                      border: 'none',
                      borderRadius: 6,
                      fontFamily: 'Inter, system-ui',
                      fontSize: 12,
                      fontWeight: 500,
                      letterSpacing: '0.06em',
                      cursor: impulse.trim() && !suggesting ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {suggesting ? '…' : '✦ Shape this'}
                  </button>
                </div>
                {suggestError && (
                  <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8, fontFamily: 'Inter, system-ui' }}>{suggestError}</p>
                )}
                {suggestions.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setFormBody(s); setSuggestions([]); setImpulse('') }}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          background: 'var(--wcs-white)',
                          border: '1px solid var(--wcs-cream-dark)',
                          borderRadius: 6,
                          fontSize: 13,
                          fontFamily: 'Georgia, serif',
                          color: 'var(--wcs-green-dark)',
                          lineHeight: 1.6,
                          cursor: 'pointer',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <textarea
                  value={formBody}
                  onChange={e => token && setFormBody(e.target.value)}
                  placeholder="What kind of evening would you want to gather for?"
                  rows={4}
                  required
                  disabled={!token}
                  style={{ ...inputStyle, resize: 'vertical', opacity: token ? 1 : 0.45 }}
                />
                {!token && (
                  <p style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginTop: 6 }}>
                    You'll need an invitation to post.
                  </p>
                )}
              </div>

              <div style={{ marginBottom: 20 }}>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Your name"
                  required
                  disabled={!token}
                  style={{ ...inputStyle, opacity: token ? 1 : 0.45 }}
                />
              </div>

              {submitError && (
                <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 12, fontFamily: 'Inter, system-ui' }}>{submitError}</p>
              )}

              {submitted && (
                <p style={{ fontSize: 13, color: 'var(--wcs-green-dark)', marginBottom: 12, fontFamily: 'Inter, system-ui', textAlign: 'center' }}>
                  Your idea is on the board.
                </p>
              )}

              <button
                type="submit"
                disabled={!token || submitting || !formBody.trim() || !formName.trim()}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '14px',
                  background: token && formBody.trim() && formName.trim() && !submitting ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)',
                  color: 'var(--wcs-cream)',
                  border: 'none',
                  borderRadius: 6,
                  fontFamily: 'Inter, system-ui',
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: formBody.trim() && formName.trim() && !submitting ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? 'Posting…' : 'Add to the board'}
              </button>
            </form>
        </div>

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
