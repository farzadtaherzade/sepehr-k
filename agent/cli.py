#!/usr/bin/env python3
"""Command-line entry point for the EVM Analytics Agent.

Usage:
  python cli.py                              interactive question loop
  python cli.py "which projects have CPI below 0.9?"
  python cli.py --checks                     run the standard deviation checks
  python cli.py --schema                     print the live schema and exit
  python cli.py --verbose "..."              show each SQL query as it runs
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


def main() -> int:
    ap = argparse.ArgumentParser(description="EVM Analytics Agent")
    ap.add_argument("question", nargs="*", help="question to ask; omit for interactive mode")
    ap.add_argument("--checks", action="store_true", help="run standard deviation checks")
    ap.add_argument("--schema", action="store_true", help="print the live DB schema")
    ap.add_argument("--verbose", "-v", action="store_true", help="trace SQL as it runs")
    args = ap.parse_args()

    # Import after dotenv so db.get_connection_url() sees ANALYTICS_DB_URL.
    import db

    if args.schema:
        print(db.get_schema_ddl())
        return 0

    if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        print(
            "No Anthropic credential found.\n"
            "Set ANTHROPIC_API_KEY, or run `ant auth login` to create a profile:\n"
            "  export ANTHROPIC_API_KEY=sk-ant-...\n",
            file=sys.stderr,
        )
        return 2

    from agent import AnalyticsAgent, run_checks

    agent = AnalyticsAgent()

    if args.checks:
        run_checks(agent)
        return 0

    if args.question:
        print(agent.ask(" ".join(args.question), verbose=args.verbose))
        return 0

    print("EVM Analytics Agent - ask about project performance (Ctrl-D to exit).")
    while True:
        try:
            question = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not question:
            continue
        if question.lower() in {"exit", "quit", ":q"}:
            return 0
        try:
            print("\n" + agent.ask(question, verbose=args.verbose))
        except Exception as exc:
            print(f"error: {exc}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
