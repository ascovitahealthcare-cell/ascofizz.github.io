import re, subprocess, sys, os

html = open('index.html', encoding='utf-8').read()
scripts = re.findall(r'<script(?![^>]*type="application/ld\+json")[^>]*>(.*?)</script>', html, re.S)
tmpdir = '/tmp/ozylx-lint'
os.makedirs(tmpdir, exist_ok=True)
bad = 0
for i, s in enumerate(scripts):
    p = os.path.join(tmpdir, f's{i}.js')
    open(p, 'w').write(s)
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    if r.returncode != 0:
        bad += 1
        print(f'BLOCK {i} INVALID: {r.stderr.strip().splitlines()[-1]}')
print(f'Checked {len(scripts)} blocks; {bad} invalid')
sys.exit(1 if bad else 0)
