from __future__ import annotations

import unittest

from memory_intelligence import evaluate_ranking


class RankingEvaluationTests(unittest.TestCase):
    def test_perfect_ranking_has_unit_ndcg_and_recall(self) -> None:
        report = evaluate_ranking(
            {"q1": ["d1", "d2"]},
            {"q1": {"d1": 3, "d2": 1}},
            k=2,
        )
        self.assertEqual(report.mean_ndcg_at_k, 1)
        self.assertEqual(report.mean_recall_at_k, 1)
        self.assertEqual(report.mean_reciprocal_rank, 1)
        self.assertEqual(report.mean_average_precision_at_k, 1)

    def test_missing_ranking_is_counted_as_failure(self) -> None:
        report = evaluate_ranking({}, {"q1": {"d1": 1}}, k=5)
        self.assertEqual(report.query_count, 1)
        self.assertEqual(report.mean_recall_at_k, 0)
        self.assertEqual(report.mean_ndcg_at_k, 0)

    def test_graded_relevance_penalizes_wrong_order(self) -> None:
        report = evaluate_ranking(
            {"q1": ["weak", "strong"]},
            {"q1": {"strong": 3, "weak": 1}},
            k=2,
        )
        self.assertLess(report.mean_ndcg_at_k, 1)
        self.assertGreater(report.mean_ndcg_at_k, 0)

    def test_precision_uses_requested_cutoff(self) -> None:
        report = evaluate_ranking(
            {"q1": ["relevant"]},
            {"q1": {"relevant": 1}},
            k=5,
        )
        self.assertEqual(report.mean_precision_at_k, 0.2)

    def test_duplicate_document_ids_are_counted_once(self) -> None:
        report = evaluate_ranking(
            {"q1": ["d1", "d1"]},
            {"q1": {"d1": 3}},
            k=2,
        )
        query = report.queries[0]
        self.assertEqual(query.recall_at_k, 1)
        self.assertEqual(query.average_precision_at_k, 1)
        self.assertEqual(query.ndcg_at_k, 1)


if __name__ == "__main__":
    unittest.main()
