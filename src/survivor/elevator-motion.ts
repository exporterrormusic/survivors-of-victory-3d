/** Engine-free gate, travel and blast-seal interlocks. Values are metres / seconds. */
export type ElevatorAction = 'open' | 'close' | 'rise' | 'descend' | 'cycle';
export const ELEVATOR_DEPTH = 12;
export const SEAL_CLEARANCE = 3.4;
type Phase = 'idle' | 'open' | 'close' | 'descend' | 'rise' | 'sealed';
const ease=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export class ElevatorMotion {
  gateOpen=1;
  height=0;
  seal=0;
  phase:Phase='idle';
  cycling=false;
  departing=false;
  private queue:Phase[]=[];
  private elapsed=0;
  private start=0;
  private startSeal=0;
  command(action:ElevatorAction):void {
    if(action==='open'&&(this.height<-.001||this.seal>0))return;
    // Once below the surface only raise/cycle can interrupt the descent safely.
    if(action==='close'&&this.height<-.001)return;
    this.queue=[];this.cycling=action==='cycle';this.departing=action==='descend'||action==='cycle';
    if(action==='cycle')this.queue=['close','descend','rise','open'];
    else if(action==='descend')this.queue=['close','descend'];
    else if(action==='rise')this.queue=['rise'];
    else this.queue=[action];
    this.next();
  }
  private next():void {
    this.phase=this.queue.shift()??(this.height<=-ELEVATOR_DEPTH?'sealed':'idle');this.elapsed=0;
    this.start=this.phase==='open'||this.phase==='close'?this.gateOpen:this.height;
    this.startSeal=this.seal;
    if(this.phase==='idle'||this.phase==='sealed'){this.cycling=false;this.departing=false;}
  }
  update(dt:number):void {
    if(dt<=0||this.phase==='idle'||this.phase==='sealed')return;
    this.elapsed+=dt;
    const duration=this.phase==='open'||this.phase==='close'?1.8:6;
    const t=ease(this.elapsed/duration);
    if(this.phase==='open'||this.phase==='close')this.gateOpen=this.start+((this.phase==='open'?1:0)-this.start)*t;
    else {
      this.height=this.start+((this.phase==='descend'?-ELEVATOR_DEPTH:0)-this.start)*t;
      const clearanceSeal=ease((-this.height-SEAL_CLEARANCE)/3);
      if(this.phase==='descend')this.seal=clearanceSeal;
      // Start climbing with the shutters; on a shallow reversal, clearance
      // retracts them faster so the cage can never reach a partly shut hatch.
      else this.seal=Math.min(this.startSeal*(1-ease(this.elapsed/2)),clearanceSeal);
    }
    if(this.elapsed>=duration)this.next();
  }
}
