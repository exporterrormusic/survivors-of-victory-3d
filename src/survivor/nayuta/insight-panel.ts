import type { CharacterKit } from '../kit';

/** Fixed-size HUD: no rebuilding DOM or shifting the ability cards as values change. */
export class InsightPanel {
 readonly root=document.createElement('div');
 private title=document.createElement('b');
 private state=document.createElement('span');
 private pips=Array.from({length:4},()=>document.createElement('i'));
 private fill=document.createElement('i');
 constructor(){
  this.root.className='nayuta-insight';
  const heading=document.createElement('div');heading.className='ni-heading';heading.append(this.title,this.state);
  const pips=document.createElement('div');pips.className='ni-pips';pips.append(...this.pips);
  const track=document.createElement('div');track.className='ni-track';track.append(this.fill);
  this.title.textContent='INSIGHT';
  this.root.append(heading,pips,track);

 }
 update(s:NonNullable<CharacterKit['insightDisplay']>){
  
  this.state.textContent=s.meditating?'?':'';
  this.root.classList.toggle('meditating',s.meditating);
  this.root.classList.toggle('expiring',!s.meditating&&s.seconds>0&&s.seconds<3);
  this.pips.forEach((p,i)=>p.style.setProperty('--fill',`${Math.max(0,Math.min(1,s.stacks-i))*100}%`));
  this.fill.style.width=`${Math.max(0,Math.min(1,s.seconds/s.duration))*100}%`;
  this.root.title=this.root.ariaLabel=`Insight ${s.stacks.toFixed(1)}/4: +${Math.round(s.damage)}% damage, +${s.speed.toFixed(1)}% speed. ${s.meditating?'Meditating; timer paused':s.seconds.toFixed(1)+' seconds remaining'}. ${s.mature} mature of ${s.regular} gold clones; ${s.silver} silver soldiers.`;
 }
}
