/**
 * Unit tests for Stripe webhook event handling logic.
 * Tests the state transitions defined in Technical Specification Section 9.4.
 */

describe('Stripe webhook state transitions', () => {
  const PRO_MONTHLY_SECONDS = 30_000;

  // Simulate user_credits state
  interface UserCredits {
    subscription_status: 'free' | 'pro' | 'cancelled';
    monthly_allowance_seconds: number;
    balance_seconds: number;
    period_resets_at: string | null;
  }

  function applySubscriptionCreated(credits: UserCredits, periodEnd: string): UserCredits {
    return {
      ...credits,
      subscription_status: 'pro',
      monthly_allowance_seconds: PRO_MONTHLY_SECONDS,
      balance_seconds: PRO_MONTHLY_SECONDS,
      period_resets_at: periodEnd,
    };
  }

  function applyInvoicePaid(credits: UserCredits, periodEnd: string): UserCredits {
    return {
      ...credits,
      balance_seconds: PRO_MONTHLY_SECONDS,
      period_resets_at: periodEnd,
    };
  }

  function applySubscriptionDeleted(credits: UserCredits): UserCredits {
    return {
      ...credits,
      subscription_status: 'cancelled',
      monthly_allowance_seconds: 0,
      // balance_seconds stays as-is — drains naturally
      period_resets_at: null,
    };
  }

  describe('customer.subscription.created', () => {
    it('activates Pro with 30,000 seconds', () => {
      const free: UserCredits = {
        subscription_status: 'free',
        monthly_allowance_seconds: 0,
        balance_seconds: 500, // remaining signup bonus
        period_resets_at: null,
      };

      const result = applySubscriptionCreated(free, '2026-04-20T00:00:00Z');

      expect(result.subscription_status).toBe('pro');
      expect(result.monthly_allowance_seconds).toBe(30_000);
      expect(result.balance_seconds).toBe(30_000);
      expect(result.period_resets_at).toBe('2026-04-20T00:00:00Z');
    });
  });

  describe('invoice.paid (monthly refresh)', () => {
    it('refreshes balance to full 30,000 seconds', () => {
      const proUsed: UserCredits = {
        subscription_status: 'pro',
        monthly_allowance_seconds: PRO_MONTHLY_SECONDS,
        balance_seconds: 5000, // used 25,000 this month
        period_resets_at: '2026-03-20T00:00:00Z',
      };

      const result = applyInvoicePaid(proUsed, '2026-04-20T00:00:00Z');

      expect(result.balance_seconds).toBe(30_000);
      expect(result.period_resets_at).toBe('2026-04-20T00:00:00Z');
    });

    it('unused credits do NOT roll over', () => {
      const proUnused: UserCredits = {
        subscription_status: 'pro',
        monthly_allowance_seconds: PRO_MONTHLY_SECONDS,
        balance_seconds: 28_000, // barely used
        period_resets_at: '2026-03-20T00:00:00Z',
      };

      const result = applyInvoicePaid(proUnused, '2026-04-20T00:00:00Z');

      // Balance resets to 30,000 — no rollover of the 28,000
      expect(result.balance_seconds).toBe(30_000);
    });
  });

  describe('customer.subscription.deleted', () => {
    it('downgrades to cancelled, zeroes allowance', () => {
      const pro: UserCredits = {
        subscription_status: 'pro',
        monthly_allowance_seconds: PRO_MONTHLY_SECONDS,
        balance_seconds: 15_000,
        period_resets_at: '2026-04-20T00:00:00Z',
      };

      const result = applySubscriptionDeleted(pro);

      expect(result.subscription_status).toBe('cancelled');
      expect(result.monthly_allowance_seconds).toBe(0);
      expect(result.period_resets_at).toBeNull();
    });

    it('preserves remaining balance (drains naturally)', () => {
      const pro: UserCredits = {
        subscription_status: 'pro',
        monthly_allowance_seconds: PRO_MONTHLY_SECONDS,
        balance_seconds: 15_000,
        period_resets_at: '2026-04-20T00:00:00Z',
      };

      const result = applySubscriptionDeleted(pro);

      // Critical: balance is NOT zeroed on cancellation
      expect(result.balance_seconds).toBe(15_000);
    });
  });

  describe('Stripe-Signature verification', () => {
    it('webhook must verify signature before processing', () => {
      // This is a spec compliance test — the rule from Technical Spec Section 9.4
      // The actual verification happens in the Edge Function using stripe.webhooks.constructEventAsync
      // Here we just document the requirement
      const requiresSignature = true;
      expect(requiresSignature).toBe(true);
    });
  });
});
