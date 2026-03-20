/**
 * Unit tests for the pre-flight credit guard logic.
 * Tests the cost estimation formula and guard conditions
 * as defined in Technical Specification Section 9.3.
 */

describe('Pre-flight credit guard', () => {
  // Cost formula: ceil((word_count / 150) * 60) * cost_multiplier
  function estimateCostSeconds(wordCount: number, costMultiplier: number): number {
    return Math.ceil((wordCount / 150) * 60) * costMultiplier;
  }

  it('estimates cost for a 1000-word article at 1x multiplier', () => {
    const cost = estimateCostSeconds(1000, 1.0);
    // 1000/150 = 6.667, * 60 = 400, ceil = 400
    expect(cost).toBe(400);
  });

  it('estimates cost for a 150-word article (exactly 1 minute)', () => {
    const cost = estimateCostSeconds(150, 1.0);
    expect(cost).toBe(60);
  });

  it('applies cost_multiplier for premium voices', () => {
    const baseCost = estimateCostSeconds(1000, 1.0);
    const premiumCost = estimateCostSeconds(1000, 1.2);
    expect(premiumCost).toBe(Math.ceil(baseCost * 1.2));
  });

  it('signup bonus (1800s) covers at least a 4000-word article', () => {
    const cost = estimateCostSeconds(4000, 1.0);
    expect(cost).toBeLessThanOrEqual(1800);
  });

  it('Pro monthly (30000s) covers at least a 75000-word article', () => {
    const cost = estimateCostSeconds(75000, 1.0);
    expect(cost).toBeLessThanOrEqual(30000);
  });

  describe('guard conditions', () => {
    function shouldBlock(params: {
      voiceTier: string;
      userStatus: string;
      balanceSeconds: number;
      costSeconds: number;
    }): { blocked: boolean; reason?: string } {
      // Pro voice check
      if (params.voiceTier === 'pro' && params.userStatus === 'free') {
        return { blocked: true, reason: 'PRO_VOICE_REQUIRED' };
      }
      // Balance check
      if (params.balanceSeconds < params.costSeconds) {
        return { blocked: true, reason: 'INSUFFICIENT_CREDITS' };
      }
      return { blocked: false };
    }

    it('blocks free user from pro voice', () => {
      const result = shouldBlock({
        voiceTier: 'pro',
        userStatus: 'free',
        balanceSeconds: 1800,
        costSeconds: 400,
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('PRO_VOICE_REQUIRED');
    });

    it('allows free user with standard voice and sufficient balance', () => {
      const result = shouldBlock({
        voiceTier: 'standard',
        userStatus: 'free',
        balanceSeconds: 1800,
        costSeconds: 400,
      });
      expect(result.blocked).toBe(false);
    });

    it('blocks when balance is insufficient', () => {
      const result = shouldBlock({
        voiceTier: 'standard',
        userStatus: 'free',
        balanceSeconds: 100,
        costSeconds: 400,
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('INSUFFICIENT_CREDITS');
    });

    it('allows pro user with pro voice', () => {
      const result = shouldBlock({
        voiceTier: 'pro',
        userStatus: 'pro',
        balanceSeconds: 30000,
        costSeconds: 400,
      });
      expect(result.blocked).toBe(false);
    });

    it('blocks pro user with insufficient balance', () => {
      const result = shouldBlock({
        voiceTier: 'standard',
        userStatus: 'pro',
        balanceSeconds: 50,
        costSeconds: 400,
      });
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('INSUFFICIENT_CREDITS');
    });
  });
});
