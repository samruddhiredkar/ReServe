const H=3600e3
export const FOOD={
 cooked:{label:'Cooked food',max:6,def:3,mealKg:0.4},
 produce:{label:'Fresh produce',max:72,def:36,mealKg:0.5},
 dry:{label:'Packaged / dry goods',max:2160,def:720,mealKg:0.5}}
// Food recovery hierarchy. r = share of shelf life still left.
export const STAGES=[
 {id:'people',name:'Feed people',short:'NGOs & community kitchens',from:1,color:'#1E7A4F',types:['ngo']},
 {id:'sale',name:'Discounted sale',short:'Canteens & neighbours',from:.5,color:'#C98A00',types:['canteen']},
 {id:'animal',name:'Animal feed',short:'Farms & shelters',from:.25,color:'#D4570F',types:['farm']},
 {id:'compost',name:'Compost / biogas',short:'Composting partners',from:.08,color:'#7A4B2A',types:['compost']}]
export const TYPE_LABEL={ngo:'NGO / kitchen',canteen:'Canteen / neighbour',farm:'Farm / shelter',compost:'Compost / biogas'}
export const EMPTY='expired'
const thr=[1,.5,.25,.08,0]
const total=i=>i.shelfH*H
export const remaining=(i,now)=>i.postedAt+total(i)-now
// Stage is always CALCULATED from time, never stored, so the cascade works with no background jobs.
export function stageIndex(i,now){
  const r=remaining(i,now)/total(i)
  if(r<=0) return 4
  const t=thr.findIndex((v,k)=>r<=v&&r>(thr[k+1]??-1))
  return Math.max(t,0)
}
export function currentStage(i,now){
  if(i.claimedBy) return {id:'claimed'}
  const t=stageIndex(i,now); if(t===4) return {id:EMPTY}
  if(i.forced!=null && i.forced>=t) return {...STAGES[i.forced],forced:true,idx:i.forced}
  return {...STAGES[t],idx:t}
}
export const stageStart=(i,k)=>i.postedAt+total(i)*(1-thr[k])
export const stageEnd=(i,k)=>i.postedAt+total(i)*(1-thr[k+1])
export const fmt=ms=>{
  if(ms<=0) return '0m'
  const m=Math.floor(ms/6e4),d=Math.floor(m/1440),h=Math.floor(m%1440/60)
  if(d) return `${d}d ${h}h`
  if(h) return `${h}h ${m%60}m`
  return `${m}m`}
export function km(a,b,c,d){const R=6371,r=x=>x*Math.PI/180
  const dl=r(c-a),dn=r(d-b),x=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dn/2)**2
  return 2*R*Math.asin(Math.sqrt(x))}
export const eligible=(item,stage,receivers)=>
  receivers.filter(r=>stage.types?.includes(r.type))
   .map(r=>({...r,d:km(item.lat,item.lng,r.lat,r.lng)})).sort((a,b)=>a.d-b.d)
export function impact(items){
  let kg=0,meals=0,people=0,byStage={people:0,sale:0,animal:0,compost:0},wasted=0
  items.forEach(i=>{
    if(i.claimedBy){const s=i.claimStage;kg+=i.kg;byStage[s]+=i.kg
      if(s==='people'||s==='sale'){meals+=Math.round(i.kg/FOOD[i.type].mealKg);people++}}
  })
  return {kg,meals,co2:+(kg*2.5).toFixed(1),byStage,claims:items.filter(i=>i.claimedBy).length}}
export const predict=(hist,enrolled,eating,skipping)=>{
  const last=hist.slice(-5),base=last.length?last.reduce((a,b)=>a+b,0)/last.length:enrolled*0.85
  const answered=eating+skipping
  const p=answered?Math.round(eating+(enrolled-answered)*(base/enrolled)):Math.round(base)
  return {base:Math.round(base),predicted:p,cook:Math.ceil(p*1.05)}}
