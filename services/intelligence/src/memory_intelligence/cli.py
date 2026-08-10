"""Command-line entry points for reproducible intelligence experiments."""

from __future__ import annotations

import argparse
import json
from typing import Sequence

from .experiment import BM25ExperimentConfig, RetrievalDataset, run_bm25_experiment


def main(argv: Sequence[str] | None = None) -> int:
    """Run a versioned retrieval benchmark and print its artifact as JSON."""

    parser = argparse.ArgumentParser(prog="memory-intelligence")
    subparsers = parser.add_subparsers(dest="command", required=True)
    benchmark = subparsers.add_parser("benchmark", help="run the BM25 baseline")
    benchmark.add_argument("dataset")
    benchmark.add_argument("--k1", type=float, default=1.5)
    benchmark.add_argument("--b", type=float, default=0.75)
    benchmark.add_argument("--cutoff", type=int, default=10)
    args = parser.parse_args(argv)

    if args.command == "benchmark":
        dataset = RetrievalDataset.load(args.dataset)
        run = run_bm25_experiment(
            dataset,
            BM25ExperimentConfig(k1=args.k1, b=args.b, cutoff=args.cutoff),
        )
        print(json.dumps(run.to_dict(), ensure_ascii=False, indent=2))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
