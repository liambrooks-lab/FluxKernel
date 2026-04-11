"""
Memory module — vector search over past messages using in-process TF-IDF.
Swap the retriever for pgvector + sentence-transformers when ready for production.
"""
from typing import List


def _tokenize(text: str) -> set:
    return set(text.lower().split())


def retrieve_relevant_context(query: str, history: List[dict], top_k: int = 3) -> List[str]:
    """
    Simple keyword-overlap retriever over the in-memory message history.
    Returns the `top_k` most relevant past messages as context strings.

    Args:
        query:   The current user prompt.
        history: List of dicts with keys 'role' and 'content'.
        top_k:   Number of messages to surface.
    """
    if not history:
        return []

    query_tokens = _tokenize(query)
    scored: List[tuple[float, str]] = []

    for msg in history:
        content = msg.get("content", "")
        msg_tokens = _tokenize(content)
        if not msg_tokens:
            continue
        overlap = len(query_tokens & msg_tokens)
        score = overlap / (len(query_tokens | msg_tokens) or 1)  # Jaccard similarity
        scored.append((score, f"[{msg['role'].upper()}]: {content}"))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [text for _, text in scored[:top_k] if _ > 0]


def build_context_block(query: str, history: List[dict]) -> str:
    """Return a formatted context string to prepend to the LLM prompt."""
    snippets = retrieve_relevant_context(query, history)
    if not snippets:
        return ""
    joined = "\n".join(snippets)
    return f"<context>\n{joined}\n</context>\n\n"