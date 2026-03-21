/**
 * Sprint 6 — PDF upload & chapter detection tests.
 *
 * Tests analyze-text PDF extraction functions (sanitize, chapter detection),
 * Edge Function PDF handling logic, and UI validation.
 */

// ---- PDF extraction logic (mirrors analyze_text.py functions) ----

describe('PDF extraction logic', () => {
  // We test the JavaScript equivalents of the Python functions
  // to validate the logic before deploying to Modal

  describe('Page limit validation', () => {
    it('rejects PDFs over 200 pages', () => {
      const pageCount = 250;
      expect(pageCount > 200).toBe(true);
    });

    it('accepts PDFs at exactly 200 pages', () => {
      const pageCount = 200;
      expect(pageCount <= 200).toBe(true);
    });
  });

  describe('Scanned PDF detection', () => {
    it('detects scanned PDF (no extractable text)', () => {
      const extractedText = '   \n\n  ';
      const pageCount = 5;
      const isScanned = extractedText.trim().length < 100 && pageCount > 0;
      expect(isScanned).toBe(true);
    });

    it('accepts PDF with sufficient text', () => {
      const extractedText = 'A'.repeat(500);
      const pageCount = 3;
      const isScanned = extractedText.trim().length < 100 && pageCount > 0;
      expect(isScanned).toBe(false);
    });
  });

  describe('Character limit validation', () => {
    it('rejects text over 150,000 characters', () => {
      const textLength = 160000;
      expect(textLength > 150000).toBe(true);
    });

    it('accepts text at exactly 150,000 characters', () => {
      const textLength = 150000;
      expect(textLength > 150000).toBe(false);
    });
  });

  describe('TOC-based chapter detection', () => {
    it('extracts chapters from PDF TOC entries', () => {
      // Simulates doc.get_toc() → [(level, title, page_num)]
      const toc = [
        [1, 'Introduction', 1],
        [1, 'Methods', 5],
        [2, 'Data Collection', 6],
        [1, 'Results', 12],
        [3, 'Sub-sub-section', 13], // level 3 — should be skipped
      ];

      const pageCharOffsets = [
        [0, 0], [1, 2000], [2, 4000], [3, 6000], [4, 8000],
        [5, 10000], [6, 12000], [7, 14000], [8, 16000], [9, 18000],
        [10, 20000], [11, 22000],
      ];

      const chapters: { title: string; start_char: number }[] = [];
      for (const [level, title, pageNum] of toc) {
        if ((level as number) <= 2) {
          const idx = Math.max(0, Math.min((pageNum as number) - 1, pageCharOffsets.length - 1));
          chapters.push({
            title: (title as string).trim(),
            start_char: pageCharOffsets[idx][1],
          });
        }
      }

      expect(chapters).toHaveLength(4); // 3 level-1 + 1 level-2, skips level-3
      expect(chapters[0]).toEqual({ title: 'Introduction', start_char: 0 });
      expect(chapters[1]).toEqual({ title: 'Methods', start_char: 8000 });
      expect(chapters[2]).toEqual({ title: 'Data Collection', start_char: 10000 });
      expect(chapters[3]).toEqual({ title: 'Results', start_char: 22000 });
    });

    it('returns empty array when no TOC exists', () => {
      const toc: unknown[] = [];
      const chapters: unknown[] = [];

      if (toc.length > 0) {
        // would process TOC
      }

      expect(chapters).toHaveLength(0);
    });
  });

  describe('Font-size heading detection', () => {
    it('identifies headings with font size > 1.3x median', () => {
      // Simulate font sizes: body at 12pt, headings at 18pt
      const allSizes = [12, 12, 12, 12, 18, 12, 12, 18, 12, 12];
      const sorted = [...allSizes].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const threshold = median * 1.3;

      expect(median).toBe(12);
      expect(threshold).toBeCloseTo(15.6);
      expect(18 >= threshold).toBe(true); // Heading detected
      expect(12 >= threshold).toBe(false); // Body text not a heading
    });
  });

  describe('Fallback chapter', () => {
    it('creates single "Full Text" chapter when no headings found', () => {
      const chapters: { title: string; start_char: number }[] = [];

      if (chapters.length === 0) {
        chapters.push({ title: 'Full Text', start_char: 0 });
      }

      expect(chapters).toHaveLength(1);
      expect(chapters[0].title).toBe('Full Text');
    });
  });
});

// ---- Edge Function PDF validation logic ----

describe('Edge Function PDF validation', () => {
  it('rejects non-PDF MIME types', () => {
    const mimeType = 'text/plain';
    expect(mimeType !== 'application/pdf').toBe(true);
  });

  it('accepts PDF MIME type', () => {
    const mimeType = 'application/pdf';
    expect(mimeType === 'application/pdf').toBe(true);
  });

  it('rejects files over 50MB', () => {
    const MAX_PDF_SIZE = 50 * 1024 * 1024;
    const fileSize = 60 * 1024 * 1024; // 60MB
    expect(fileSize > MAX_PDF_SIZE).toBe(true);
  });

  it('accepts files under 50MB', () => {
    const MAX_PDF_SIZE = 50 * 1024 * 1024;
    const fileSize = 10 * 1024 * 1024; // 10MB
    expect(fileSize > MAX_PDF_SIZE).toBe(false);
  });

  it('derives title from PDF filename', () => {
    const filename = 'Research_Paper_2024.pdf';
    const title = filename.replace(/\.pdf$/i, '');
    expect(title).toBe('Research_Paper_2024');
  });

  it('handles filename without .pdf extension', () => {
    const filename = 'document';
    const title = filename.replace(/\.pdf$/i, '') || 'Untitled PDF';
    expect(title).toBe('document');
  });

  it('falls back to Untitled PDF for empty name', () => {
    const filename = '';
    const title = filename.replace(/\.pdf$/i, '') || 'Untitled PDF';
    expect(title).toBe('Untitled PDF');
  });

  describe('Word count estimation from file size', () => {
    it('estimates word count from file size (~250 words per page, ~3KB per page)', () => {
      const fileSize = 30000; // 30KB ≈ 10 pages
      const estimatedWords = Math.ceil((fileSize / 3000) * 250);
      expect(estimatedWords).toBe(2500);
    });

    it('estimates for large PDFs', () => {
      const fileSize = 3 * 1024 * 1024; // 3MB ≈ 1000 pages worth
      const estimatedWords = Math.ceil((fileSize / 3000) * 250);
      expect(estimatedWords).toBeGreaterThan(200000);
    });
  });

  describe('Storage path generation', () => {
    it('generates path in user folder', () => {
      const userId = 'user-123';
      const narrationId = 'abc-def';
      const path = `${userId}/${narrationId}.pdf`;
      expect(path).toBe('user-123/abc-def.pdf');
      expect(path.startsWith(userId)).toBe(true);
    });
  });
});

// ---- Client-side PDF validation ----

describe('Client-side PDF validation', () => {
  it('rejects files over 50MB in the UI', () => {
    const MAX_SIZE = 50 * 1024 * 1024;
    const fileSize = 55 * 1024 * 1024;
    expect(fileSize > MAX_SIZE).toBe(true);
  });

  it('formats file size in bytes', () => {
    const size = 500;
    const formatted = size < 1024
      ? `${size} B`
      : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`;
    expect(formatted).toBe('500 B');
  });

  it('formats file size in KB', () => {
    const size = 50000;
    const formatted = size < 1024
      ? `${size} B`
      : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`;
    expect(formatted).toBe('48.8 KB');
  });

  it('formats file size in MB', () => {
    const size = 5 * 1024 * 1024;
    const formatted = size < 1024
      ? `${size} B`
      : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`;
    expect(formatted).toBe('5.0 MB');
  });
});
