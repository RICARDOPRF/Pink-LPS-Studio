const cfg=()=>window.PINK_PUBLIC_CONFIG?.supabase||{};
async function sessionToken(){
 const sb=window.supabaseClient||window.PinkSupabase||null;
 if(sb?.auth?.getSession){const {data}=await sb.auth.getSession();return data?.session?.access_token||null;}
 return null;
}
export async function getScienceTeacherContext(){
 const c=cfg(), token=await sessionToken();
 if(!c.url||!token) throw new Error('Pink Science requires authenticated Supabase session');
 const r=await fetch(`${c.url}/functions/v1/pink-science-teacher-context`,{headers:{authorization:`Bearer ${token}`,apikey:c.anonKey||c.key||''}});
 const p=await r.json(); if(!r.ok||!p?.ok)throw new Error(p?.error||'science context unavailable'); return p;
}
export function buildScienceTeacherContext(ctx,topic=''){
 const done=(ctx.queue||[]).filter(x=>x.status==='completed'&&(!topic||String(x.topic).toLowerCase().includes(String(topic).toLowerCase())));
 const evidence=(ctx.evidence||[]).slice(0,12);
 return ['PINK SCIENCE VERIFIED CONTEXT:',...done.slice(0,8).map(x=>`TOPIC: ${x.topic}\nRESULT: ${JSON.stringify(x.result)}`),
  'EVIDENCE:',...evidence.map(x=>`${x.evidence_class} | ${x.title||''} | ${x.source_url||''}`),
  'Rule: use only this context as learned scientific memory; distinguish established facts, simulations and hypotheses. NO EVIDENCE -> NO CLAIM.'].join('\n');
}
