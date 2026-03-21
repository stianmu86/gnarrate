/**
 * Empty/error state component matching Visual Identity Manual Section 9.
 *
 * All 8 states:
 * 1. Empty Library
 * 2. Empty Search
 * 3. Network Error
 * 4. Paywall Detected
 * 5. Credits Exhausted
 * 6. Generation Failed
 * 7. GPU Cold Start
 * 8. Pro Voice Blocked
 *
 * Rules: Background Linen/Night Forest. Title: Newsreader 20px.
 * Subtitle: Inter 14px Stone/Moss. CTA: Terracotta button, 16px radius.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  BookOpen, Search, WifiOff, Lock, CreditCard,
  AlertTriangle, Cpu, Mic,
} from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';

export type EmptyStateType =
  | 'empty-library'
  | 'empty-search'
  | 'network-error'
  | 'paywall-detected'
  | 'credits-exhausted'
  | 'generation-failed'
  | 'gpu-cold-start'
  | 'pro-voice-blocked';

interface EmptyStateConfig {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
}

const ICON_SIZE = 48;

function getConfig(
  type: EmptyStateType,
  accent: string,
  secondary: string,
  extra?: { downloadCount?: number; refreshDate?: string },
): EmptyStateConfig {
  switch (type) {
    case 'empty-library':
      return {
        icon: <BookOpen size={ICON_SIZE} color={accent} strokeWidth={1.5} />,
        title: 'Your library is quiet',
        subtitle: 'Paste a link to create your first narration.',
        ctaLabel: 'Add something',
      };
    case 'empty-search':
      return {
        icon: <Search size={ICON_SIZE} color={secondary} strokeWidth={1.5} />,
        title: 'Nothing found',
        ctaLabel: 'Clear search',
      };
    case 'network-error':
      return {
        icon: <WifiOff size={ICON_SIZE} color={accent} strokeWidth={1.5} />,
        title: "You're offline",
        subtitle:
          extra?.downloadCount && extra.downloadCount > 0
            ? `${extra.downloadCount} items available offline`
            : undefined,
        ctaLabel: 'Retry',
      };
    case 'paywall-detected':
      return {
        icon: <Lock size={ICON_SIZE} color={accent} strokeWidth={1.5} />,
        title: "We couldn't access this article",
        subtitle: 'The content appears to be behind a paywall.',
        ctaLabel: 'Paste text instead',
      };
    case 'credits-exhausted':
      return {
        icon: <CreditCard size={ICON_SIZE} color={accent} strokeWidth={1.5} />,
        title: 'Out of credits',
        subtitle: extra?.refreshDate
          ? `Credits refresh on ${extra.refreshDate}`
          : 'Your library is still fully playable.',
        ctaLabel: 'Upgrade to Pro',
      };
    case 'generation-failed':
      return {
        icon: <AlertTriangle size={ICON_SIZE} color={accent} strokeWidth={1.5} />,
        title: 'Generation failed',
        subtitle: 'Something went wrong while creating your narration.',
        ctaLabel: 'Try again',
      };
    case 'gpu-cold-start':
      return {
        icon: <Cpu size={ICON_SIZE} color={accent} strokeWidth={1.5} />,
        title: 'Warming up the narration engine...',
        subtitle: 'This usually takes a few seconds.',
      };
    case 'pro-voice-blocked':
      return {
        icon: <Mic size={ICON_SIZE} color={accent} strokeWidth={1.5} />,
        title: 'This voice is available on Pro',
        subtitle: 'Upgrade to unlock all 6 narrator voices.',
        ctaLabel: 'Upgrade',
      };
  }
}

interface Props {
  type: EmptyStateType;
  onAction?: () => void;
  extra?: { downloadCount?: number; refreshDate?: string };
}

export function EmptyState({ type, onAction, extra }: Props) {
  const { theme } = useNordicTheme();
  const config = getConfig(type, theme.accent, theme.textSecondary, extra);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 48,
        gap: 16,
      }}
    >
      {config.icon}

      <Text
        style={{
          fontFamily: 'Newsreader',
          fontSize: 20,
          fontWeight: '600',
          color: theme.textPrimary,
          textAlign: 'center',
        }}
      >
        {config.title}
      </Text>

      {config.subtitle && (
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 14,
            fontWeight: '500',
            color: theme.textSecondary,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          {config.subtitle}
        </Text>
      )}

      {config.ctaLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={{
            backgroundColor: theme.accent,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 16,
            marginTop: 8,
          }}
        >
          <Text
            style={{
              fontFamily: 'Inter',
              fontSize: 14,
              fontWeight: '600',
              color: '#FFFFFF',
            }}
          >
            {config.ctaLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
