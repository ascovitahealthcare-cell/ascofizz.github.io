#!/usr/bin/env python3
"""Check HTML tag balance for files with embedded JS (e.g. admin.html).

Usage: python3 check_balance.py <file.html> [region_start_region_end]

Reports:
  - depth: current open-div count at EOF
  - mismatched close tags
Since script-heavy single-file apps intentionally mix markup and JS strings,
this is a sanity check, not a validator: it ignores tags inside <script>
blocks and inside template literals is approximated by skipping whole
<script>...</script> regions.
"""
import re
import sys

def main():
    path = sys.argv[1]
    html = open(path, encoding='utf-8').read()

    # strip script blocks (contains strings with fake tags)
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S)
    # strip comments
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)

    open_re = re.compile(r'<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(?<!/)>')
    close_re = re.compile(r'</([a-zA-Z][a-zA-Z0-9]*)\s*>')
    void = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

    stack = []
    depth = 0
    issues = []
    for m in open_re.finditer(html):
        tag = m.group(1).lower()
        if tag in void:
            continue
        if m.group(0).endswith('/>'):
            continue
        stack.append(tag)
        depth += 1
    for m in close_re.finditer(html):
        tag = m.group(1).lower()
        if not stack:
            issues.append(f"Orphan close tag </{tag}> at ~pos {m.start()}")
            depth -= 1
            continue
        if stack[-1] != tag:
            issues.append(f"Mismatch: open <{stack[-1]}> closed by </{tag}> at ~pos {m.start()}")
        stack.pop()
        depth -= 1

    print(f"FILE: {path}")
    print(f"Open divs at EOF: {depth}")
    if issues:
        for i in issues[:20]:
            print(" ISSUE:", i)
        if len(issues) > 20:
            print(f" ... and {len(issues)-20} more")
    else:
        print("No mismatched/orphan tags detected.")

if __name__ == '__main__':
    main()
