#!/usr/bin/env python3
"""Tag-balance check that ALSO strips <style>...</style> regions, so the
only reported issues are real markup mismatches in HTML.

Usage: python3 scripts/check_balance_regions.py admin.html
"""
import re
import sys

def main():
    path = sys.argv[1]
    html = open(path, encoding='utf-8').read()
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.S)
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S)
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)

    open_re = re.compile(r'<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(?<!/)>')
    close_re = re.compile(r'</([a-zA-Z][a-zA-Z0-9]*)\s*>')
    void = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

    depth = 0
    issues = 0
    for m in open_re.finditer(html):
        tag = m.group(1).lower()
        if tag in void or m.group(0).endswith('/>'):
            continue
        depth += 1
    for m in close_re.finditer(html):
        tag = m.group(1).lower()
        depth -= 1

    print(f"FILE: {path}")
    print(f"Open-div depth at EOF (after stripping style+script+comments): {depth}")
    if depth == 0:
        print("BALANCED ✓")
    else:
        print("UNBALANCED — investigate the last", abs(depth), "tags")

if __name__ == '__main__':
    main()
