#!/usr/bin/env python3
"""Make the admin 'Banners' page (page-banners) real: persist uploads to the
promo-media table (which the storefront marquee reads) instead of a local
array, and load existing cards from the DB."""
import re

path = '/home/ubuntu/frontend/admin.html'
src = open(path, encoding='utf-8').read()

# 1) loadBanners: fetch from promo-media table
src = src.replace(
    "let banners = [...DEMO_BANNERS];\nfunction loadBanners() {",
    "let banners = [...DEMO_BANNERS];\n\n"
    "async function loadBanners() {\n"
    "  // Real source of truth: the promo-media table (home-page marquee cards).\n"
    "  try {\n"
    "    const r = await apiFetch('/api/admin/promo-media');\n"
    "    const d = await r.json();\n"
    "    banners = (d.data || []).map(c => ({ id: c.id, title: String(c.src).split('/').pop().split('?')[0].replace(/\\.\\w+$/, ''), url: c.src, active: !!c.active }));\n"
    "  } catch (e) { banners = [...DEMO_BANNERS]; }\n"
    "  renderBanners();\n"
    "}\nfunction renderBanners() {"
)

# 2) uploadBanner: persist to promo-media
src = src.replace(
    "    banners.push({id:Date.now(), title:file.name.replace(/\\.[^.]+$/,''), url:d.url, active:true});\n"
    "    loadBanners(); toast('Banner uploaded ✅');",
    "    await apiFetch('/api/admin/promo-media', {\n"
    "      method:'POST',\n"
    "      body: JSON.stringify({ src: d.url, type: file.type.startsWith('video/') ? 'video' : 'image', cta_page: 'shop', active: true })\n"
    "    });\n"
    "    loadBanners(); toast((file.type.startsWith('video/') ? 'Video' : 'Banner') + ' uploaded ✅ — live on the home page now');"
)

# 3) remove button → removeBanner(i)
src = src.replace(
    "onclick=\"banners.splice(${i},1);loadBanners();toast('Banner removed')\"",
    "onclick=\"removeBanner(${i})\""
)

# 4) active toggle → persist to DB
src = src.replace(
    "onchange=\"banners[${i}].active=this.checked;toast('Banner '+this.checked?'enabled':'disabled')\"",
    "onchange=\"banners[${i}].active=this.checked;(function(id,ac){if(id){apiFetch('/api/admin/promo-media/'+id,{method:'PUT',body:JSON.stringify({active:ac})}).catch(()=>{})}toast('Banner '+(ac?'enabled':'hidden'))})(${b.id||0},this.checked)\""
)

# 5) add removeBanner function after uploadBanner block end (before PHOTO LIBRARY comment)
anchor = "// ═══════════════════════════════════════════════\n// PHOTO LIBRARY"
newfn = (
    "async function removeBanner(index) {\n"
    "  const b = banners[index]; if (!b || !b.id) { banners.splice(index,1); renderBanners(); return; }\n"
    "  if (!confirm('Remove this banner (its file is also deleted from storage)? This can\\'t be undone.')) return;\n"
    "  try {\n"
    "    if (b.url) {\n"
    "      const filename = String(b.url).split('/').pop().split('?')[0];\n"
    "      await apiFetch(`/api/upload/image/${encodeURIComponent(filename)}`, {method:'DELETE'}).catch(()=>{});\n"
    "    }\n"
    "    await apiFetch(`/api/admin/promo-media/${encodeURIComponent(b.id)}`, {method:'DELETE'}).catch(()=>{});\n"
    "    banners.splice(index,1);\n"
    "    renderBanners(); toast('🗑️ Banner removed');\n"
    "  } catch(e) { toast('Could not delete: ' + e.message,'error'); }\n"
    "}\n"
    + anchor
)
src = src.replace(anchor, newfn)

open(path, 'w', encoding='utf-8').write(src)

# verify
checks = [
    "async function loadBanners()",
    "async function removeBanner(index)",
    "method:'POST',\n      body: JSON.stringify({ src: d.url",
    "removeBanner(${i})",
    "renderBanners()",
]
ok = True
for c in checks:
    if c not in src:
        print('MISSING:', c); ok = False
print('patched OK' if ok else 'INCOMPLETE')
