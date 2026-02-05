export interface DocumentChunk {
  index: number;
  text: string;
  start: number; // Character offset in original document
  end: number;
}

/**
 * Chunk text content for large documents
 */
export function chunkText(text: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const strategy = {
    maxChunkSize: 2000, // Characters
    overlapSize: 200, // Overlap between chunks
    splitOn: 'paragraph',
  };

  if (text.length <= strategy.maxChunkSize) {
    // Text is small enough, return as single chunk
    return [
      {
        index: 0,
        text,
        start: 0,
        end: text.length,
      },
    ];
  }

  // Split based on strategy
  let segments: string[];
  if (strategy.splitOn === 'paragraph') {
    segments = text.split(/\n\n+/);
  } else if (strategy.splitOn === 'sentence') {
    segments = text.split(/[.!?]+\s+/);
  } else {
    // Character-based splitting
    segments = [text];
  }

  let currentChunk = '';
  let currentStart = 0;
  let chunkIndex = 0;

  for (const segment of segments) {
    if (currentChunk.length + segment.length + 1 > strategy.maxChunkSize) {
      if (currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          index: chunkIndex++,
          text: currentChunk.trim(),
          start: currentStart,
          end: currentStart + currentChunk.length,
        });

        // Start new chunk with overlap
        const overlapText = currentChunk.slice(-strategy.overlapSize);
        currentStart = currentStart + currentChunk.length - overlapText.length;
        currentChunk = overlapText + ' ' + segment;
      } else {
        // Segment itself is too large, split it
        currentChunk = segment;
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + segment;
    }
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      index: chunkIndex,
      text: currentChunk.trim(),
      start: currentStart,
      end: currentStart + currentChunk.length,
    });
  }

  return chunks;
}
