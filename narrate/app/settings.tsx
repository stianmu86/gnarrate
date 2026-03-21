/**
 * Settings screen — Theme toggle, account info, downloads, data export.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Moon,
  Sun,
  HardDrive,
  Download,
  Trash2,
  ChevronRight,
} from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';
import { useAuth } from '@/lib/auth';

export default function SettingsScreen() {
  const { theme, mode, setMode } = useNordicTheme();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isDark = mode === 'dark';

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
          Settings
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {/* Appearance */}
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: '600',
            color: theme.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginBottom: 12,
            marginTop: 8,
          }}
        >
          Appearance
        </Text>
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 24,
          }}
        >
          {/* Dark mode toggle */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {isDark ? (
                <Moon size={20} color={theme.textSecondary} strokeWidth={1.5} />
              ) : (
                <Sun size={20} color={theme.textSecondary} strokeWidth={1.5} />
              )}
              <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: theme.textPrimary }}>
                Dark Mode
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={(val) => setMode(val ? 'dark' : 'light')}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* System theme */}
          <Pressable
            onPress={() => setMode('system')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: theme.border,
            }}
          >
            <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: theme.textPrimary }}>
              Use System Theme
            </Text>
            {mode === 'system' && (
              <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.accent, fontWeight: '600' }}>
                Active
              </Text>
            )}
          </Pressable>
        </View>

        {/* Storage */}
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
          Storage
        </Text>
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 24,
          }}
        >
          <Pressable
            onPress={() => router.push('/downloads')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Download size={20} color={theme.textSecondary} strokeWidth={1.5} />
              <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: theme.textPrimary }}>
                Manage Downloads
              </Text>
            </View>
            <ChevronRight size={16} color={theme.textSecondary} />
          </Pressable>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: theme.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <HardDrive size={20} color={theme.textSecondary} strokeWidth={1.5} />
              <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: theme.textPrimary }}>
                Cache Size
              </Text>
            </View>
            <Text style={{ fontFamily: 'Inter', fontSize: 13, color: theme.textSecondary }}>
              0 MB
            </Text>
          </View>

          <Pressable
            onPress={() => {
              queryClient.clear();
              Alert.alert('Cache cleared', 'All cached data has been removed.');
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: theme.border,
              gap: 12,
            }}
          >
            <Trash2 size={20} color={theme.accent} strokeWidth={1.5} />
            <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: theme.accent }}>
              Clear Cache
            </Text>
          </Pressable>
        </View>

        {/* Account */}
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
          Account
        </Text>
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ fontFamily: 'Inter', fontSize: 14, color: theme.textPrimary }}>
            {user?.email ?? 'Not signed in'}
          </Text>
          <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary, marginTop: 4 }}>
            Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
          </Text>
        </View>

        {/* Version */}
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 11,
            color: theme.textSecondary,
            textAlign: 'center',
            marginTop: 32,
          }}
        >
          Narrate v1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}
