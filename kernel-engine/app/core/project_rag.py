from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from app.database.models import ProjectDocumentChunk, ProjectPin
from app.tools.file_manager import WORKSPACE_DIR, SecurityException, _resolve_and_check_path

_TOKEN_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_./:-]{1,63}")
_VECTOR_SIZE = 96
_CHUNK_SIZE = 1200
_CHUNK_OVERLAP = 180
_TEXT_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".env",
    ".css",
    ".scss",
    ".html",
    ".sql",
    ".csv",
}


@dataclass
class RetrievedChunk:
    path: str
    content: str
    score: float


def _is_text_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in _TEXT_EXTENSIONS


def _iter_pin_targets(path: Path) -> Iterable[Path]:
    if path.is_file():
        if _is_text_file(path):
            yield path
        return

    for item in path.rglob("*"):
        if item.is_file() and _is_text_file(item):
            yield item


def _chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    normalized = text.strip()
    if not normalized:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + size)
        chunks.append(normalized[start:end])
        if end >= len(normalized):
            break
        start = max(0, end - overlap)
    return chunks


def _embed_text(text: str) -> list[float]:
    vector = [0.0] * _VECTOR_SIZE
    for token in _TOKEN_PATTERN.findall(text.lower()):
        index = hash(token) % _VECTOR_SIZE
        vector[index] += 1.0

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def _relative_workspace_path(path: Path) -> str:
    return path.relative_to(WORKSPACE_DIR).as_posix()


def pin_workspace_paths(db: Session, paths: list[str], *, label: str | None = None) -> list[ProjectPin]:
    pinned: list[ProjectPin] = []

    for raw_path in paths:
        target = _resolve_and_check_path(raw_path)
        relative_root = _relative_workspace_path(target)
        kind = "folder" if target.is_dir() else "file"

        pin = db.query(ProjectPin).filter(ProjectPin.path == relative_root).first()
        if pin is None:
            pin = ProjectPin(path=relative_root, kind=kind, label=label)
            db.add(pin)
            db.flush()
        else:
            pin.kind = kind
            if label:
                pin.label = label
            db.query(ProjectDocumentChunk).filter(ProjectDocumentChunk.pin_id == pin.id).delete()
            db.flush()

        for file_path in _iter_pin_targets(target):
            try:
                content = file_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                content = file_path.read_text(encoding="utf-8", errors="ignore")

            for index, chunk in enumerate(_chunk_text(content)):
                embedding = _embed_text(chunk)
                db.add(
                    ProjectDocumentChunk(
                        pin_id=pin.id,
                        path=_relative_workspace_path(file_path),
                        chunk_index=index,
                        content=chunk,
                        embedding_json=json.dumps(embedding),
                    )
                )

        pinned.append(pin)

    db.commit()
    for pin in pinned:
        db.refresh(pin)
    return pinned


def list_pins(db: Session) -> list[ProjectPin]:
    return db.query(ProjectPin).order_by(ProjectPin.created_at.desc(), ProjectPin.id.desc()).all()


def delete_pin(db: Session, pin_id: int) -> bool:
    pin = db.query(ProjectPin).filter(ProjectPin.id == pin_id).first()
    if pin is None:
        return False
    db.delete(pin)
    db.commit()
    return True


def retrieve_context(db: Session, query: str, limit: int = 5) -> list[RetrievedChunk]:
    if not query.strip():
        return []

    query_embedding = _embed_text(query)
    results: list[RetrievedChunk] = []

    chunks = db.query(ProjectDocumentChunk).all()
    for chunk in chunks:
        try:
            embedding = json.loads(chunk.embedding_json)
        except json.JSONDecodeError:
            continue

        score = _cosine_similarity(query_embedding, embedding)
        if score <= 0:
            continue
        results.append(
            RetrievedChunk(
                path=chunk.path,
                content=chunk.content,
                score=score,
            )
        )

    results.sort(key=lambda item: item.score, reverse=True)
    return results[:limit]


def build_context_block(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return ""

    sections = []
    for chunk in chunks:
        sections.append(
            f"[{chunk.path} | score={chunk.score:.3f}]\n{chunk.content[:1000]}"
        )
    return "\n\n".join(sections)

