// probe the PeerJS meeting point: does a message from B reach A?
const WebSocket=require('ws');
const rnd=()=>Math.random().toString(36).slice(2,10);
function open(id,extra=''){return new Promise((res,rej)=>{const ws=new WebSocket(`wss://0.peerjs.com:443/peerjs?key=peerjs&id=${id}&token=${rnd()}&version=1.5.4${extra}`);
  ws.log=[];ws.on('message',d=>{ws.log.push(String(d).slice(0,200));if(String(d).includes('"OPEN"'))res(ws);});ws.on('error',e=>rej(e));ws.on('close',(c,r)=>ws.log.push('CLOSE '+c+' '+r));setTimeout(()=>res(ws),8000);});}
(async()=>{
  for(const [na,nb] of [[rnd(),rnd()],['amphora-tcg-'+rnd().slice(0,5),'amphora-tcg-g-'+rnd()]]){
    const A=await open(na),B=await open(nb);
    B.send(JSON.stringify({type:'OFFER',dst:na,payload:{sdp:{type:'offer',sdp:'v=0'},type:'data',connectionId:'dc_'+rnd(),label:'x',serialization:'json',reliable:true,browser:'chrome'}}));
    B.send(JSON.stringify({type:'CANDIDATE',dst:na,payload:{relay:'{"k":"ping"}',sid:'abc'}}));
    await new Promise(r=>setTimeout(r,4000));
    console.log('ids',na,nb);console.log('A got:',A.log);console.log('B got:',B.log);A.close();B.close();
  }
  process.exit(0);
})();
