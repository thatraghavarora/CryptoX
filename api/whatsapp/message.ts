/**
 * This endpoint is kept for backward compatibility only.
 * All WhatsApp message handling has been consolidated into /api/whatsapp (index.ts).
 *
 * Meta webhook POST → /api/whatsapp → processes message directly (no internal forwarding).
 */
import type { VercelApiHandler, VercelResponse } from '@vercel/node'
import { WhatsappNewMessageEventNotificationRequest } from './types'

const handler: VercelApiHandler = async (
  _req: WhatsappNewMessageEventNotificationRequest,
  res: VercelResponse,
) => {
  console.log('⚠️  /api/whatsapp/message called — this endpoint is deprecated.')
  console.log('All message handling now runs in /api/whatsapp directly.')
  res.status(200).send('ok')
}

export default handler
