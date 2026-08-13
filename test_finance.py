import asyncio, json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await pg.goto('http://localhost:8899/admin.html')
        # Login via the backend API exactly like the panel does
        tok_r = await pg.evaluate("""
            async () => {
              const r = await fetch('https://ascovitahealthcare-cell-github-io.onrender.com/api/admin/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Origin': 'https://ozylix.com'},
                body: JSON.stringify({ username: 'owner', password: '12.12.13.14' })
              });
              const d = await r.json();
              localStorage.setItem('ascovita_token', d.token || '');
              localStorage.setItem('ascovita_role', d.role || '');
              return { ok: r.ok, role: d.role };
            }
        """)
        print('login:', tok_r)
        await pg.reload()
        await pg.wait_for_timeout(1500)
        # Click Finance nav
        fin_nav = pg.locator("#navSecFinance .nav-item").filter(has_text='Finance')
        try:
            await fin_nav.click(timeout=5000)
            print('clicked finance nav')
        except Exception as e:
            print('click failed:', e)
            navs = await pg.locator('.nav-item').all_inner_texts()
            print('nav items:', navs)
        await pg.wait_for_timeout(8000)
        results = await pg.evaluate("""
            () => {
              const g = id => document.getElementById(id);
              return {
                kpis: g('financeKpis') ? g('financeKpis').innerText : 'missing',
                srBody: g('finSrBody') ? g('finSrBody').innerText : 'missing',
                dlBody: g('finDlBody') ? g('finDlBody').innerText : 'missing',
                cfBody: g('finCfBody') ? g('finCfBody').innerText : 'missing',
                apiStatus: g('financeApiStatus') ? g('financeApiStatus').innerText : 'missing',
                settleTbody: g('finSettleTbody') ? g('finSettleTbody').innerText : 'missing',
              };
            }
        """)
        print(json.dumps(results, indent=2, ensure_ascii=False)[:2500])
        await pg.screenshot(path='/home/ubuntu/frontend/finance_page.png', full_page=True)
        await b.close()

asyncio.run(main())
