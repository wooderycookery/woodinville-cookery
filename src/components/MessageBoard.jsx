import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })
}

export default function MessageBoard({ eventId, isHost, hostUserId, guestToken, guestName }) {
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('id, body, author_name, author_role, is_pinned, created_at')
      .eq('event_id', eventId)
      .eq('channel', 'attendees')
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }, [eventId])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const sub = supabase
      .channel(`messages:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${eventId}` },
        payload => {
          if (payload.new.channel === 'attendees') {
            setMessages(prev =>
              prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new]
            )
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [eventId])

  async function handleSend(e) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    setError('')
    try {
      const payload = {
        eventId,
        body: body.trim(),
        channel: 'attendees',
        ...(isHost && hostUserId ? { authorId: hostUserId } : { token: guestToken }),
      }
      const res = await fetch('/api/post-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send message')
      setBody('')
      fetchMessages()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  const canPost = isHost || (!!guestToken && !!guestName)
  const pinned  = messages.filter(m => m.is_pinned)
  const regular = messages.filter(m => !m.is_pinned)

  return (
    <div style={{ marginTop: 28 }}>
      <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', margin: '0 0 16px' }}>
        Message board
      </p>

      <div style={{ border: '1px solid var(--wcs-cream-dark)', borderRadius: 8, background: 'var(--wcs-white)', overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', padding: '32px 20px', margin: 0, fontStyle: 'italic' }}>
            Nothing here yet. Be the first to leave a note.
          </p>
        ) : (
          <div>
            {pinned.map(m => <MessageRow key={m.id} message={m} pinned />)}
            {regular.map(m => <MessageRow key={m.id} message={m} />)}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {canPost ? (
        <form onSubmit={handleSend} style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={body}
            onChange={e => { setBody(e.target.value); setError('') }}
            onKeyDown={handleKeyDown}
            placeholder="Leave a note for the table…"
            rows={2}
            style={{
              flex: 1,
              padding: '9px 12px',
              border: '1px solid var(--wcs-cream-dark)',
              borderRadius: 6,
              background: 'var(--wcs-white)',
              fontFamily: 'Inter, system-ui',
              fontSize: 13,
              color: 'var(--wcs-green-dark)',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.6,
            }}
          />
          <button
            type="submit"
            disabled={!body.trim() || sending}
            style={{
              padding: '9px 18px',
              background: body.trim() && !sending ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)',
              color: 'var(--wcs-cream)',
              border: 'none',
              borderRadius: 6,
              fontFamily: 'Inter, system-ui',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: body.trim() && !sending ? 'pointer' : 'not-allowed',
              flexShrink: 0,
              alignSelf: 'flex-end',
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </form>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', marginTop: 10, fontFamily: 'Inter, system-ui', fontStyle: 'italic' }}>
          RSVP to join the conversation.
        </p>
      )}

      {error && (
        <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 6, fontFamily: 'Inter, system-ui' }}>{error}</p>
      )}
    </div>
  )
}

function MessageRow({ message: m, pinned }) {
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '0.5px solid var(--wcs-cream-dark)',
      background: pinned ? 'rgba(179,131,74,0.06)' : undefined,
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: m.author_role === 'host' ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 600,
        color: m.author_role === 'host' ? 'var(--wcs-cream)' : 'var(--wcs-green-mid)',
        fontFamily: 'Inter, system-ui',
      }}>
        {(m.author_name || 'G')[0].toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui' }}>
            {m.author_name || 'Guest'}
          </span>
          {m.author_role === 'host' && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', border: '1px solid var(--wcs-copper)', borderRadius: 3, padding: '1px 5px' }}>
              Host
            </span>
          )}
          {pinned && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui' }}>
              · Pinned
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginLeft: 'auto' }}>
            {formatTime(m.created_at)}
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--wcs-green-mid)', lineHeight: 1.6, margin: 0, fontFamily: 'Inter, system-ui', wordBreak: 'break-word' }}>
          {m.body}
        </p>
      </div>
    </div>
  )
}
