# Memory Intelligence

Memory OS 的 Python 算法与实验内核。当前没有第三方运行时依赖，Python 3.9 以上即可运行。

## 已实现

- 中英混合 tokenizer：英文词元 + 中文字符二元组。
- 可解释 Okapi BM25：每个命中词保留分数贡献。
- 排名评测：Precision@K、Recall@K、MRR、MAP@K、graded nDCG@K。
- 版本化数据集：schema 校验、相关性标注检查、canonical SHA-256。
- 实验 run：配置哈希、固定排名、P50/P95 查询延迟和 JSON artifact。

## 运行

在 `memory-os` 目录执行：

```bash
npm run test:intelligence
npm run benchmark:bm25
```

同一数据集内容和参数会产生相同的 run id。计时结果不参与 run id，因为它依赖机器负载。

## Interface

```python
dataset = RetrievalDataset.load("experiments/datasets/retrieval_seed.v1.json")
run = run_bm25_experiment(dataset, BM25ExperimentConfig(k1=1.5, b=0.75, cutoff=5))
```

调用者只提供固定数据集和参数。索引构建、查询执行、指标计算、哈希和延迟统计都封装在 experiment module 内。
