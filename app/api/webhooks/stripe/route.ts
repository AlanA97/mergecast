import { NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe/client'
import {
  handleCheckoutCompleted,
  handleSubscriptionUpserted,
  handleSubscriptionDeleted,
} from '@/lib/stripe/webhooks'
import type Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET env var is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const stripe = getStripeClient()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpserted(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
        // Log but don't downgrade yet — Stripe retries 4 times over ~1 week
        console.warn(`Payment failed for customer: ${(event.data.object as Stripe.Invoice).customer}`)
        break

      default:
        // Unknown event — acknowledge
        break
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
