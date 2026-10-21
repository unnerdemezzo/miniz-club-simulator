// Small motions on existing anatomy. No clips, meshes, random race state or
// per-frame allocations; seated workshop figures are baked separately.
export function createPersonMotion(options = {}){
  const id=String(options.motionKey||options.id||options.label||options.model||'person');
  let seed=2166136261;
  for(let i=0;i<id.length;i++)seed=Math.imul(seed^id.charCodeAt(i),16777619)>>>0;
  const role=options.motionRole||(id.includes('director')?'director':id.includes('marshal')||options.vest?'marshal':id.includes('guest')?'guest':options.pose==='stand'?'guest':'driver');
  const fixed=options.motion===false||options.pose==='sit';
  const phase=(seed%10007)/10007*Math.PI*2,speed=.90+((seed>>>8)%101)/500;
  const pose={headYaw:0,headPitch:0,breath:0,weight:0,arm:0,elbow:0};
  let time=0,accumulated=(seed%97)/97/24;
  return {
    role,
    update(dt,distance=0){
      if(fixed)return null;
      dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,.1)):0;
      if(!dt)return null;
      time+=dt;accumulated+=dt;
      const interval=distance>6?1/10:1/24;
      if(accumulated+1e-9<interval)return null;
      accumulated%=interval;
      const t=time*speed;
      // Occasional smooth glance/gesture with long quiet gaps, independent
      // phases and speeds. Avoid a room full of synchronized swaying people.
      const cycle=(t+phase*4)%23,glance=cycle<5?Math.sin(Math.PI*cycle/5)**2:0;
      const gesture=cycle>10&&cycle<15?Math.sin(Math.PI*(cycle-10)/5)**2:0;
      const driver=role==='driver',marshal=role==='marshal';
      pose.headYaw=Math.sin(t*.46+phase)*(driver?.035:.055)+glance*(Math.sin(phase)>0?1:-1)*(driver?.035:marshal?.055:.10);
      pose.headPitch=Math.sin(t*.31+phase)*.012+gesture*(role==='director'?.024:.012);
      pose.breath=Math.sin(t*1.55+phase)*.007;
      pose.weight=Math.sin(t*.38+phase)*.006;
      pose.arm=driver?0:Math.sin(t*.71+phase)*.008;
      pose.elbow=driver||marshal?0:gesture*(role==='mechanic'?.06:.12);
      return pose;
    }
  };
}
