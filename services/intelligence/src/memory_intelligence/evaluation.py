"""Ranking evaluation that treats relevance judgments as first-class data."""

from __future__ import annotations

from dataclasses import dataclass
from math import log2
from statistics import fmean
from typing import Mapping, Sequence


@dataclass(frozen=True)
class QueryEvaluation:
    """Per-query metrics used to inspect failures hidden by aggregate means."""

    query_id: str
    precision_at_k: float
    recall_at_k: float
    reciprocal_rank: float
    average_precision_at_k: float
    ndcg_at_k: float


@dataclass(frozen=True)
class EvaluationReport:
    """Macro-averaged ranking metrics plus their per-query observations."""

    k: int
    query_count: int
    mean_precision_at_k: float
    mean_recall_at_k: float
    mean_reciprocal_rank: float
    mean_average_precision_at_k: float
    mean_ndcg_at_k: float
    queries: tuple[QueryEvaluation, ...]


def evaluate_ranking(
    rankings: Mapping[str, Sequence[str]],
    judgments: Mapping[str, Mapping[str, float]],
    *,
    k: int = 10,
) -> EvaluationReport:
    """Evaluate ranked document ids against graded query relevance judgments."""

    if k < 1:
        raise ValueError("k must be at least 1")

    evaluations: list[QueryEvaluation] = []
    for query_id in sorted(judgments):
        relevance = judgments[query_id]
        ranked_ids = _deduplicate(rankings.get(query_id, ()))[:k]
        relevant_ids = {document_id for document_id, grade in relevance.items() if grade > 0}
        retrieved_relevant = sum(document_id in relevant_ids for document_id in ranked_ids)
        precision = retrieved_relevant / k
        recall = retrieved_relevant / len(relevant_ids) if relevant_ids else 0.0
        reciprocal_rank = _reciprocal_rank(ranked_ids, relevant_ids)
        average_precision = _average_precision(ranked_ids, relevant_ids, k)
        ndcg = _ndcg(ranked_ids, relevance, k)
        evaluations.append(
            QueryEvaluation(
                query_id=query_id,
                precision_at_k=precision,
                recall_at_k=recall,
                reciprocal_rank=reciprocal_rank,
                average_precision_at_k=average_precision,
                ndcg_at_k=ndcg,
            )
        )

    return EvaluationReport(
        k=k,
        query_count=len(evaluations),
        mean_precision_at_k=_mean([item.precision_at_k for item in evaluations]),
        mean_recall_at_k=_mean([item.recall_at_k for item in evaluations]),
        mean_reciprocal_rank=_mean([item.reciprocal_rank for item in evaluations]),
        mean_average_precision_at_k=_mean(
            [item.average_precision_at_k for item in evaluations]
        ),
        mean_ndcg_at_k=_mean([item.ndcg_at_k for item in evaluations]),
        queries=tuple(evaluations),
    )


def _deduplicate(document_ids: Sequence[str]) -> tuple[str, ...]:
    """Keep the first occurrence so one document cannot earn relevance twice."""

    return tuple(dict.fromkeys(document_ids))


def _reciprocal_rank(ranked_ids: Sequence[str], relevant_ids: set[str]) -> float:
    for rank, document_id in enumerate(ranked_ids, start=1):
        if document_id in relevant_ids:
            return 1 / rank
    return 0.0


def _average_precision(ranked_ids: Sequence[str], relevant_ids: set[str], k: int) -> float:
    if not relevant_ids:
        return 0.0
    hits = 0
    precision_sum = 0.0
    for rank, document_id in enumerate(ranked_ids[:k], start=1):
        if document_id not in relevant_ids:
            continue
        hits += 1
        precision_sum += hits / rank
    return precision_sum / min(len(relevant_ids), k)


def _ndcg(ranked_ids: Sequence[str], relevance: Mapping[str, float], k: int) -> float:
    observed = [relevance.get(document_id, 0.0) for document_id in ranked_ids]
    ideal = sorted((grade for grade in relevance.values() if grade > 0), reverse=True)[:k]
    ideal_gain = _discounted_cumulative_gain(ideal)
    return _discounted_cumulative_gain(observed) / ideal_gain if ideal_gain > 0 else 0.0


def _discounted_cumulative_gain(grades: Sequence[float]) -> float:
    return sum((2**grade - 1) / log2(rank + 1) for rank, grade in enumerate(grades, start=1))


def _mean(values: Sequence[float]) -> float:
    return fmean(values) if values else 0.0
