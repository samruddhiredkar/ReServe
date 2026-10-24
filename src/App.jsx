import {useState,useEffect,useRef,useMemo} from 'react'
import L from 'leaflet'
import {onAuthStateChanged,signOut} from 'firebase/auth'
import {collection,doc,onSnapshot,query,orderBy,addDoc,updateDoc,setDoc,writeBatch,serverTimestamp} from 'firebase/firestore'
import {auth,db,configured} from './firebase.js'
import AuthScreen from './Auth.jsx'
import {FOOD,STAGES,TYPE_LABEL,currentStage,remaining,fmt,eligible,impact,predict,stageStart,stageEnd} from './logic.js'

const H=3600e3
const norm=(id,d)=>{const o={id};for(const k in d){const v=d[k];o[k]=v&&typeof v.toMillis==='function'?v.toMillis():v}return o}

// Live Firestore store. 'items' -> [rows], 'orgs/uid' (even segments) -> row|null. Returns [data, ready].
export function useStore(path,order){
  const isDoc=path?path.split('/').length%2===0:false
  const [data,setData]=useState(isDoc?null:[]),[ready,setReady]=useState(false)
  useEffect(()=>{setReady(false);setData(isDoc?null:[]);if(!path)return
    const ref=isDoc?doc(db,path):(order?query(collection(db,path),orderBy(order,'desc')):collection(db,path))
    const opt={serverTimestamps:'estimate'}
    return onSnapshot(ref,s=>{setData(isDoc?(s.exists()?norm(s.id,s.data(opt)):null):s.docs.map(d=>norm(d.id,d.data(opt))));setReady(true)},
      e=>{console.error(path,e);setReady(true)})},[path,order])
  return [data,ready]}

export default function App(){
  const [user,setUser]=useState(undefined)
  useEffect(()=>configured?onAuthStateChanged(auth,u=>setUser(u)):undefined,[])
  if(!configured) return <div className="authwrap"><div className="panel"><h2>Firebase is not configured</h2><p>Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Firebase keys, then restart. On Vercel add the same variables in Project Settings and redeploy.</p></div></div>
  if(user===undefined) return <div className="authwrap"><p>Loading…</p></div>
  if(!user) return <AuthScreen/>
  return <Shell uid={user.uid}/>}

function Shell({uid}){
  const [orgs,orgsReady]=useStore('orgs')
  const [items]=useStore('items','postedAt')
  const [tick,setTick]=useState(Date.now())
  const [tab,setTab]=useState('board')
  const [toasts,setToasts]=useState([])
  const [sel,setSel]=useState(null)
  const now=tick
  useEffect(()=>{const t=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(t)},[])
  const me=orgs.find(o=>o.id===uid)
  const toast=m=>{const id=Math.random();setToasts(t=>[...t,{id,m}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),5000)}
  // Real-time alerts: new surplus for my type, and stage changes
  const prev=useRef(null)
  useEffect(()=>{const cur={};items.forEach(i=>cur[i.id]=currentStage(i,now).id)
    if(prev.current&&me){items.forEach(i=>{const s=cur[i.id],p=prev.current[i.id]
      if(p===undefined){const st=currentStage(i,now);if(me.role==='receiver'&&st.types?.includes(me.type))toast(`New surplus open to you: ${i.title} (${i.kg} kg)`)}
      else if(p!==s&&s!=='claimed'&&(me.role==='giver'?i.giverId===me.id:true))toast(s==='expired'?`${i.title} passed its safe window`:`${i.title} moved to: ${STAGES.find(x=>x.id===s)?.name}`)})}
    prev.current=cur},[now,items,me?.id])
  if(!orgsReady) return <div className="authwrap"><p>Loading…</p></div>
  if(!me) return <div className="authwrap"><div className="panel"><h2>Setting up your profile…</h2><p className="sub">If this takes more than a few seconds, sign out and register again.</p><button className="ghost dark" onClick={()=>signOut(auth)}>Sign out</button></div></div>
  const receivers=orgs.filter(o=>o.role==='receiver'),givers=orgs.filter(o=>o.role==='giver')
  const giver=me.role==='giver'
  const claim=async item=>{const st=currentStage(item,now)
    try{await updateDoc(doc(db,'items',item.id),{claimedBy:me.id,claimStage:st.id,claimedAt:serverTimestamp()});toast('Claimed. Contact the giver to arrange pickup.')}
    catch(e){toast(e.code==='permission-denied'?'Too late: it was claimed or moved to the next stage. Check the board.':'Could not claim. Try again.')}}
  const override=async(id,k)=>{try{await updateDoc(doc(db,'items',id),{forced:k===''?null:+k})}catch(e){toast('Could not change the route.')}}
  const add=async it=>{try{await addDoc(collection(db,'items'),{...it,giverId:me.id,giverName:me.name,lat:me.lat,lng:me.lng,forced:null,safetyConfirmed:true,postedAt:serverTimestamp()});toast('Posted. The Spoilage Clock has started.');setTab('board')}
    catch(e){toast('Could not post. Check your details and try again.')}}
  const live=items.filter(i=>!['claimed','expired'].includes(currentStage(i,now).id))
  const im=impact(items)
  const tabs=[['board','Live board'],...(giver?[['post','Post surplus']]:[]),['mess','Mess planner'],['impact','Impact']]
  return <div className="app">
    <header className="top">
      <div className="brand"><span className="logo">Re<b>Serve</b></span><span className="tag">What is the best use of this food right now?</span></div>
      <nav className="tabs" role="tablist">{tabs.map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}</nav>
      <div className="demo"><span>{me.name} · {giver?'Giver':TYPE_LABEL[me.type]}</span><button onClick={()=>signOut(auth)}>Sign out</button></div>
    </header>
    <main>
    {tab==='board'&&<Board {...{items,now,me,receivers,claim,override,sel,setSel,live,im}}/>}
    {tab==='post'&&giver&&<Post me={me} onAdd={add}/>}
    {tab==='mess'&&<Mess {...{me,givers,goPost:()=>setTab('post')}}/>}
    {tab==='impact'&&<Impact {...{im,items,now,live}}/>}
    </main>
    <footer>Only post food that was stored hygienically and is inside its safe window. Receivers confirm quality on pickup.</footer>
    <div className="toasts" aria-live="polite">{toasts.map(t=><div key={t.id} className="toast">{t.m}</div>)}</div>
  </div>}

function Board({items,now,me,receivers,claim,override,sel,setSel,live,im}){
  const [filter,setFilter]=useState('all')
  const list=items.filter(i=>filter==='all'||i.type===filter)
  const open=items.filter(i=>!['claimed','expired'].includes(currentStage(i,now).id))
  return <>
    <section className="hero">
      <h1>Food is a ticking clock. ReServe moves it to the best use before time runs out.</h1>
      <div className="stats"><div><b>{live.length}</b> items on the clock</div><div><b>{im.kg}</b> kg rescued</div><div><b>{im.meals}</b> meals served</div></div>
    </section>
    <div className="bar"><div className="seg">{[['all','All'],['cooked','Cooked'],['produce','Produce'],['dry','Packaged']].map(([k,l])=><button key={k} className={filter===k?'on':''} onClick={()=>setFilter(k)}>{l}</button>)}</div></div>
    <div className="split">
      <div className="cards">{list.length===0&&<p className="empty">{me.role==='giver'?'Nothing posted yet. Use Post surplus to start a clock.':'No surplus right now. New items appear here the moment they are posted.'}</p>}
        {list.map(i=><Card key={i.id} {...{item:i,now,me,receivers,claim,override,sel,setSel}}/>)}</div>
      <div className="mapwrap"><MapView items={open} now={now} sel={sel} setSel={setSel} me={me}/>
        <div className="legend">{STAGES.map(s=><span key={s.id}><i style={{background:s.color}}/>{s.name}</span>)}</div></div>
    </div></>}

function Card({item,now,me,receivers,claim,override,sel,setSel}){
  const st=currentStage(item,now),done=st.id==='claimed',exp=st.id==='expired'
  const targets=useMemo(()=>done||exp?[]:eligible(item,st,receivers),[item,st.id,receivers])
  const canClaim=me.role==='receiver'&&st.types?.includes(me.type)
  const claimer=receivers.find(r=>r.id===item.claimedBy)
  return <article className={'card'+(sel===item.id?' sel':'')} onClick={()=>setSel(item.id)}>
    <div className="row"><Ring item={item} now={now}/>
      <div className="grow"><h3>{item.title}</h3>
        <p className="meta">{FOOD[item.type].label} · {item.kg} kg · from {item.giverName}</p>
        <p className="stage" style={{color:st.color||'inherit'}}>{done?`Claimed by ${claimer?.name||'a receiver'} (${STAGES.find(s=>s.id===item.claimStage)?.name})`:exp?'Past its safe window. Please discard safely.':`Now: ${st.name}${st.forced?' (set by giver)':''}`}</p></div></div>
    <ol className="path">{STAGES.map((s,k)=>{const a=stageStart(item,k),b=stageEnd(item,k)
      const state=done||exp?(now>=b?'past':'idle'):now>=b?'past':now>=a?'now':'next'
      return <li key={s.id} className={state} style={{'--c':s.color}} title={s.short}><span>{s.name}</span><small>{state==='past'?'passed':state==='now'?`ends in ${fmt(b-now)}`:`in ${fmt(a-now)}`}</small></li>})}</ol>
    {!done&&!exp&&<div className="actions" onClick={e=>e.stopPropagation()}>
      {me.role==='receiver'&&<><button className="primary" disabled={!canClaim} onClick={()=>claim(item)}>{canClaim?`Claim for ${me.name}`:`Open to ${TYPE_LABEL[st.types[0]]} right now`}</button>
        {targets.length>0&&<span className="hint">Alerted nearest: {targets.slice(0,3).map(t=>`${t.name} (${t.d.toFixed(1)} km)`).join(', ')}</span>}</>}
      {me.role==='giver'&&item.giverId===me.id&&<label className="sel">Override route <select value={item.forced??''} onChange={e=>override(item.id,e.target.value)}>
        <option value="">Automatic cascade</option>{STAGES.map((s,k)=><option key={s.id} value={k}>{s.name}</option>)}</select></label>}
    </div>}
  </article>}

function Ring({item,now,size=84}){
  const st=currentStage(item,now),tot=item.shelfH*H,r=Math.max(0,Math.min(1,remaining(item,now)/tot))
  const R=size/2-6,C=2*Math.PI*R,col=st.color||(st.id==='claimed'?'#1E7A4F':'#8A8F8B')
  return <svg width={size} height={size} className="ring" role="img" aria-label={`${fmt(remaining(item,now))} left`}>
    <circle cx={size/2} cy={size/2} r={R} className="rt"/>
    <circle cx={size/2} cy={size/2} r={R} className="rv" stroke={col} strokeDasharray={C} strokeDashoffset={C*(1-(st.id==='claimed'?1:r))} transform={`rotate(-90 ${size/2} ${size/2})`}/>
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="rtxt">{st.id==='claimed'?'Done':st.id==='expired'?'0m':fmt(remaining(item,now))}</text></svg>}

function MapView({items,now,sel,setSel,me}){
  const el=useRef(),map=useRef(),layer=useRef()
  useEffect(()=>{map.current=L.map(el.current,{scrollWheelZoom:false}).setView([19.07,72.88],11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map.current)
    layer.current=L.layerGroup().addTo(map.current);return()=>map.current.remove()},[])
  useEffect(()=>{layer.current.clearLayers()
    const dot=(c,s,ring)=>L.divIcon({className:'',iconSize:[s,s],html:`<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};border:3px solid #fff;box-shadow:0 0 0 ${ring?3:1}px ${ring?c:'#0003'}"></div>`})
    items.forEach(i=>{const st=currentStage(i,now);if(!st.color)return
      L.marker([i.lat,i.lng],{icon:dot(st.color,sel===i.id?26:20,sel===i.id)}).addTo(layer.current)
       .bindTooltip(`${i.title}: ${fmt(remaining(i,now))} left`).on('click',()=>setSel(i.id))})
    if(me)L.marker([me.lat,me.lng],{icon:L.divIcon({className:'',iconSize:[18,18],html:'<div style="width:18px;height:18px;background:#14201A;border:3px solid #fff;transform:rotate(45deg)"></div>'})}).addTo(layer.current).bindTooltip(`You: ${me.name}`)
    const s=items.find(i=>i.id===sel);if(s)map.current.panTo([s.lat,s.lng])},[items,now,sel,me])
  return <div ref={el} className="map" aria-label="Map of surplus food"/>}

function Post({me,onAdd}){
  const [f,setF]=useState({title:'',type:'cooked',kg:'',shelfH:3,safe:false})
  const F=FOOD[f.type],set=(k,v)=>setF(x=>({...x,[k]:v}))
  const changeType=t=>setF(x=>({...x,type:t,shelfH:FOOD[t].def}))
  const err=f.title.trim().length<2?'Add a short description of the food.':!(+f.kg>0)?'Enter the quantity in kg.':!(+f.shelfH>=0.05)?'Enter how many hours the food stays safe.':+f.shelfH>F.max?`${F.label} can be listed for at most ${F.max} hours.`:!f.safe?'Confirm the food safety check.':''
  const submit=e=>{e.preventDefault();if(err)return;onAdd({title:f.title.trim(),type:f.type,kg:+f.kg,shelfH:+f.shelfH})}
  return <form className="panel form" onSubmit={submit}>
    <h2>Post surplus food</h2><p className="sub">The clock starts when you post, using server time. Pickup is from {me.name}.</p>
    <label>What is it?<input value={f.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Veg pulao and curd, 40 plates"/></label>
    <label>Type of food<select value={f.type} onChange={e=>changeType(e.target.value)}>{Object.entries(FOOD).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>
    <div className="two"><label>Quantity (kg)<input type="number" min="1" value={f.kg} onChange={e=>set('kg',e.target.value)}/></label>
      <label>Safe for (hours)<input type="number" min="0.05" step="any" max={F.max} value={f.shelfH} onChange={e=>set('shelfH',e.target.value)}/></label></div>
    <label className="chk"><input type="checkbox" checked={f.safe} onChange={e=>set('safe',e.target.checked)}/>This food was cooked or stored hygienically, covered, and has not been served from a shared plate.</label>
    {err&&<p className="err" role="alert">{err}</p>}
    <button className="primary" disabled={!!err}>Start the Spoilage Clock</button></form>}

function Chart({hist,predicted}){
  const days=[...hist.slice(-7).map((v,k,a)=>({l:`D-${a.length-k}`,v})),{l:'Today',v:predicted,pred:true}]
  const max=Math.max(1,...days.map(d=>d.v))
  return <svg viewBox="0 0 400 160" className="chart" role="img" aria-label="Past meals eaten and today's prediction">
    {days.map((d,k)=>{const h=d.v/max*115,x=14+k*46;return <g key={k}><rect x={x} y={130-h} width="34" height={h} rx="3" fill={d.pred?'#D4570F':'#1E7A4F'}/><text x={x+17} y={125-h} textAnchor="middle" fontSize="10">{d.v}</text><text x={x+17} y="148" textAnchor="middle" fontSize="10" fill="#5B665F">{d.l}</text></g>})}</svg>}

function Mess({me,givers,goPost}){return <div className="stack">{me.role==='giver'&&<MessPlan me={me} goPost={goPost}/>}<MessVote givers={givers} uid={me.id}/></div>}

function MessPlan({me,goPost}){
  const [mess,ready]=useStore(`mess/${me.id}`),[votes]=useStore(`mess/${me.id}/votes`)
  const [actual,setActual]=useState('')
  useEffect(()=>{if(ready&&!mess)setDoc(doc(db,'mess',me.id),{enrolled:100,history:[],updatedAt:serverTimestamp()}).catch(console.error)},[ready,mess])
  if(!mess) return <div className="panel">Setting up your planner…</div>
  const eating=votes.filter(v=>v.choice==='eating').length,skipping=votes.filter(v=>v.choice==='skipping').length
  const p=predict(mess.history,mess.enrolled,eating,skipping)
  const save=patch=>updateDoc(doc(db,'mess',me.id),{enrolled:mess.enrolled,history:mess.history,...patch,updatedAt:serverTimestamp()})
  const endMeal=async()=>{const a=Math.max(0,Math.round(+actual||p.predicted));const b=writeBatch(db)
    b.update(doc(db,'mess',me.id),{history:[...mess.history,a].slice(-14),updatedAt:serverTimestamp()})
    votes.forEach(v=>b.delete(doc(db,'mess',me.id,'votes',v.id)));await b.commit();setActual('')}
  return <div className="panel"><h2>Mess planner: cook less, waste less</h2>
    <p className="sub">Diners reply from their own accounts. The planner combines live replies with your last 5 meals for everyone who has not replied.</p>
    <div className="two"><div><label className="sel">Diners enrolled <input type="number" min="1" defaultValue={mess.enrolled} onBlur={e=>{const n=Math.round(+e.target.value);if(n>=1&&n<=10000&&n!==mess.enrolled)save({enrolled:n})}}/></label>
      <p className="sub">Eating: {eating} · Skipping: {skipping} · Not replied: {Math.max(0,mess.enrolled-eating-skipping)}</p></div>
      <div className="reco"><span>Cook for</span><b>{p.cook}</b><span>portions (predicted {p.predicted} + 5% buffer)</span></div></div>
    <Chart hist={mess.history} predicted={p.predicted}/>
    <p className="sub">Green: meals actually eaten. Orange: prediction for this meal.</p>
    <div className="actions"><label className="sel">Meals actually eaten <input type="number" min="0" value={actual} placeholder={String(p.predicted)} onChange={e=>setActual(e.target.value)}/></label>
      <button className="ghost dark" onClick={endMeal}>Close this meal</button>
      <button className="primary" onClick={goPost}>Cooked too much? Post the surplus</button></div></div>}

function MessVote({givers,uid}){
  const [gid,setG]=useState(''),[votes]=useStore(gid?`mess/${gid}/votes`:null)
  const mine=votes.find(v=>v.id===uid)?.choice
  const vote=c=>setDoc(doc(db,'mess',gid,'votes',uid),{choice:c,at:serverTimestamp()}).catch(console.error)
  return <div className="panel"><h2>Tell a mess you are eating</h2><p className="sub">Your reply helps the kitchen cook the right amount.</p>
    <label className="sel">Mess or canteen <select value={gid} onChange={e=>setG(e.target.value)}><option value="">Choose one</option>{givers.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
    {gid&&<div className="actions"><div className="seg big"><button className={mine==='eating'?'on':''} onClick={()=>vote('eating')}>I'm eating</button><button className={mine==='skipping'?'on':''} onClick={()=>vote('skipping')}>I'm skipping</button></div>
      <span className="hint">{votes.filter(v=>v.choice==='eating').length} eating · {votes.filter(v=>v.choice==='skipping').length} skipping so far</span></div>}</div>}

function Impact({im,items,now,live}){
  const mx=Math.max(1,...Object.values(im.byStage))
  const atRisk=live.filter(i=>currentStage(i,now).idx>=2).length
  return <div className="panel"><h2>Impact</h2>
    <div className="kpis"><div><b>{im.kg}</b><span>kg diverted from landfill</span></div><div><b>{im.meals}</b><span>meals served</span></div><div><b>{im.co2}</b><span>kg CO₂e avoided (estimate)</span></div><div><b>{im.claims}</b><span>successful claims</span></div></div>
    <h3>Where the food went</h3>
    {STAGES.map(s=><div key={s.id} className="hb"><span>{s.name}</span><div><i style={{width:im.byStage[s.id]/mx*100+'%',background:s.color}}/></div><b>{im.byStage[s.id]} kg</b></div>)}
    <p className="sub">{atRisk} item(s) are late in the cascade and need a claim soon. Meals = kg ÷ 0.4 for cooked food and kg ÷ 0.5 otherwise, counted only when food is routed to people. CO₂e uses an average of 2.5 kg CO₂e per kg of food waste avoided; treat it as an estimate.</p></div>}
