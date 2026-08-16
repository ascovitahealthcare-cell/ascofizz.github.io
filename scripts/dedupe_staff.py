#!/usr/bin/env python3
"""Remove the duplicated Staff & Permissions fragment in admin.html.

Locates the two comment markers by their 'STAFF & PERMISSIONS (owner-only)'
text (robust to box-drawing character variants) and removes the first block,
keeping the second (complete) copy.
"""

path = '/home/ubuntu/repos/frontend/admin.html'
src = open(path, encoding='utf-8').read()

need = 'STAFF & PERMISSIONS (owner-only)'
comment_open = '<!-- '
positions = []
i = 0
while True:
    j = src.find(need, i)
    if j < 0:
        break
    start = src.rfind(comment_open, max(0, j - 60), j)
    positions.append(start if start >= 0 else j)
    i = j + len(need)

assert len(positions) == 2, 'expected exactly 2 staff markers, found %d' % len(positions)
idx1, idx2 = positions
block = src[idx1:idx2]
assert 'id="page-staff"' in block, 'first block must contain page-staff'
removed = idx2 - idx1
open(path, 'w', encoding='utf-8').write(src[:idx1] + src[idx2:])
print('Removed %d chars; page-staff count now %d' % (removed, src.count('id="page-staff"') - 1))
