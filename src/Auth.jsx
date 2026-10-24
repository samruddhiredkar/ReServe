import {useState} from 'react'
import {createUserWithEmailAndPassword,signInWithEmailAndPassword,deleteUser} from 'firebase/auth'
import {doc,setDoc,serverTimestamp} from 'firebase/firestore'
import {auth,db} from './firebase.js'
const MSG={'auth/invalid-credential':'Email or password is incorrect.','auth/email-already-in-use':'An account with this email already exists. Log in instead.','auth/weak-password':'Use a password with at least 6 characters.','auth/invalid-email':'Enter a valid email address.','auth/too-many-requests':'Too many attempts. Wait a minute and try again.','permission-denied':'Your profile could not be saved. Check the Firestore rules are published.'}
export default function AuthScreen(){
  const [mode,setMode]=useState('login'),[err,setErr]=useState(''),[busy,setBusy]=useState(false)
  const [f,setF]=useState({email:'',pw:'',name:'',role:'giver',type:'ngo',lat:'',lng:''})
  const set=(k,v)=>setF(x=>({...x,[k]:v}))
  const locate=()=>navigator.geolocation?navigator.geolocation.getCurrentPosition(
    p=>{set('lat',p.coords.latitude.toFixed(5));set('lng',p.coords.longitude.toFixed(5))},
    ()=>setErr('Location is blocked. Enter your latitude and longitude manually.')):setErr('This browser cannot share location. Enter it manually.')
  const submit=async e=>{e.preventDefault();setErr('')
    const lat=parseFloat(f.lat),lng=parseFloat(f.lng)
    if(mode==='register'){
      if(f.name.trim().length<2) return setErr('Enter your organisation name.')
      if(!(lat>=-90&&lat<=90&&lng>=-180&&lng<=180)) return setErr('Set your location so food can be matched by distance.')}
    setBusy(true)
    try{
      if(mode==='login') await signInWithEmailAndPassword(auth,f.email,f.pw)
      else{
        const c=await createUserWithEmailAndPassword(auth,f.email,f.pw)
        try{await setDoc(doc(db,'orgs',c.user.uid),{name:f.name.trim(),role:f.role,...(f.role==='receiver'?{type:f.type}:{}),lat,lng,createdAt:serverTimestamp()})}
        catch(x){await deleteUser(c.user);throw x}}
    }catch(x){setErr(MSG[x.code]||'Something went wrong. Please try again.')}
    setBusy(false)}
  const reg=mode==='register'
  return <div className="authwrap"><form className="panel form auth" onSubmit={submit}>
    <div className="logo big">Re<b>Serve</b></div>
    <h2>{reg?'Create your account':'Log in'}</h2>
    <p className="sub">{reg?'Choose the role that matches your organisation. It cannot be changed later.':'Welcome back. See what is on the clock near you.'}</p>
    {reg&&<><div className="roles">
      <label className={f.role==='giver'?'on':''}><input type="radio" name="role" checked={f.role==='giver'} onChange={()=>set('role','giver')}/><b>Giver</b><span>Canteen, mess, restaurant, event or farm with surplus</span></label>
      <label className={f.role==='receiver'?'on':''}><input type="radio" name="role" checked={f.role==='receiver'} onChange={()=>set('role','receiver')}/><b>Receiver</b><span>NGO, kitchen, canteen, farm, shelter or compost partner</span></label></div>
      <label>Organisation name<input value={f.name} onChange={e=>set('name',e.target.value)} autoComplete="organization"/></label>
      {f.role==='receiver'&&<label>What do you do with food?<select value={f.type} onChange={e=>set('type',e.target.value)}>
        <option value="ngo">Serve meals (NGO or community kitchen)</option><option value="canteen">Buy at a discount (canteen or neighbours)</option>
        <option value="farm">Feed animals (farm or shelter)</option><option value="compost">Compost or biogas</option></select></label>}
      <div className="two"><label>Latitude<input value={f.lat} onChange={e=>set('lat',e.target.value)} inputMode="decimal"/></label>
        <label>Longitude<input value={f.lng} onChange={e=>set('lng',e.target.value)} inputMode="decimal"/></label></div>
      <button type="button" className="ghost dark" onClick={locate}>Use my current location</button></>}
    <label>Email<input type="email" value={f.email} onChange={e=>set('email',e.target.value)} autoComplete="email" required/></label>
    <label>Password<input type="password" value={f.pw} onChange={e=>set('pw',e.target.value)} autoComplete={reg?'new-password':'current-password'} required minLength={6}/></label>
    {err&&<p className="err" role="alert">{err}</p>}
    <button className="primary" disabled={busy}>{busy?'Please wait…':reg?'Create account':'Log in'}</button>
    <button type="button" className="link" onClick={()=>{setMode(reg?'login':'register');setErr('')}}>{reg?'I already have an account':'Create an account'}</button>
  </form></div>}
