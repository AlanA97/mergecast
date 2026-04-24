import type Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { getPlanFromPriceId } from '@/lib/plans'

export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  if (!session.subscription || !session.customer || !session.metadata?.workspace_id) return

  const supabase = createSupabaseServiceClient()
  const { getStripeClient } = await import('./client')
  const stripe = getStripeClient()
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
  const priceId = subscription.items.data[0]?.price.id ?? ''
  const plan = getPlanFromPriceId(priceId)

  await supabase
    .from('workspaces')
    .update({
      plan,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      stripe_price_id: priceId,
    })
    .eq('id', session.metadata.workspace_id)
}

export async function handleSubscriptionUpserted(
  subscription: Stripe.Subscription
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id ?? ''
  const plan = getPlanFromPriceId(priceId)
  const supabase = createSupabaseServiceClient()

  await supabase
    .from('workspaces')
    .update({
      plan,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
    })
    .eq('stripe_customer_id', subscription.customer as string)
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  await supabase
    .from('workspaces')
    .update({ plan: 'free', stripe_subscription_id: null, stripe_price_id: null })
    .eq('stripe_customer_id', subscription.customer as string)
}
