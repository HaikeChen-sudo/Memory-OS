"""Versioned retrieval datasets and reproducible BM25 experiment runs."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
import json
from pathlib import Path
from statistics import median
from time import perf_counter
from types import MappingProxyType
from typing import Any, Mapping

from .evaluation import EvaluationReport, evaluate_ranking
from .retrieval import BM25Index, Document


@dataclass(frozen=True)
class BenchmarkQuery:
    """A query and its graded document relevance judgments."""

    id: str
    text: str
    relevance: Mapping[str, float]


@dataclass(frozen=True)
class RetrievalDataset:
    """An immutable retrieval benchmark snapshot."""

    id: str
    version: str
    documents: tuple[Document, ...]
    queries: tuple[BenchmarkQuery, ...]
    digest: str

    @classmethod
    def load(cls, path: str | Path) -> "RetrievalDataset":
        """Load and validate a JSON retrieval dataset."""

        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("dataset root must be an object")
        return cls.from_mapping(data)

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "RetrievalDataset":
        """Validate a mapping and freeze it as a content-addressed dataset."""

        dataset_id = required_string(data, "dataset_id")
        version = required_string(data, "version")
        raw_documents = required_list(data, "documents")
        raw_queries = required_list(data, "queries")
        documents = tuple(parse_document(item) for item in raw_documents)
        document_ids = [document.id for document in documents]
        if len(set(document_ids)) != len(document_ids):
            raise ValueError("document ids must be unique")

        queries = tuple(parse_query(item) for item in raw_queries)
        query_ids = [query.id for query in queries]
        if len(set(query_ids)) != len(query_ids):
            raise ValueError("query ids must be unique")
        known_documents = set(document_ids)
        for query in queries:
            unknown = set(query.relevance) - known_documents
            if unknown:
                raise ValueError(f"query {query.id} references unknown documents: {sorted(unknown)}")
            if not any(grade > 0 for grade in query.relevance.values()):
                raise ValueError(f"query {query.id} needs at least one positive judgment")

        canonical_data = {
            "dataset_id": dataset_id,
            "version": version,
            "documents": [
                {
                    "id": document.id,
                    "text": document.text,
                    **({"metadata": dict(document.metadata)} if document.metadata is not None else {}),
                }
                for document in documents
            ],
            "queries": [
                {
                    "id": query.id,
                    "text": query.text,
                    "relevance": dict(query.relevance),
                }
                for query in queries
            ],
        }
        canonical = json.dumps(
            canonical_data,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return cls(
            id=dataset_id,
            version=version,
            documents=documents,
            queries=queries,
            digest=sha256(canonical.encode("utf-8")).hexdigest(),
        )


@dataclass(frozen=True)
class BM25ExperimentConfig:
    """Parameters that fully determine a BM25 experiment."""

    k1: float = 1.5
    b: float = 0.75
    cutoff: int = 10


@dataclass(frozen=True)
class ExperimentRun:
    """A reproducible run with metrics, rankings, timing, and content hashes."""

    run_id: str
    dataset_id: str
    dataset_version: str
    dataset_digest: str
    config: BM25ExperimentConfig
    report: EvaluationReport
    rankings: Mapping[str, tuple[str, ...]]
    index_build_ms: float
    median_query_ms: float
    p95_query_ms: float

    def to_dict(self) -> dict[str, Any]:
        """Convert a run to a JSON-serializable artifact."""

        return asdict(self)


def run_bm25_experiment(
    dataset: RetrievalDataset,
    config: BM25ExperimentConfig | None = None,
) -> ExperimentRun:
    """Build an index, execute all benchmark queries, and evaluate one fixed configuration."""

    effective_config = config or BM25ExperimentConfig()
    if effective_config.cutoff < 1:
        raise ValueError("cutoff must be at least 1")

    build_started = perf_counter()
    index = BM25Index(dataset.documents, k1=effective_config.k1, b=effective_config.b)
    index_build_ms = elapsed_ms(build_started)
    rankings: dict[str, tuple[str, ...]] = {}
    query_latencies: list[float] = []
    for query in dataset.queries:
        query_started = perf_counter()
        hits = index.search(query.text, limit=effective_config.cutoff)
        query_latencies.append(elapsed_ms(query_started))
        rankings[query.id] = tuple(hit.document.id for hit in hits)

    report = evaluate_ranking(
        rankings,
        {query.id: query.relevance for query in dataset.queries},
        k=effective_config.cutoff,
    )
    config_json = json.dumps(asdict(effective_config), sort_keys=True, separators=(",", ":"))
    run_id = sha256(f"bm25:{dataset.digest}:{config_json}".encode("utf-8")).hexdigest()[:16]
    return ExperimentRun(
        run_id=run_id,
        dataset_id=dataset.id,
        dataset_version=dataset.version,
        dataset_digest=dataset.digest,
        config=effective_config,
        report=report,
        rankings=rankings,
        index_build_ms=round(index_build_ms, 4),
        median_query_ms=round(median(query_latencies), 4) if query_latencies else 0.0,
        p95_query_ms=round(percentile(query_latencies, 0.95), 4),
    )


def required_string(data: Mapping[str, Any], field: str) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def required_list(data: Mapping[str, Any], field: str) -> list[Any]:
    value = data.get(field)
    if not isinstance(value, list) or not value:
        raise ValueError(f"{field} must be a non-empty list")
    return value


def parse_document(value: Any) -> Document:
    if not isinstance(value, dict):
        raise ValueError("each document must be an object")
    metadata = value.get("metadata")
    if metadata is not None and not (
        isinstance(metadata, dict)
        and all(isinstance(key, str) and isinstance(item, str) for key, item in metadata.items())
    ):
        raise ValueError("document metadata must map strings to strings")
    return Document(
        id=required_string(value, "id"),
        text=required_string(value, "text"),
        metadata=MappingProxyType(dict(metadata)) if metadata is not None else None,
    )


def parse_query(value: Any) -> BenchmarkQuery:
    if not isinstance(value, dict):
        raise ValueError("each query must be an object")
    raw_relevance = value.get("relevance")
    if not isinstance(raw_relevance, dict) or not raw_relevance:
        raise ValueError("query relevance must be a non-empty object")
    relevance: dict[str, float] = {}
    for document_id, grade in raw_relevance.items():
        if not isinstance(document_id, str) or not isinstance(grade, (int, float)) or grade < 0:
            raise ValueError("relevance must map document ids to non-negative numbers")
        relevance[document_id] = float(grade)
    return BenchmarkQuery(
        id=required_string(value, "id"),
        text=required_string(value, "text"),
        relevance=MappingProxyType(relevance),
    )


def elapsed_ms(started: float) -> float:
    return (perf_counter() - started) * 1000


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(quantile * len(ordered) + 0.999999) - 1))
    return ordered[index]
