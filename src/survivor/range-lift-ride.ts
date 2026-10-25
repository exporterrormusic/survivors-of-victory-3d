import { Matrix, Vector3 } from '@babylonjs/core';
import type { ArrivalElevator } from './arrival-elevator';
import type { Player } from './player';
import type { SurvivorInput } from './input';

/** End-to-end extraction rehearsal in the test range. Never banks fabricated sortie rewards. */
export class RangeLiftRide {
  ended=false;
  private aboard=false;
  private readonly anchor=new Vector3();
  private overlay:HTMLElement|null=null;
  constructor(private readonly lift:ArrivalElevator,private readonly player:Player,private readonly input:SurvivorInput,private readonly leave:()=>void) {
    lift.onCommand=(action)=>{
      if(action==='rise'||action==='cycle'){this.ended=false;this.overlay?.remove();this.overlay=null;}
      if((action==='descend'||action==='cycle')&&!this.aboard&&lift.state.height>=-.01){
        const local=Vector3.TransformCoordinates(player.position,Matrix.Invert(lift.root.computeWorldMatrix(true)));
        if(Math.abs(local.x)<2.45&&Math.abs(local.z)<2.45){this.aboard=true;this.anchor.copyFrom(player.position);player.transported=true;input.clear();}
      }
    };
  }
  update():void {
    if(!this.aboard)return;
    const s=this.lift.state;
    this.input.clear();this.player.position.x=this.anchor.x;this.player.position.z=this.anchor.z;
    this.player.setTransportPose(s.height,s.seal>=.999);
    if(s.action==='sealed'&&!this.ended){this.ended=true;this.showEnd();}
    if(s.action==='idle'&&s.height===0){
      this.aboard=false;this.player.transported=false;this.player.setTransportPose(0,false);
    }
  }
  private showEnd():void {
    const panel=document.createElement('section');panel.id='range-extraction-complete';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Extraction complete');
    panel.style.cssText='position:absolute;left:50%;top:24%;transform:translateX(-50%);z-index:20;pointer-events:auto;background:#0b1724f2;border:1px solid #64cbd0;padding:24px 36px;text-align:center;color:#e7f4f5;font-family:Rajdhani,sans-serif;box-shadow:0 12px 50px #0009';
    panel.innerHTML='<div style="letter-spacing:.2em;color:#75e4eb">SHAFT SEALED</div><h2 style="margin:8px 0">EXTRACTION COMPLETE</h2><p>Test range ended. Safely below the surface.</p>';
    for(const [label,fn] of [['Replay elevator',()=>{this.lift.command('rise');}],['Return to Ark',this.leave]] as const){
      const button=document.createElement('button');button.textContent=label;button.style.cssText='padding:10px 18px;margin:5px;background:#1b3544;color:#eef9fc;border:1px solid #6eacba;cursor:pointer';button.onclick=fn;panel.append(button);
    }
    panel.addEventListener('pointerdown',e=>e.stopPropagation());document.getElementById('hud')!.append(panel);this.overlay=panel;
  }
  dispose():void {this.overlay?.remove();this.lift.onCommand=undefined;this.player.transported=false;this.player.setTransportPose(0,false);}
}
