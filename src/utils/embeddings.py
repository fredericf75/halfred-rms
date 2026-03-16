from __future__ import annotations

import numpy as np
from functools import lru_cache
from typing import List


@lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")


def compute_embedding(text: str) -> List[float]:
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)


def embedding_text_for_project(name: str, description: str | None) -> str:
    parts = [name]
    if description:
        parts.append(description)
    return " ".join(parts)


def embedding_text_for_task(name: str, description: str | None) -> str:
    parts = [name]
    if description:
        parts.append(description)
    return " ".join(parts)
