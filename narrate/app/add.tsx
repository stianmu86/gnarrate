/**
 * Add Narration modal — URL / PDF / Raw Text tabs.
 *
 * Sends to process-content Edge Function. Shows inline validation
 * and error states from EmptyState components.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X, Link, FileText, Type } from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Tab = 'url' | 'pdf' | 'text';

export default function AddScreen() {
  const { theme } = useNordicTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tabs: { key: Tab; label: string; icon: typeof Link }[] = [
    { key: 'url', label: 'URL', icon: Link },
    { key: 'pdf', label: 'PDF', icon: FileText },
    { key: 'text', label: 'Text', icon: Type },
  ];

  const canSubmit = () => {
    if (activeTab === 'url') return url.trim().length > 0;
    if (activeTab === 'text') return rawText.trim().length >= 100;
    return false; // PDF requires file picker (Phase 4)
  };

  const handleSubmit = async () => {
    if (!user || !canSubmit()) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const body: Record<string, string> = {};

      if (activeTab === 'url') {
        body.source_type = 'url';
        body.source_url = url.trim();
      } else if (activeTab === 'text') {
        body.source_type = 'text';
        body.content_raw = rawText.trim();
        body.title = title.trim() || 'Untitled';
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        setErrorMsg('Not authenticated. Please sign in again.');
        setIsSubmitting(false);
        return;
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/process-content`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      // Success — go back to library, Realtime will show the new card
      router.back();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 56,
          paddingHorizontal: 24,
          paddingBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: 'Newsreader',
            fontSize: 24,
            fontWeight: '500',
            color: theme.textPrimary,
          }}
        >
          New Narration
        </Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <X size={24} color={theme.textSecondary} strokeWidth={1.5} />
        </Pressable>
      </View>

      {/* Tab selector */}
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 24,
          backgroundColor: theme.surface,
          borderRadius: 12,
          padding: 4,
          marginBottom: 24,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <Pressable
              key={tab.key}
              onPress={() => {
                setActiveTab(tab.key);
                setErrorMsg(null);
              }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: isActive ? theme.background : 'transparent',
              }}
            >
              <Icon size={16} color={isActive ? theme.accent : theme.textSecondary} strokeWidth={1.5} />
              <Text
                style={{
                  fontFamily: 'Inter',
                  fontSize: 13,
                  fontWeight: isActive ? '600' : '400',
                  color: isActive ? theme.textPrimary : theme.textSecondary,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {/* URL tab */}
        {activeTab === 'url' && (
          <View>
            <Text style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Article URL
            </Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com/article"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={{
                backgroundColor: theme.surface,
                borderRadius: 12,
                padding: 16,
                fontFamily: 'Inter',
                fontSize: 14,
                color: theme.textPrimary,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            />
            <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>
              Paste any article, blog post, or web page URL.
            </Text>
          </View>
        )}

        {/* PDF tab */}
        {activeTab === 'pdf' && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <FileText size={32} color={theme.textSecondary} strokeWidth={1} />
            <Text
              style={{
                fontFamily: 'Newsreader',
                fontSize: 18,
                fontWeight: '600',
                color: theme.textPrimary,
                marginTop: 12,
                textAlign: 'center',
              }}
            >
              PDF Upload
            </Text>
            <Text
              style={{
                fontFamily: 'Inter',
                fontSize: 13,
                color: theme.textSecondary,
                marginTop: 4,
                textAlign: 'center',
              }}
            >
              PDF upload will be available in a future update.
            </Text>
          </View>
        )}

        {/* Text tab */}
        {activeTab === 'text' && (
          <View>
            <Text style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Title (optional)
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="My Article"
              placeholderTextColor={theme.textSecondary}
              style={{
                backgroundColor: theme.surface,
                borderRadius: 12,
                padding: 16,
                fontFamily: 'Inter',
                fontSize: 14,
                color: theme.textPrimary,
                borderWidth: 1,
                borderColor: theme.border,
                marginBottom: 16,
              }}
            />
            <Text style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Paste your text
            </Text>
            <TextInput
              value={rawText}
              onChangeText={setRawText}
              placeholder="Paste at least 100 characters of text…"
              placeholderTextColor={theme.textSecondary}
              multiline
              textAlignVertical="top"
              style={{
                backgroundColor: theme.surface,
                borderRadius: 12,
                padding: 16,
                fontFamily: 'Inter',
                fontSize: 14,
                color: theme.textPrimary,
                borderWidth: 1,
                borderColor: theme.border,
                minHeight: 200,
              }}
            />
            <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>
              {rawText.length} / 100 characters minimum
            </Text>
          </View>
        )}

        {/* Error message */}
        {errorMsg && (
          <View
            style={{
              backgroundColor: theme.accent + '15',
              borderRadius: 12,
              padding: 12,
              marginTop: 16,
            }}
          >
            <Text style={{ fontFamily: 'Inter', fontSize: 13, color: theme.accent }}>
              {errorMsg}
            </Text>
          </View>
        )}

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit() || isSubmitting}
          style={{
            backgroundColor: canSubmit() ? theme.accent : theme.border,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            marginTop: 24,
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>
              Create Narration
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
