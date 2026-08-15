#!/usr/bin/env python3
"""Extract inline <script> blocks from admin.html and lint each with node.

Usage: python3 scripts/lint_scripts.py admin.html
Exits 0 if all blocks parse; prints the failing block index on error.
"""
import re
import subprocess
import sys
import tempfile
import os

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'admin.html'
    html = open(path, encoding='utf-8').read()
    scripts = re.findall(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', html, flags=re.S)
    failures = 0
    for i, (attrs, body) in enumerate(scripts):
        if not body.strip():
            continue
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
            f.write(body)
            tmp = f.name
        try:
            r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
            if r.returncode != 0:
                failures += 1
                print(f"FAIL #{i} attrs={attrs.strip()[:70]}")
                print((r.stderr or r.stdout).strip()[:800])
                print('---')
        finally:
            os.unlink(tmp)
    print(f"linted {len(scripts)} script blocks, {failures} failed")
    sys.exit(1 if failures else 0)

if __name__ == '__main__':
    main()
