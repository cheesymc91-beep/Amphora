# does the official PeerJS library still work with the free cloud, and what exactly does it send?
import asyncio
from playwright.async_api import async_playwright
HTML='<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();out={}
    pages=[]
    for n in ('A','B'):
      pg=await b.new_page();out[n]=[];pages.append(pg)
      pg.on('websocket',lambda ws,n=n:(out[n].append('WS '+ws.url),ws.on('framesent',lambda f,n=n:out[n].append('> '+str(f)[:300])),ws.on('framereceived',lambda f,n=n:out[n].append('< '+str(f)[:300])),ws.on('close',lambda w,n=n:out[n].append('CLOSED'))))
      pg.on('console',lambda m,n=n:out[n].append('console '+m.text[:200]))
      await pg.goto('about:blank');await pg.set_content(HTML);await pg.wait_for_timeout(2500)
    A,B=pages
    await A.evaluate("""()=>{window.got=[];const p=new Peer('amphora-probe-'+Math.random().toString(36).slice(2,8),{debug:2});window.P=p;p.on('open',id=>window.aid=id);p.on('connection',c=>c.on('data',d=>window.got.push(d)));p.on('error',e=>console.log('A err '+e.type))}""")
    await A.wait_for_timeout(3000);aid=await A.evaluate("window.aid");print('A id',aid)
    await B.evaluate("""id=>{window.st=[];const p=new Peer({debug:2});p.on('error',e=>{window.st.push('err '+e.type);console.log('B err '+e.type)});p.on('open',()=>{const c=p.connect(id);c.on('open',()=>{window.st.push('open');c.send('hi')});});}""",aid)
    await B.wait_for_timeout(12000)
    print('A received',await A.evaluate("window.got"),'B',await B.evaluate("window.st"))
    for n in out:
      print('----',n);[print(x) for x in out[n][:30]]
    await b.close()
asyncio.run(main())
