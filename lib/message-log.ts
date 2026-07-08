/**
 * Shared in-memory message log store.
 * Tracks all incoming messages, outgoing replies, and delivery status.
 * Resets on Lambda cold start — use /api/debug to view live.
 */

export type MessageDirection = 'INCOMING' | 'OUTGOING'
export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED'

export type MessageLogEntry = {
  id: string
  timestamp: string           // ISO string
  direction: MessageDirection
  phone: string               // user phone number
  name: string                // user display name
  text: string                // message content
  type: string                // text_message / simple_button_message / system
  status: DeliveryStatus
  error?: string              // if FAILED, why
  messageId?: string          // WhatsApp message_id
  durationMs?: number         // how long the send took
}

// ─── Global in-memory store (shared within same Lambda instance) ──────────────
export const messageLog: MessageLogEntry[] = []

let _counter = 0

function nextId(): string {
  return `msg_${Date.now()}_${++_counter}`
}

// ─── Log an incoming message from user ───────────────────────────────────────
export function logIncoming(opts: {
  phone: string
  name: string
  text: string
  type: string
  messageId?: string
}): string {
  const id = nextId()
  messageLog.unshift({
    id,
    timestamp: new Date().toISOString(),
    direction: 'INCOMING',
    phone: opts.phone,
    name: opts.name || 'Unknown',
    text: opts.text,
    type: opts.type,
    status: 'DELIVERED',   // if we received it, it was delivered to us
    messageId: opts.messageId,
  })
  trim()
  console.log(`[MSG-IN] ${opts.phone} (${opts.name}): "${opts.text}"`)
  return id
}

// ─── Log an outgoing message bot sent to user ────────────────────────────────
export function logOutgoing(opts: {
  phone: string
  name: string
  text: string
  type?: string
}): { id: string; markDelivered: () => void; markFailed: (err: string) => void } {
  const id = nextId()
  const start = Date.now()

  const entry: MessageLogEntry = {
    id,
    timestamp: new Date().toISOString(),
    direction: 'OUTGOING',
    phone: opts.phone,
    name: opts.name || 'Unknown',
    text: opts.text,
    type: opts.type || 'text_message',
    status: 'PENDING',
  }

  messageLog.unshift(entry)
  trim()

  return {
    id,
    markDelivered: () => {
      entry.status = 'DELIVERED'
      entry.durationMs = Date.now() - start
      console.log(`[MSG-OUT ✅] → ${opts.phone}: "${opts.text}" (${entry.durationMs}ms)`)
    },
    markFailed: (err: string) => {
      entry.status = 'FAILED'
      entry.error = err
      entry.durationMs = Date.now() - start
      console.error(`[MSG-OUT ❌] → ${opts.phone}: "${opts.text}" — ${err}`)
    },
  }
}

// ─── Log a system/error event ─────────────────────────────────────────────────
export function logSystem(text: string, phone = 'SYSTEM', error?: string): void {
  messageLog.unshift({
    id: nextId(),
    timestamp: new Date().toISOString(),
    direction: 'OUTGOING',
    phone,
    name: 'SERVER',
    text,
    type: 'system',
    status: error ? 'FAILED' : 'DELIVERED',
    error,
  })
  trim()
  if (error) console.error(`[SYSTEM ❌] ${text}: ${error}`)
  else console.log(`[SYSTEM] ${text}`)
}

// ─── Keep max 200 entries ─────────────────────────────────────────────────────
function trim(): void {
  if (messageLog.length > 200) messageLog.splice(200)
}
