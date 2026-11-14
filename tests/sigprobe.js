// probe the PeerJS meeting point: which message shapes reach the other client?
const WebSocket=require('ws');
const rnd=()=>Math.random().toString(36).slice(2,10);
function open(id){return new Promise((res)=>{const ws=new WebSocket(`wss://0.peerjs.com/peerjs?key=peerjs&id=${id}&token=${rnd()}&version=1.5.4`,{headers:{Origin:'https://cheesymc91-beep.github.io'}});
  ws.log=[];ws.on('message',d=>{ws.log.push(String(d).slice(0,160));if(String(d).includes('"OPEN"'))res(ws);});ws.on('error',e=>{ws.log.push('ERR '+e.message);res(ws)});ws.on('close',(c,r)=>ws.log.push('CLOSE '+c+' '+r));setTimeout(()=>res(ws),8000);});}
const cid='dc_'+rnd();
const V={
  official_offer:{type:'OFFER',payload:{sdp:{type:'offer',sdp:'v=0\r\n'},type:'data',connectionId:cid,label:cid,reliable:true,serialization:'json',browser:'chrome'}},
  offer_extra:{type:'OFFER',payload:{sdp:{type:'offer',sdp:'v=0\r\n'},type:'data',connectionId:cid,label:cid,reliable:true,serialization:'json',browser:'chrome',tk:'abc'}},
  offer_ours:{type:'OFFER',payload:{sdp:{type:'offer',sdp:'v=0\r\n'},sid:'x',tk:'y'}},
  cand_official:{type:'CANDIDATE',payload:{candidate:{candidate:'candidate:1 1 udp 1 1.2.3.4 5 typ host',sdpMid:'0',sdpMLineIndex:0},type:'data',connectionId:cid}},
  cand_relay_field:{type:'CANDIDATE',payload:{relay:'{"k":"ping"}',type:'data',connectionId:cid}},
  cand_ours:{type:'CANDIDATE',payload:{relay:'{"k":"ping"}',sid:'x'}},
  dst_first:{dst:null,type:'CANDIDATE',payload:{candidate:{candidate:'x'},type:'data',connectionId:cid}},
};
(async()=>{
  for(const [name,msg] of Object.entries(V)){
    const na='amphora-tcg-'+rnd().slice(0,5),A=await open(na),B=await open('amphora-tcg-g-'+rnd());
    const m=Object.assign({},msg,{dst:na});B.send(JSON.stringify(m));
    await new Promise(r=>setTimeout(r,2500));
    console.log(name.padEnd(18),'A got',A.log.length-1,'msgs',JSON.stringify(A.log.slice(1)).slice(0,120),'| B',JSON.stringify(B.log.slice(1)));A.close();B.close();
  }
  process.exit(0);
})();
