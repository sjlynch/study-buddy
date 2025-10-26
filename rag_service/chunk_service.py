from typing import List
from tqdm import tqdm

def chunk_text(text: str, min_words: int = 150, max_words: int = 300, show_progress: bool = False) -> List[str]:
    """
    Chunk text using a simple, character-scanning strategy that prefers natural boundaries.

    Rules
    -----
    1) Keep adding text until we reach at least `min_words` (default 150).
       After that point, if we encounter a newline ('\\n'), we end the chunk there.
    2) If we reach `max_words` (default 300) without having seen a newline after `min_words`,
       we keep scanning and end the chunk at the first period ('.') we encounter.
    3) Any leftover text at the end is emitted as a final (possibly shorter) chunk.

    Notes on "word" counting:
    - A "word" is a contiguous run of alphanumeric characters (as detected by str.isalnum()).
    - The counter increases when a word ends (i.e., when we transition from "in a word"
      to "not in a word"). 

    Implementation details:
    - We append characters into a buffer (list of strings for efficiency).
    - We track `in_word` to detect word boundaries.
    - We flip `allow_cut_on_newline` once we've reached at least `min_words`.
    - We flip `require_period_cut` once we've reached at least `max_words`.
      When `require_period_cut` is True, we ignore newlines and wait for a '.' to cut.
    - When cutting, we include the boundary character in the chunk, then reset state.

    """
    if not text:
        return []

    chunks: List[str] = []

    buffer_parts: List[str] = []
    words_in_chunk = 0
    in_word = False

    allow_cut_on_newline = False  # True once words_in_chunk >= min_words
    require_period_cut = False    # True once words_in_chunk >= max_words (and no newline cut happened)

    # Helper to finalize the current buffer as a chunk and reset state
    def finalize_chunk():
        nonlocal buffer_parts, words_in_chunk, in_word, allow_cut_on_newline, require_period_cut
        chunk = ''.join(buffer_parts).strip()
        if chunk:
            chunks.append(chunk)
        buffer_parts = []
        words_in_chunk = 0
        in_word = False
        allow_cut_on_newline = False
        require_period_cut = False

    # Drive the scan with an optional tqdm progress bar
    iterable = tqdm(text, total=len(text), desc="Chunking text", unit="char", leave=False) if show_progress else text

    # We will scan character-by-character to:
    # - preserve original whitespace
    # - reliably detect boundaries (newlines/periods)
    # - and update the word counter without regex.
    for ch in iterable:
        is_word_char = ch.isalnum()

        # If we're leaving a word, count it
        if not is_word_char and in_word:
            words_in_chunk += 1
            in_word = False

            # Threshold checks activate flags as soon as we *finish* a word
            if not allow_cut_on_newline and words_in_chunk >= min_words:
                allow_cut_on_newline = True
            if not require_period_cut and words_in_chunk >= max_words:
                require_period_cut = True

        # If we're entering a word
        if is_word_char and not in_word:
            in_word = True

        # Append the current character
        buffer_parts.append(ch)

        # Once allowed to cut on newline, prefer newline boundary (unless we've exceeded max and now require a period)
        if allow_cut_on_newline and not require_period_cut and ch == '\n':
            finalize_chunk()
            continue

        # If we've hit/exceeded max words without a newline cut, wait for a period to cut
        if require_period_cut and ch == '.':
            finalize_chunk()
            continue

    # End of text: if we were in a word, that final word ends here
    if in_word:
        words_in_chunk += 1

    # Flush any remainder
    if buffer_parts:
        chunk = ''.join(buffer_parts).strip()
        if chunk:
            chunks.append(chunk)

    return chunks
