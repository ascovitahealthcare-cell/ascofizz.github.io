#!/usr/bin/env python3
"""Insert the Customer 360 tabs module into admin.html (idempotent: skip if
the az360Open marker already exists)."""

path = '/home/ubuntu/repos/frontend/admin.html'
frag = '/home/ubuntu/repos/frontend/_page_customer360.html'
src = open(path, encoding='utf-8').read()
if 'az360Open' in src:
    print('already patched')
    raise SystemExit(0)
frag_src = open(frag, encoding='utf-8').read()

# Insert directly before the customers insight drawer markup: find the div with
# id="custDrawer" (the drawer container) and place the script right before it.
anchor = '<!-- ═════════════ CUSTOMER INSIGHT DRAWER (Aug 2026: re-targeting) ═════════════ -->'
# The drawer may be declared differently; fall back to searching for the title element.
idx = src.find(anchor)
if idx < 0:
    # fallback: find custDrawerTitle element and walk back to its enclosing div line start
    j = src.find('id="custDrawerTitle"')
    if j < 0:
        print('anchor not found')
        raise SystemExit(1)
    line_start = src.rfind('\n', 0, j) + 1
    while line_start > 0 and src[line_start - 1] != '\n':
        line_start -= 1
    # walk up to find the start of the block containing id=custDrawer
    k = src.rfind('custDrawer"', 0, j)
    line_start = src.rfind('\n', 0, k) + 1
    idx = line_start

open(path, 'w', encoding='utf-8').write(src[:idx] + frag_src + '\n' + src[idx:])
print('patched at index %d' % idx)
