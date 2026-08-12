import re, subprocess, sys

src = open('index.html', encoding='utf-8').read()
# Strip template-literal-ish blocks that are not plain JS (meta pixel etc)
blocks = re.findall(r'<script>(.*?)</script>', src, re.S)
print(f"total blocks: {len(blocks)}")
fails = 0
for i, b in enumerate(blocks):
    proc = subprocess.run(['node', '--check', '-'], input=b, capture_output=True, text=True)
    if proc.returncode != 0:
        fails += 1
        print(f"BLOCK {i} INVALID: {proc.stderr.strip()[:200]}")
print(f"Checked {len(blocks)} blocks; {fails} invalid")
sys.exit(1 if fails else 0)
