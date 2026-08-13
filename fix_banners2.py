#!/usr/bin/env python3
path = '/home/ubuntu/frontend/admin.html'
src = open(path, encoding='utf-8').read()

old = "let banners = [...DEMO_BANNERS];\n\nfunction loadBanners() {"
new = ("let banners = [...DEMO_BANNERS];\n\n"
       "async function loadBanners() {\n"
       "  // Real source of truth: the promo-media table (home-page marquee cards).\n"
       "  try {\n"
       "    const r = await apiFetch('/api/admin/promo-media');\n"
       "    const d = await r.json();\n"
       "    banners = (d.data || []).map(c => ({ id: c.id, title: String(c.src).split('/').pop().split('?')[0].replace(/\\.\\w+$/, ''), url: c.src, active: !!c.active }));\n"
       "  } catch (e) { banners = [...DEMO_BANNERS]; }\n"
       "  renderBanners();\n"
       "}\nfunction renderBanners() {")
assert old in src, 'anchor missing'
src = src.replace(old, new, 1)
open(path, 'w', encoding='utf-8').write(src)
print('OK' if 'async function loadBanners()' in src else 'FAIL')
