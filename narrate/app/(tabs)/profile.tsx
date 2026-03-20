/**
 * Profile screen — user info, credit balance, settings link.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Settings, CreditCard, LogOut, ChevronRight } from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';
import { useAuth } from '@/lib/auth';
import { useCredits, formatSeconds } from '@/lib/hooks/useCredits';

export default function ProfileScreen() {
  const { theme } = useNordicTheme();
  const { user, signOut } = useAuth();
  const { data: credits } = useCredits();
  const router = useRouter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingTop: 60, paddingHorizontal: 24 }}
    >
      {/* Header */}
      <Text
        style={{
          fontFamily: 'Newsreader',
          fontSize: 32,
          fontWeight: '500',
          color: theme.textPrimary,
          marginBottom: 24,
        }}
      >
        Profile
      </Text>

      {/* User info */}
      <View
        style={{
          backgroundColor: theme.surface,
          borderRadius: 24,
          padding: 20,
          borderWidth: 1,
          borderColor: theme.border,
          marginBottom: 24,
        }}
      >
        <Text style={{ fontFamily: 'Newsreader', fontSize: 20, fontWeight: '600', color: theme.textPrimary }}>
          {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
        </Text>
        <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
          {user?.email}
        </Text>
      </View>

      {/* Credit balance */}
      {credits && (
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 24,
          }}
        >
          <Text style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Credits
          </Text>
          <Text style={{ fontFamily: 'Newsreader', fontSize: 28, fontWeight: '500', color: theme.textPrimary }}>
            {formatSeconds(credits.balance_seconds)}
          </Text>
          <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
            {credits.subscription_status === 'pro'
              ? `Pro — ${formatSeconds(credits.monthly_allowance_seconds)}/month`
              : 'Free tier'}
          </Text>
          {credits.subscription_status === 'free' && (
            <Pressable
              onPress={() => router.push('/paywall')}
              style={{
                backgroundColor: theme.accent,
                borderRadius: 16,
                paddingVertical: 10,
                alignItems: 'center',
                marginTop: 12,
              }}
            >
              <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>
                Upgrade to Pro
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Menu items */}
      {[
        { label: 'Settings', icon: Settings, route: '/settings' as const },
        { label: 'Manage Subscription', icon: CreditCard, route: '/paywall' as const },
      ].map((item) => (
        <Pressable
          key={item.label}
          onPress={() => router.push(item.route)}
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <item.icon size={20} color={theme.textSecondary} strokeWidth={1.5} />
            <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: theme.textPrimary }}>
              {item.label}
            </Text>
          </View>
          <ChevronRight size={16} color={theme.textSecondary} />
        </Pressable>
      ))}

      {/* Sign out */}
      <Pressable
        onPress={signOut}
        style={{
          backgroundColor: theme.surface,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: theme.border,
          marginBottom: 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <LogOut size={20} color={theme.accent} strokeWidth={1.5} />
        <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: theme.accent }}>
          Sign Out
        </Text>
      </Pressable>
    </ScrollView>
  );
}
