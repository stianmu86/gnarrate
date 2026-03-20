/**
 * Paywall / Upgrade screen — Pro plan details + Stripe checkout.
 *
 * Phase 1 wired up Stripe webhooks; this screen triggers the
 * client-side Checkout redirect (web) or in-app purchase flow.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Sparkles } from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';
import { useCredits, formatSeconds } from '@/lib/hooks/useCredits';

const PRO_FEATURES = [
  'All 6 premium narrator voices',
  '500 minutes of narration per month',
  'Priority GPU processing',
  'Offline downloads',
  'Chapter detection',
];

export default function PaywallScreen() {
  const { theme } = useNordicTheme();
  const router = useRouter();
  const { data: credits } = useCredits();

  const isPro = credits?.subscription_status === 'pro';

  const handleSubscribe = () => {
    // TODO Phase 4: Integrate Stripe Checkout (web) or RevenueCat (iOS)
    // For now this is a placeholder
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 56,
          paddingHorizontal: 24,
          paddingBottom: 12,
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={theme.textPrimary} strokeWidth={1.5} />
        </Pressable>
        <Text style={{ fontFamily: 'Newsreader', fontSize: 24, fontWeight: '500', color: theme.textPrimary }}>
          {isPro ? 'Your Plan' : 'Upgrade to Pro'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {/* Hero */}
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 24,
            padding: 24,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <View
            style={{
              backgroundColor: theme.accent + '20',
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Sparkles size={28} color={theme.accent} strokeWidth={1.5} />
          </View>
          <Text
            style={{
              fontFamily: 'Newsreader',
              fontSize: 28,
              fontWeight: '600',
              color: theme.textPrimary,
              textAlign: 'center',
              marginBottom: 4,
            }}
          >
            Narrate Pro
          </Text>
          <Text
            style={{
              fontFamily: 'Inter',
              fontSize: 14,
              color: theme.textSecondary,
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            Unlock premium voices and more listening time
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontFamily: 'Newsreader', fontSize: 40, fontWeight: '600', color: theme.textPrimary }}>
              $4.99
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 14, color: theme.textSecondary, marginLeft: 4 }}>
              /month
            </Text>
          </View>
        </View>

        {/* Current balance */}
        {credits && (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: theme.border,
              marginBottom: 24,
            }}
          >
            <Text style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
              Current Balance
            </Text>
            <Text style={{ fontFamily: 'Newsreader', fontSize: 24, fontWeight: '500', color: theme.textPrimary, marginTop: 4 }}>
              {formatSeconds(credits.balance_seconds)}
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
              {isPro ? 'Pro plan active' : 'Free tier — 30 min signup bonus'}
            </Text>
          </View>
        )}

        {/* Features */}
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: '600',
            color: theme.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 12,
          }}
        >
          What you get
        </Text>
        {PRO_FEATURES.map((feature) => (
          <View
            key={feature}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 10,
            }}
          >
            <Check size={18} color={theme.accent} strokeWidth={2} />
            <Text style={{ fontFamily: 'Inter', fontSize: 14, color: theme.textPrimary, flex: 1 }}>
              {feature}
            </Text>
          </View>
        ))}

        {/* CTA */}
        {!isPro && (
          <Pressable
            onPress={handleSubscribe}
            style={{
              backgroundColor: theme.accent,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 24,
            }}
          >
            <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>
              Subscribe — $4.99/month
            </Text>
          </Pressable>
        )}

        {isPro && (
          <View
            style={{
              backgroundColor: theme.accent + '15',
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 24,
            }}
          >
            <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '600', color: theme.accent }}>
              You're on Pro ✓
            </Text>
          </View>
        )}

        {/* Legal */}
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 11,
            color: theme.textSecondary,
            textAlign: 'center',
            marginTop: 16,
            lineHeight: 16,
          }}
        >
          Subscription renews monthly. Cancel anytime.{'\n'}
          By subscribing you agree to our Terms of Service.
        </Text>
      </ScrollView>
    </View>
  );
}
