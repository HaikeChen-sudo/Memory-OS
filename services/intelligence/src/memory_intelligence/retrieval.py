"""Classical information retrieval with inspectable score contributions."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from math import log
import re
from typing import Iterable, Mapping, Sequence


_LATIN_OR_NUMBER = re.compile(r"[a-z0-9]+")
_CHINESE_SEGMENT = re.compile(r"[\u4e00-\u9fff]+")
_CHINESE_STOP_CHARACTERS = frozenset("与和及的了")


@dataclass(frozen=True)
class Document:
    """A versioned retrieval document."""

    id: str
    text: str
    metadata: Mapping[str, str] | None = None


@dataclass(frozen=True)
class SearchHit:
    """A ranked result with enough detail to reproduce its score."""

    document: Document
    score: float
    term_contributions: Mapping[str, float]


def tokenize(text: str) -> tuple[str, ...]:
    """Tokenize mixed Chinese and Latin text without external dictionaries."""

    normalized = text.lower()
    tokens = _LATIN_OR_NUMBER.findall(normalized)
    for segment in _CHINESE_SEGMENT.findall(normalized):
        if len(segment) == 1:
            if segment not in _CHINESE_STOP_CHARACTERS:
                tokens.append(segment)
            continue
        tokens.extend(
            bigram
            for index in range(len(segment) - 1)
            if not _CHINESE_STOP_CHARACTERS.intersection(
                bigram := segment[index : index + 2]
            )
        )
    return tuple(tokens)


class BM25Index:
    """An immutable Okapi BM25 index with a small, explainable interface."""

    def __init__(
        self,
        documents: Sequence[Document],
        *,
        k1: float = 1.5,
        b: float = 0.75,
    ) -> None:
        if k1 <= 0:
            raise ValueError("k1 must be positive")
        if not 0 <= b <= 1:
            raise ValueError("b must be between 0 and 1")
        if len({document.id for document in documents}) != len(documents):
            raise ValueError("document ids must be unique")

        self._documents = tuple(documents)
        self._k1 = k1
        self._b = b
        self._term_frequencies = tuple(Counter(tokenize(document.text)) for document in documents)
        self._document_lengths = tuple(sum(frequencies.values()) for frequencies in self._term_frequencies)
        self._average_document_length = (
            sum(self._document_lengths) / len(self._document_lengths) if self._documents else 0.0
        )
        postings: defaultdict[str, list[int]] = defaultdict(list)
        for document_index, frequencies in enumerate(self._term_frequencies):
            for term in frequencies:
                postings[term].append(document_index)
        self._postings = {term: tuple(indices) for term, indices in postings.items()}

    @property
    def size(self) -> int:
        """Return the number of indexed documents."""

        return len(self._documents)

    def search(self, query: str, *, limit: int = 10) -> tuple[SearchHit, ...]:
        """Rank documents and expose each matched term's BM25 contribution."""

        if limit < 1:
            raise ValueError("limit must be at least 1")
        if not self._documents:
            return ()

        query_terms = tuple(dict.fromkeys(tokenize(query)))
        candidate_indices: set[int] = set()
        for term in query_terms:
            candidate_indices.update(self._postings.get(term, ()))

        hits: list[SearchHit] = []
        for document_index in candidate_indices:
            contributions = self._score_terms(document_index, query_terms)
            score = sum(contributions.values())
            if score <= 0:
                continue
            hits.append(
                SearchHit(
                    document=self._documents[document_index],
                    score=score,
                    term_contributions=contributions,
                )
            )

        hits.sort(key=lambda hit: (-hit.score, hit.document.id))
        return tuple(hits[:limit])

    def _score_terms(self, document_index: int, query_terms: Iterable[str]) -> dict[str, float]:
        frequencies = self._term_frequencies[document_index]
        document_length = self._document_lengths[document_index]
        contributions: dict[str, float] = {}
        for term in query_terms:
            frequency = frequencies.get(term, 0)
            if frequency == 0:
                continue
            document_frequency = len(self._postings[term])
            inverse_document_frequency = log(
                1 + (self.size - document_frequency + 0.5) / (document_frequency + 0.5)
            )
            length_ratio = (
                document_length / self._average_document_length
                if self._average_document_length > 0
                else 0.0
            )
            denominator = frequency + self._k1 * (1 - self._b + self._b * length_ratio)
            contributions[term] = inverse_document_frequency * (
                frequency * (self._k1 + 1) / denominator
            )
        return contributions
