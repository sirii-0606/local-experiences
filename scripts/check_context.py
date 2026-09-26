"""Fail if the diff vs <base> changes code but adds no docs/context/*.md file."""
import subprocess
import sys

base = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
files = subprocess.check_output(
    ["git", "diff", "--name-status", f"{base}...HEAD"], text=True
).splitlines()

CODE = ("backend/", "frontend/", "scripts/", ".github/")
code_changed = any(l.split("\t")[-1].startswith(CODE) for l in files)
ctx_added = any(
    l.startswith("A") and l.split("\t")[-1].startswith("docs/context/") for l in files
)
if code_changed and not ctx_added:
    sys.exit("Code changed but no new docs/context/YYYY-MM-DD-NN-slug.md file added.")
print("context check ok")
