/**
 * Login screen — Google Sign-In + Email Magic Link.
 * Nordic Earth design: Linen background, Newsreader headings, Inter body.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useNordicTheme } from '@/components/NordicThemeProvider';

export default function LoginScreen() {
  const { theme } = useNordicTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleMagicLink = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setMagicLinkSent(true);
    }
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDevSignIn = async (email: string, label: string) => {
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: 'testpassword123',
    });

    if (signInError) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password: 'testpassword123',
        options: {
          data: { full_name: label },
        },
      });

      if (signUpError) {
        Alert.alert('Dev Sign In Failed', signUpError.message);
      }
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 24,
          gap: 24,
        }}
      >
        {/* Header */}
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Text
            style={{
              fontFamily: 'Newsreader',
              fontSize: 32,
              fontWeight: '500',
              color: theme.textPrimary,
            }}
          >
            Narrate
          </Text>
          <Text
            style={{
              fontFamily: 'Inter',
              fontSize: 14,
              fontWeight: '500',
              color: theme.textSecondary,
              textAlign: 'center',
            }}
          >
            Turn articles into audio.{'\n'}Your personal listening library.
          </Text>
        </View>

        {magicLinkSent ? (
          /* Magic link confirmation */
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Text
              style={{
                fontFamily: 'Newsreader',
                fontSize: 20,
                fontWeight: '600',
                color: theme.textPrimary,
                textAlign: 'center',
              }}
            >
              Check your email
            </Text>
            <Text
              style={{
                fontFamily: 'Inter',
                fontSize: 14,
                color: theme.textSecondary,
                textAlign: 'center',
              }}
            >
              We sent a magic link to {email}
            </Text>
          </View>
        ) : (
          <>
            {/* Google Sign-In */}
            <Pressable
              onPress={handleGoogleSignIn}
              style={{
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: '600',
                  color: theme.textPrimary,
                }}
              >
                Continue with Google
              </Text>
            </Pressable>

            {/* Divider */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
              <Text
                style={{
                  fontFamily: 'Inter',
                  fontSize: 12,
                  color: theme.textSecondary,
                }}
              >
                or
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
            </View>

            {/* Email Magic Link */}
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              style={{
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
                fontFamily: 'Inter',
                fontSize: 14,
                color: theme.textPrimary,
              }}
            />

            <Pressable
              onPress={handleMagicLink}
              disabled={loading}
              style={{
                backgroundColor: theme.accent,
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: loading ? 0.6 : 1,
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
                {loading ? 'Sending...' : 'Send Magic Link'}
              </Text>
            </Pressable>

            {/* Dev-only: instant sign-in with test account */}
            {__DEV__ && (
              <>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                  <Text
                    style={{
                      fontFamily: 'Inter',
                      fontSize: 12,
                      color: theme.textSecondary,
                    }}
                  >
                    dev only
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                </View>
                <Pressable
                  onPress={() => handleDevSignIn('test@narrate.dev', 'Test User')}
                  disabled={loading}
                  style={{
                    backgroundColor: theme.accentSecondary,
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: 'center',
                    opacity: loading ? 0.6 : 1,
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
                    Dev Sign In (Free)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDevSignIn('pro@narrate.dev', 'Pro User')}
                  disabled={loading}
                  style={{
                    backgroundColor: theme.accent,
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: 'center',
                    opacity: loading ? 0.6 : 1,
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
                    Dev Sign In (Pro ⭐)
                  </Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
