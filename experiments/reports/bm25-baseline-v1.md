# BM25 Baseline v1

## 结论

自研 BM25 已建立可复现的稀疏检索基线。它在 seed v1 上能稳定找出直接词汇匹配的文档，但无法召回只在语义上相关、语言又不同的文档。这正是下一阶段 dense retrieval 和 RRF 要解决的问题。

## 实验身份

| 字段 | 值 |
|---|---|
| run id | `a1efeaf6ee04f683` |
| dataset | `memory-os-retrieval-seed@1` |
| dataset digest | `6b4a3997233197bdec56b0b12f931ea8d5f823ff53d1b3e3318f9c21fa8ec76b` |
| BM25 | `k1=1.5, b=0.75` |
| cutoff | 5 |
| 文档 / 查询 | 12 / 7 |

## 指标

| 指标 | 结果 |
|---|---:|
| Precision@5 | 0.343 |
| Recall@5 | 0.952 |
| MRR | 1.000 |
| MAP@5 | 0.929 |
| nDCG@5 | 0.977 |
| index build | 0.441 ms |
| median query | 0.025 ms |
| P95 query | 0.034 ms |

延迟来自当前本机和 12 篇文档，只用于检查回归，不能外推到大数据量。

## 失败切片

### `q-hybrid`

查询要求融合关键词与向量检索。BM25 找到 `rrf` 和 `bm25`，没有召回英文 `dense-retrieval`，Recall@5 为 0.667。词法检索看不到“向量检索”和 `embedding vectors` 的语义等价。

### `q-lineage`

直接相关的 `event-lineage` 排第一；弱相关的 `experiment-registry` 排第三，被包含“数据”一词的 `distribution-profile` 插入。AP@5 为 0.833。查询词过宽时，BM25 缺少字段权重和语义重排。

## 下一实验

1. 加入一个固定 embedding adapter，保留完全相同的数据快照和标注。
2. 分别运行 dense-only、BM25-only、RRF 三组。
3. 比较整体指标和 `cross-language`、`broad-query` 两个切片。
4. 用 paired bootstrap 判断差异是否稳定，不能只看均值。

## 复现

```bash
cd TextFile/C3/memory-os
npm run benchmark:bm25
```
