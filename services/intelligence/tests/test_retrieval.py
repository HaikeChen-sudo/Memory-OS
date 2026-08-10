from __future__ import annotations

import unittest

from memory_intelligence import BM25Index, Document, tokenize


class TokenizerTests(unittest.TestCase):
    def test_tokenizes_latin_words_and_chinese_bigrams(self) -> None:
        self.assertEqual(
            tokenize("Graph RAG 与知识图谱"),
            ("graph", "rag", "知识", "识图", "图谱"),
        )


class BM25IndexTests(unittest.TestCase):
    def setUp(self) -> None:
        self.index = BM25Index(
            [
                Document("d1", "向量检索与知识图谱融合"),
                Document("d2", "知识图谱中的实体关系"),
                Document("d3", "时间序列异常检测"),
            ]
        )

    def test_ranks_documents_by_query_term_evidence(self) -> None:
        hits = self.index.search("向量检索")
        self.assertEqual(hits[0].document.id, "d1")
        self.assertGreater(hits[0].score, 0)

    def test_score_equals_sum_of_exposed_contributions(self) -> None:
        hit = self.index.search("知识图谱")[0]
        self.assertAlmostEqual(hit.score, sum(hit.term_contributions.values()))

    def test_rejects_duplicate_document_ids(self) -> None:
        with self.assertRaisesRegex(ValueError, "unique"):
            BM25Index([Document("same", "a"), Document("same", "b")])

    def test_empty_index_returns_no_hits(self) -> None:
        self.assertEqual(BM25Index([]).search("anything"), ())


if __name__ == "__main__":
    unittest.main()
