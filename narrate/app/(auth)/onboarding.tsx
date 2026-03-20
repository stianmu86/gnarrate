/**
 * Onboarding screen — first-run voice picker + example narration.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Play, Check } from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';

const VOICES = [
  { id: 'neutral', name: 'The Neutral', tier: 'free', description: 'Clean and balanced' },
  { id: 'warm', name: 'Warm', tier: 'pro', description: 'Cosy and inviting' },
  { id: 'smooth', name: 'Smooth', tier: 'pro', description: 'Polished and calm' },
  { id: 'deep', name: 'Deep', tier: 'pro', description: 'Rich and resonant' },
  { id: 'storyteller', name: 'Storyteller', tier: 'pro', description: 'Expressive and engaging' },
  { id: 'resonant', name: 'Resonant Male', tier: 'pro', description: 'Authoritative and clear' },
];

export default function OnboardingScreen() {
  const { theme } = useNordicTheme();
  const router = useRouter();
  const [selectedVoice, setSelectedVoice] = useState('neutral');

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: 80, paddingHorizontal: 24 }}>
      <Text
        style={{
          fontFamily: 'Newsreader',
          fontSize: 32,
          fontWeight: '500',
          color: theme.textPrimary,
          marginBottom: 8,
        }}
      >
        Choose your voice
      </Text>
      <Text
        style={{
          fontFamily: 'Inter',
          fontSize: 14,
          color: theme.textSecondary,
          marginBottom: 32,
        }}
      >
        You can change this anytime. Free users get The Neutral.
      </Text>

      <FlatList
        data={VOICES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedVoice(item.id)}
            style={{
              backgroundColor: theme.surface,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
              borderWidth: 2,
              borderColor: selectedVoice === item.id ? theme.accent : theme.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontFamily: 'Newsreader', fontSize: 18, fontWeight: '600', color: theme.textPrimary }}>
                  {item.name}
                </Text>
                {item.tier === 'pro' && (
                  <View style={{ backgroundColor: theme.accent + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 40 }}>
                    <Text style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: '600', color: theme.accent }}>PRO</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {item.description}
              </Text>
            </View>
            {selectedVoice === item.id ? (
              <Check size={20} color={theme.accent} />
            ) : (
              <Play size={16} color={theme.textSecondary} />
            )}
          </Pressable>
        )}
      />

      <Pressable
        onPress={() => router.replace('/(tabs)')}
        style={{
          backgroundColor: theme.accent,
          borderRadius: 16,
          paddingVertical: 16,
          alignItems: 'center',
          marginBottom: 40,
        }}
      >
        <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>
          Start listening
        </Text>
      </Pressable>
    </View>
  );
}
