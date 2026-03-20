/**
 * Narrate — stripe-webhook Edge Function
 *
 * Handles Stripe webhook events for subscription management.
 * Events handled:
 *   - customer.subscription.created → Pro activation (30,000 seconds)
 *   - invoice.paid → Monthly credit refresh
 *   - customer.subscription.deleted → Downgrade to free
 *   - customer.subscription.updated → Plan changes
 *
 * POST /functions/v1/stripe-webhook
 * Auth: Stripe-Signature header verification
 */

import { createServiceClient } from '../_shared/supabase-client.ts';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const PRO_MONTHLY_SECONDS = 30_000; // 500 minutes

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // ---------------------------------------------------------------
    // 1. Verify Stripe signature — ALWAYS verify before processing
    // ---------------------------------------------------------------
    const body = await req.text();
    const signature = req.headers.get('Stripe-Signature');

    if (!signature) {
      return new Response('Missing Stripe-Signature header', { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
    }

    const supabase = createServiceClient();

    // ---------------------------------------------------------------
    // 2. Handle events
    // ---------------------------------------------------------------
    switch (event.type) {
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Look up the user by stripe_customer_id
        const userId = await getUserIdByCustomerId(supabase, customerId);
        if (!userId) {
          console.error('No user found for customer:', customerId);
          return new Response('Customer not found', { status: 404 });
        }

        // Activate Pro: set status, credit 30,000 seconds, set period reset
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        const { error } = await supabase
          .from('user_credits')
          .update({
            subscription_status: 'pro',
            monthly_allowance_seconds: PRO_MONTHLY_SECONDS,
            balance_seconds: PRO_MONTHLY_SECONDS,
            stripe_subscription_id: subscription.id,
            period_resets_at: periodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (error) throw error;

        // Log the credit transaction
        await supabase
          .from('credit_transactions')
          .insert({
            user_id: userId,
            delta_seconds: PRO_MONTHLY_SECONDS,
            reason: 'pro_activation',
          });

        console.log(`Pro activated for user ${userId}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subscriptionId = invoice.subscription as string;

        // Skip the first invoice (handled by subscription.created)
        if (invoice.billing_reason === 'subscription_create') {
          console.log('Skipping first invoice — handled by subscription.created');
          break;
        }

        const userId = await getUserIdByCustomerId(supabase, customerId);
        if (!userId) break;

        // Get subscription to find period end
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        // Refresh credits to full 30,000 seconds
        const { error } = await supabase
          .from('user_credits')
          .update({
            balance_seconds: PRO_MONTHLY_SECONDS,
            period_resets_at: periodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (error) throw error;

        await supabase
          .from('credit_transactions')
          .insert({
            user_id: userId,
            delta_seconds: PRO_MONTHLY_SECONDS,
            reason: 'monthly_refresh',
          });

        console.log(`Credits refreshed for user ${userId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const userId = await getUserIdByCustomerId(supabase, customerId);
        if (!userId) break;

        // Downgrade: set cancelled, zero monthly allowance
        // Existing balance drains naturally — do NOT zero it
        const { error } = await supabase
          .from('user_credits')
          .update({
            subscription_status: 'cancelled',
            monthly_allowance_seconds: 0,
            period_resets_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (error) throw error;

        console.log(`Subscription cancelled for user ${userId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const userId = await getUserIdByCustomerId(supabase, customerId);
        if (!userId) break;

        // Handle plan changes — adjust allowance pro-rata
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
        const isActive = subscription.status === 'active';

        const { error } = await supabase
          .from('user_credits')
          .update({
            subscription_status: isActive ? 'pro' : 'cancelled',
            monthly_allowance_seconds: isActive ? PRO_MONTHLY_SECONDS : 0,
            period_resets_at: isActive ? periodEnd : null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (error) throw error;

        console.log(`Subscription updated for user ${userId}: ${subscription.status}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Stripe webhook error:', err);
    return new Response(`Webhook handler failed: ${err.message}`, { status: 500 });
  }
});

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

async function getUserIdByCustomerId(
  supabase: ReturnType<typeof createServiceClient>,
  customerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('user_credits')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  return data?.user_id ?? null;
}
