import os, asyncio, time
os.environ['PROSPEO_API_KEY'] = os.environ.get('PROSPEO_API_KEY', '')
import lead_sources
async def t():
    t0 = time.time()
    r = await lead_sources.person_search(titles=['VP Sales'], include_mobile=False, limit=25)
    elapsed = time.time() - t0
    print(f'{len(r)} results in {elapsed:.1f}s')
    fn = r[0].get('first_name','') if r else ''
    p0 = r[0] if r else {}
    print(f'First: {p0}')
asyncio.run(t())
