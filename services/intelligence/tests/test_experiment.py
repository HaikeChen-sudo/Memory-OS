from __future__ import annotations

import unittest

from memory_intelligence import (
    BM25ExperimentConfig,
    RetrievalDataset,
    run_bm25_experiment,
)


class RetrievalDatasetTests(unittest.TestCase):
    def test_digest_is_independent_of_object_key_order(self) -> None:
        left = RetrievalDataset.from_mapping(dataset_mapping())
        right_data = dataset_mapping()
        right_data["documents"][0] = {"text": "稀疏检索 BM25", "id": "d1"}
        right = RetrievalDataset.from_mapping(right_data)
        self.assertEqual(left.digest, right.digest)

    def test_rejects_unknown_judgment_document(self) -> None:
        data = dataset_mapping()
        data["queries"][0]["relevance"] = {"missing": 3}
        with self.assertRaisesRegex(ValueError, "unknown documents"):
            RetrievalDataset.from_mapping(data)

    def test_dataset_snapshot_cannot_be_mutated_after_hashing(self) -> None:
        data = dataset_mapping()
        data["queries"][0]["relevance"]["d2"] = 0
        dataset = RetrievalDataset.from_mapping(data)
        before = run_bm25_experiment(dataset, BM25ExperimentConfig(cutoff=2))

        with self.assertRaises(TypeError):
            dataset.queries[0].relevance["d2"] = 3

        after = run_bm25_experiment(dataset, BM25ExperimentConfig(cutoff=2))
        self.assertEqual(before.run_id, after.run_id)
        self.assertEqual(before.report, after.report)


class BM25ExperimentTests(unittest.TestCase):
    def test_same_data_and_config_produce_same_run_id(self) -> None:
        dataset = RetrievalDataset.from_mapping(dataset_mapping())
        first = run_bm25_experiment(dataset, BM25ExperimentConfig(cutoff=2))
        second = run_bm25_experiment(dataset, BM25ExperimentConfig(cutoff=2))
        self.assertEqual(first.run_id, second.run_id)
        self.assertEqual(first.rankings, second.rankings)

    def test_run_includes_map_and_latency(self) -> None:
        run = run_bm25_experiment(RetrievalDataset.from_mapping(dataset_mapping()))
        self.assertGreater(run.report.mean_average_precision_at_k, 0)
        self.assertGreaterEqual(run.p95_query_ms, 0)
        self.assertEqual(run.dataset_version, "1")


def dataset_mapping():
    return {
        "dataset_id": "test",
        "version": "1",
        "documents": [
            {"id": "d1", "text": "稀疏检索 BM25"},
            {"id": "d2", "text": "向量检索 embedding"},
        ],
        "queries": [
            {"id": "q1", "text": "BM25 稀疏检索", "relevance": {"d1": 3}},
        ],
    }


if __name__ == "__main__":
    unittest.main()
