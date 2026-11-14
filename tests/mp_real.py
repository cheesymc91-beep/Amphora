# Plays a whole online match between two browsers through the real PeerJS meeting point (run by GitHub Actions)
# two players on two browser contexts: host creates a room, guest joins with the code, they play a whole match
import asyncio,json,sys,subprocess,time
from playwright.async_api import async_playwright
SP='.'
MODE=sys.argv[1] if len(sys.argv)>1 else 'p2p'   # p2p | relay
URL='http://localhost:8765/index.html?tcgdebug'
async def page(b,name,W,H,G):
    ctx=await b.new_context(viewport={'width':W,'height':H},has_touch=W<600)
    pass
    pg=await ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(name+': '+str(e)));pg.on('console',lambda m:errs.append(name+' C: '+m.text) if m.type=='error' else None)
    await pg.goto(URL);await pg.wait_for_timeout(1200)
    return pg,errs
c=lambda pg,s:pg.evaluate("s=>{const b=document.querySelector(s);if(b){b.click();return true}return false}",s)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    G={}
    H,eh=await page(b,'host',1200,850,G);Gu,eg=await page(b,'guest',390,844,G)
    for pg in (H,Gu):
      await c(pg,'[data-home=tcg]');await pg.wait_for_timeout(200);await c(pg,'[data-tcg=mp]');await pg.wait_for_timeout(200)
    await c(H,'[data-tcg=mphost]');await H.wait_for_timeout(1500)
    code=await H.evaluate("__tcg.mp.code");print('code',code)
    await H.screenshot(path=SP+'/shots/mp_room.png')
    await Gu.fill('#mpcode',code);await c(Gu,'[data-tcg=mpjoin]')
    for i in range(40):
      await H.wait_for_timeout(500)
      st=await H.evaluate("({l:__tcg.mp.linked,r:__tcg.mp.relay,m:!!__tcg.get()})");
      if st['m']:break
    if not st['m']:
        for n,pg in (('host',H),('guest',Gu)):print(n,await pg.evaluate("JSON.stringify({st:__tcg.mp.st,err:__tcg.mp.err,l:__tcg.mp.linked,r:__tcg.mp.relay,dbg:__tcg.mp.dbg.slice(-25)})"))
    assert st['m'], 'the two devices did not connect'
    print('host link',st,'guest',await Gu.evaluate("({l:__tcg.mp.linked,r:__tcg.mp.relay})"))
    await Gu.wait_for_timeout(1000)
    await H.screenshot(path=SP+'/shots/mp_h0.png');await Gu.screenshot(path=SP+'/shots/mp_g0.png')
    # coin flip choice
    for pg in (H,Gu):
      if await pg.locator('[data-tcg=go1]').count():await c(pg,'[data-tcg=go1]');print('chose first on', 'host' if pg is H else 'guest')
    await H.wait_for_timeout(800)
    # bot loop: whoever's turn it is plays cheap cards and attacks face, then ends
    async def turn(pg):
        for k in range(12):
            r=await pg.evaluate("""()=>{const M=__tcg.get();if(!M||M.over||M.turn!=='p'||__tcg.mp.wait)return 'skip';
              const p=M.p;const i=p.hand.findIndex(c=>c&&c.cost<=p.mana&&!c.tgt&&!c.ally&&!c.unit&&(c.t!=='unit'||p.board.length<5));
              if(i>=0){const el=document.querySelector(`[data-tcg=hand][data-i="${i}"]`);el.click();if(!matchMedia('(hover:hover) and (pointer:fine)').matches)document.querySelector(`[data-tcg=hand][data-i="${i}"]`).click();return 'play'}
              const u=p.board.find(u=>u.ready&&u.atk>0);if(u){document.querySelector(`[data-tcg=mine][data-uid="${u.uid}"]`).click();
                const g=M.a.board.find(x=>x.kw==='Guard');if(g)document.querySelector(`[data-tcg=enemy][data-uid="${g.uid}"]`).click();else document.querySelector('[data-tcg=face]').click();return 'atk'}
              return 'done'}""")
            await pg.wait_for_timeout(350)
            if r in('done','skip'):break
        if r=='done':await c(pg,'[data-tcg=end]');await pg.wait_for_timeout(500)
    shots=0
    for t in range(80):
        over=await H.evaluate("(__tcg.get()||{}).over")
        if over:break
        who=await H.evaluate("__tcg.get().turn")
        await turn(H if who=='p' else Gu)
        if t==5 and shots==0:
            shots=1;await H.screenshot(path=SP+'/shots/mp_h1.png');await Gu.screenshot(path=SP+'/shots/mp_g1.png')
    await Gu.wait_for_timeout(1200)
    ho=await H.evaluate("JSON.stringify({over:__tcg.get().over,n:__tcg.get().n,hp:[__tcg.get().p.hp,__tcg.get().a.hp]})")
    go=await Gu.evaluate("JSON.stringify({over:__tcg.get().over,n:__tcg.get().n,hp:[__tcg.get().p.hp,__tcg.get().a.hp],rw:__tcg.get().rw})")
    print('host',ho);print('guest',go)
    assert '"over"' in ho and '"over":null' not in ho and '"over"' in go, 'the match did not finish'
    await H.screenshot(path=SP+'/shots/mp_h2.png');await Gu.screenshot(path=SP+'/shots/mp_g2.png')
    # hidden info: the guest must never see the host's hand or either deck
    print('guest sees host hand:',await Gu.evaluate("JSON.stringify(__tcg.get().a.hand).slice(0,60)"),' deck:',await Gu.evaluate("JSON.stringify(__tcg.get().p.deck).slice(0,30)"))
    # rematch from the guest
    await c(Gu,'[data-tcg=again]');await H.wait_for_timeout(1500)
    print('rematch new match:',await H.evaluate("!__tcg.get().over"),await Gu.evaluate("!__tcg.get().over"))
    print('errors',eh+eg)
    await b.close()
asyncio.run(main())
