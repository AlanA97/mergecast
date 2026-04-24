import { getResendClient } from './client'
import { createSupabaseServiceClient } from '@/lib/supabase/server'

export interface SendConfirmationEmailParams {
  email: string
  workspaceName: string
  workspaceSlug: string
  token: string
}

export async function sendConfirmationEmail(input: SendConfirmationEmailParams): Promise<void> {
  const resend = getResendClient()
  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/public/confirm-subscription?token=${input.token}`
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: input.email,
    subject: `Confirm your subscription to ${input.workspaceName}`,
    html: `
      <p>Click below to confirm your subscription to the <strong>${input.workspaceName}</strong> changelog:</p>
      <p><a href="${confirmUrl}">Confirm subscription</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  })
}

export interface SendPublishEmailParams {
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  entry: {
    id: string
    title: string | null
    final_content: string | null
    published_at: string | null
  }
}

export async function sendPublishEmail(input: SendPublishEmailParams): Promise<void> {
  const service = createSupabaseServiceClient()

  const { data: subscribers } = await service
    .from('subscribers')
    .select('email, unsubscribe_token')
    .eq('workspace_id', input.workspaceId)
    .eq('confirmed', true)
    .is('unsubscribed_at', null)

  if (!subscribers || subscribers.length === 0) return

  const resend = getResendClient()
  const changelogUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${input.workspaceSlug}`

  const { data: sendRecord } = await service
    .from('email_sends')
    .insert({
      workspace_id: input.workspaceId,
      entry_id: input.entry.id,
      recipient_count: subscribers.length,
      status: 'pending',
    })
    .select()
    .single()

  try {
    const BATCH_SIZE = 100
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      await Promise.all(
        subscribers.slice(i, i + BATCH_SIZE).map(({ email, unsubscribe_token }) =>
          resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL!,
            to: email,
            subject: `${input.workspaceName}: ${input.entry.title ?? 'New update'}`,
            html: buildEmailHtml({
              workspaceName: input.workspaceName,
              entryTitle: input.entry.title ?? 'New update',
              entryContent: input.entry.final_content ?? '',
              changelogUrl,
              unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/public/unsubscribe?token=${unsubscribe_token}`,
            }),
          })
        )
      )
    }
    if (sendRecord) {
      await service
        .from('email_sends')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', sendRecord.id)
    }
  } catch (err) {
    if (sendRecord) {
      await service
        .from('email_sends')
        .update({ status: 'failed', error_message: String(err) })
        .eq('id', sendRecord.id)
    }
    throw err
  }
}

function buildEmailHtml(input: {
  workspaceName: string
  entryTitle: string
  entryContent: string
  changelogUrl: string
  unsubscribeUrl: string
}): string {
  const escapedContent = input.entryContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
    <h1 style="font-size:20px;font-weight:600;margin-bottom:8px;">${input.entryTitle}</h1>
    <p style="color:#555;font-size:14px;margin-bottom:16px;">${escapedContent}</p>
    <a href="${input.changelogUrl}" style="color:#000;font-size:14px;">View on changelog →</a>
    <hr style="margin:32px 0;border:none;border-top:1px solid #eee;">
    <p style="font-size:12px;color:#999;">
      You subscribed to ${input.workspaceName} updates.
      <a href="${input.unsubscribeUrl}" style="color:#999;">Unsubscribe</a>
    </p>
  </body></html>`
}
