import { useEffect, useState, useCallback } from 'react'

const CATEGORIES = ['Mains', 'Sides', 'Drinks', 'Dessert', 'Other']

export default function ForTheTable({ eventId, isHost, hostUserId, guestToken, guestRsvpId }) {
  const [contributions, setContributions] = useState([])
  const [loading, setLoading]             = useState(true)

  const [item, setItem]         = useState('')
  const [category, setCategory] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [aiOpen, setAiOpen]           = useState(false)
  const [aiPrefs, setAiPrefs]         = useState('')
  const [aiLoading, setAiLoading]     = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiError, setAiError]         = useState('')

  const [deletingId, setDeletingId]   = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const fetchContributions = useCallback(async () => {
    try {
      const res = await fetch(`/api/get-table-contributions?eventId=${eventId}`)
      if (!res.ok) return
      const data = await res.json()
      setContributions(data.contributions || [])
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { fetchContributions() }, [fetchContributions])

  const hostItems  = contributions.filter(c => c.is_host_provided)
  const guestItems = contributions.filter(c => !c.is_host_provided)
  const canSubmit  = isHost || !!guestToken

  async function handleSubmit(e) {
    e.preventDefault()
    if (!item.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/add-table-contribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          item: item.trim(),
          category: category || null,
          token: isHost ? undefined : guestToken,
          authorId: isHost ? hostUserId : undefined,
          isHostProvided: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not add item')
      setContributions(prev => [...prev, data.contribution])
      setItem('')
      setCategory('')
      setAiSuggestions([])
      setAiOpen(false)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(contributionId) {
    setDeletingId(contributionId)
    try {
      const res = await fetch('/api/delete-table-contribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributionId,
          token: isHost ? undefined : guestToken,
          authorId: isHost ? hostUserId : undefined,
          eventId,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setContributions(prev => prev.filter(c => c.id !== contributionId))
      setConfirmDeleteId(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleAiSuggest(skipPrefs = false) {
    setAiLoading(true)
    setAiError('')
    setAiSuggestions([])
    try {
      const res = await fetch('/api/table-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, preferences: skipPrefs ? '' : aiPrefs }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not get suggestions')
      setAiSuggestions(data.suggestions || [])
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) return null

  if (!hostItems.length && !guestItems.length && !canSubmit) return null

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 24px' }} />

      <p style={{ textAlign: 'center', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 20 }}>
        For the Table
      </p>

      {/* Host-provided items */}
      {hostItems.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 8 }}>
            Provided by your hosts
          </p>
          <p style={{ fontSize: 14, color: 'var(--wcs-green-mid)', lineHeight: 1.8, fontFamily: 'Inter, system-ui', margin: 0 }}>
            {hostItems.map(c => c.item).join(' · ')}
          </p>
        </div>
      )}

      {/* Guest submissions */}
      <div style={{ marginBottom: canSubmit ? 24 : 0 }}>
        {guestItems.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 10 }}>
              From the guests
            </p>
            <div>
          <div>
            {guestItems.map((c, i) => {
              const isOwn = !isHost && c.rsvp_id === guestRsvpId
              const canDelete = isHost || isOwn
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < guestItems.length - 1 ? '0.5px solid var(--wcs-cream-dark)' : 'none' }}>
                  {confirmDeleteId === c.id ? (
                    <>
                      <span style={{ fontSize: 13, color: '#b91c1c', fontFamily: 'Inter, system-ui' }}>Remove this?</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} style={smallBtnStyle('#b91c1c')}>
                          {deletingId === c.id ? '…' : 'Yes'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} style={smallBtnStyle('var(--wcs-green-muted)')}>No</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span style={{ fontSize: 14, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui' }}>{c.item}</span>
                        {c.category && (
                          <span style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginLeft: 8 }}>{c.category}</span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginLeft: 8 }}>{c.name}</span>
                      </div>
                      {canDelete && (
                        <button onClick={() => setConfirmDeleteId(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--wcs-green-muted)', lineHeight: 0, borderRadius: 4, flexShrink: 0, marginLeft: 12 }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M1.75 3.5h10.5M5.25 3.5V2.333A.583.583 0 0 1 5.833 1.75h2.334A.583.583 0 0 1 8.75 2.333V3.5m-5.833 0 .583 8.167a.583.583 0 0 0 .583.583h5.834a.583.583 0 0 0 .583-.583L11.083 3.5H2.917Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            </div>
          </>
        )}
      </div>

      {/* Submission form — always visible for guests with token; empty state for those without */}
      {!isHost && (canSubmit ? (
        <form onSubmit={handleSubmit} style={{ marginTop: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 10 }}>
            What are you bringing?
          </p>
          <input
            type="text"
            value={item}
            onChange={e => { setItem(e.target.value); setSubmitError('') }}
            placeholder="A dish, drink, or something to share..."
            style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 14, color: 'var(--wcs-green-dark)', boxSizing: 'border-box', outline: 'none', marginBottom: 8 }}
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 14, color: category ? 'var(--wcs-green-dark)' : 'var(--wcs-green-muted)', boxSizing: 'border-box', outline: 'none', marginBottom: 12, appearance: 'none' }}
          >
            <option value="">Category (optional)</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* AI assist */}
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => { setAiOpen(o => !o); setAiSuggestions([]); setAiError('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <span style={{ fontSize: 14 }}>✦</span> Need help deciding?
            </button>

            {aiOpen && (
              <div style={{ marginTop: 10, padding: '14px 16px', background: 'var(--wcs-cream)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 8 }}>
                <p style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 10 }}>
                  Any preferences or things to avoid?
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input
                    type="text"
                    value={aiPrefs}
                    onChange={e => setAiPrefs(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAiSuggest(false) } }}
                    placeholder="e.g. vegetarian, no nuts..."
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 13, color: 'var(--wcs-green-dark)', outline: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAiSuggest(false)}
                    disabled={aiLoading}
                    style={{ padding: '8px 14px', background: 'var(--wcs-green-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: aiLoading ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                  >
                    {aiLoading ? '…' : 'Go'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleAiSuggest(true)}
                  disabled={aiLoading}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'underline' }}
                >
                  Surprise me
                </button>

                {aiError && (
                  <p style={{ fontSize: 12, color: '#b91c1c', fontFamily: 'Inter, system-ui', marginTop: 8 }}>{aiError}</p>
                )}

                {aiSuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {aiSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setItem(s); setAiOpen(false); setAiSuggestions([]) }}
                        style={{ padding: '6px 14px', background: 'var(--wcs-white)', border: '1px solid var(--wcs-copper)', borderRadius: 20, fontFamily: 'Inter, system-ui', fontSize: 13, color: 'var(--wcs-copper)', cursor: 'pointer' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {submitError && <p style={{ fontSize: 12, color: '#b91c1c', fontFamily: 'Inter, system-ui', marginBottom: 8 }}>{submitError}</p>}

          <button
            type="submit"
            disabled={!item.trim() || submitting}
            style={{ padding: '11px 28px', background: item.trim() && !submitting ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: item.trim() && !submitting ? 'pointer' : 'not-allowed' }}
          >
            {submitting ? '…' : 'Bring this'}
          </button>
        </form>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', fontStyle: 'italic', margin: 0 }}>
          Be the first to add something.
        </p>
      ))}
    </div>
  )
}

const smallBtnStyle = (color) => ({
  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
  color, background: 'none', border: `1px solid ${color}`, borderRadius: 4,
  padding: '4px 10px', cursor: 'pointer', fontFamily: 'Inter, system-ui',
})
