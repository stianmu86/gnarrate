describe('Supabase client config', () => {
  it('uses EXPO_PUBLIC env vars (anon key, not service role)', () => {
    // Verify the source code uses the correct env var names
    const fs = require('fs');
    const source = fs.readFileSync(
      require('path').resolve(__dirname, '../lib/supabase.ts'),
      'utf8'
    );

    expect(source).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(source).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
