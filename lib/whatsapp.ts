import WhatsappCloudAPI from 'whatsappcloudapi_wrapper'

// ─── Lazy singleton — only created when first used ────────────────────────────
// This prevents the constructor from throwing at module load if env vars are missing,
// which would crash the entire Lambda cold start.
let _whatsapp: InstanceType<typeof WhatsappCloudAPI> | null = null

function getWhatsapp(): InstanceType<typeof WhatsappCloudAPI> {
  if (!_whatsapp) {
    if (!process.env.META_WA_ACCESS_TOKEN) {
      throw new Error('META_WA_ACCESS_TOKEN env var is not set')
    }
    if (!process.env.META_WA_SENDER_PHONE_NUMBER_ID) {
      throw new Error('META_WA_SENDER_PHONE_NUMBER_ID env var is not set')
    }
    _whatsapp = new WhatsappCloudAPI({
      accessToken: process.env.META_WA_ACCESS_TOKEN,
      senderPhoneNumberId: process.env.META_WA_SENDER_PHONE_NUMBER_ID,
      WABA_ID: process.env.META_WA_WABA_ID,
    })
  }
  return _whatsapp
}

/**
 * Whatsapp instance — accessed lazily so missing env vars don't crash cold start.
 * Use this for parseMessage(), markMessageAsRead(), etc.
 */
export const Whatsapp = {
  parseMessage: (body: unknown) => getWhatsapp().parseMessage(body),
  markMessageAsRead: (opts: { message_id: string }) =>
    getWhatsapp().markMessageAsRead(opts),
}

/**
 * Send a plain text message to a WhatsApp number.
 */
export async function sendMessageToPhoneNumber(
  recipientPhone: string,
  message: string,
): Promise<void> {
  await getWhatsapp().sendText({ recipientPhone, message })
}

/**
 * Send an interactive button message to a WhatsApp number.
 */
export async function sendSimpleButtonsMessage(
  recipientPhone: string,
  message: string,
  buttons: { title: string; id: string }[],
): Promise<void> {
  await getWhatsapp().sendSimpleButtons({
    recipientPhone,
    message,
    listOfButtons: buttons,
  })
}

/**
 * Send an image to a WhatsApp number via a public URL.
 * No file storage needed — Meta fetches the image from the URL directly.
 */
export async function sendImageToPhoneNumber(
  recipientPhone: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  const accessToken = process.env.META_WA_ACCESS_TOKEN
  const phoneNumberId = process.env.META_WA_SENDER_PHONE_NUMBER_ID

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'image',
    image: {
      link: imageUrl,
      ...(caption ? { caption } : {}),
    },
  }

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`WhatsApp image send failed: ${err}`)
  }
}

