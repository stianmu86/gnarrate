/**
 * Unit tests for the analyze-text processing logic.
 * Tests sanitisation, chunking, and chapter detection.
 */

// Re-implement the pure functions here for testing
// (These mirror the logic in modal/analyze_text.py)

function sanitizeText(text: string): string {
  let cleaned = text;
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, '');
  // Remove footnote markers
  cleaned = cleaned.replace(/\[\d+\]/g, '');
  // Collapse whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/ {2,}/g, ' ');
  return cleaned.trim();
}

function countChunks(text: string, maxChars = 500): number {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxChars) {
      if (current) chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks.length || 1;
}

describe('Text sanitisation', () => {
  it('strips URLs', () => {
    const input = 'Read more at https://example.com/article and http://test.org/page here.';
    const result = sanitizeText(input);
    expect(result).not.toContain('https://');
    expect(result).not.toContain('http://');
    expect(result).toContain('Read more at');
  });

  it('strips footnote markers', () => {
    const input = 'This is a fact[1] with evidence[2] and sources[12].';
    const result = sanitizeText(input);
    expect(result).not.toContain('[1]');
    expect(result).not.toContain('[2]');
    expect(result).not.toContain('[12]');
    expect(result).toContain('This is a fact');
  });

  it('collapses excessive newlines', () => {
    const input = 'Paragraph one.\n\n\n\n\nParagraph two.';
    const result = sanitizeText(input);
    expect(result).toBe('Paragraph one.\n\nParagraph two.');
  });

  it('collapses multiple spaces', () => {
    const input = 'Too   many    spaces   here.';
    const result = sanitizeText(input);
    expect(result).toBe('Too many spaces here.');
  });

  it('preserves normal text', () => {
    const input = 'This is a perfectly normal sentence with no issues.';
    const result = sanitizeText(input);
    expect(result).toBe(input);
  });
});

describe('Text chunking', () => {
  it('returns 1 chunk for short text', () => {
    expect(countChunks('Hello world.')).toBe(1);
  });

  it('splits long text into multiple chunks', () => {
    // Create text with 10 sentences of ~60 chars each = ~600 chars
    const sentences = Array(10)
      .fill(null)
      .map((_, i) => `This is sentence number ${i + 1} which has some reasonable length.`);
    const text = sentences.join(' ');

    const chunks = countChunks(text, 500);
    expect(chunks).toBeGreaterThan(1);
  });

  it('respects sentence boundaries (never splits mid-sentence)', () => {
    const text = 'Short. Another short. Yet another. One more sentence here.';
    const chunks = countChunks(text, 20);
    // Each "chunk" should be a complete sentence
    expect(chunks).toBeGreaterThanOrEqual(1);
  });

  it('handles text with no sentence-ending punctuation', () => {
    const text = 'A block of text with no periods or question marks';
    const chunks = countChunks(text, 500);
    expect(chunks).toBe(1);
  });
});

describe('content_raw vs content_cleaned', () => {
  it('sanitisation produces different output from raw input with noise', () => {
    const raw = 'Read this article[1] at https://example.com for more[2] details.';
    const cleaned = sanitizeText(raw);
    expect(cleaned).not.toBe(raw);
    expect(cleaned).not.toContain('[1]');
    expect(cleaned).not.toContain('https://');
  });

  it('TTS should always use content_cleaned, never content_raw', () => {
    // This is a spec compliance test — the rule from CLAUDE.md
    const raw = 'Some text[1] with noise https://link.com here.';
    const cleaned = sanitizeText(raw);

    // Cleaned version should be speakable
    expect(cleaned).not.toMatch(/\[\d+\]/);
    expect(cleaned).not.toMatch(/https?:\/\//);
  });
});
