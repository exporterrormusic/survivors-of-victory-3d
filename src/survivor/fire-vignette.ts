/** Mounts a full-view overlay just above the game canvas and below every UI layer. */
export function mountUnderUi(el:HTMLElement):void{
  Object.assign(el.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
  const canvas=document.getElementById('game');
  if(canvas?.parentElement)canvas.insertAdjacentElement('afterend',el);else document.body.appendChild(el);
}

/** A seamless tile of glowing cinders, rasterised once: dots stay off the tile border so the repeat never cuts one. */
function cinders(size:number,count:number,minR:number,maxR:number,seed:number):string{
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)return 'none';
  for(let i=0;i<count;i++){
    const r=minR+random()*(maxR-minR),pad=r*4+2,x=pad+random()*(size-pad*2),y=pad+random()*(size-pad*2);
    const hot=random(),core=hot>.75?'255,154,26':hot>.35?'255,106,0':'216,58,0';
    const halo=ctx.createRadialGradient(x,y,0,x,y,r*4);
    halo.addColorStop(0,'rgba(192,40,0,.7)');halo.addColorStop(1,'rgba(192,40,0,0)');
    ctx.fillStyle=halo;ctx.fillRect(x-r*4,y-r*4,r*8,r*8);
    ctx.fillStyle=`rgb(${core})`;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  return `url(${canvas.toDataURL()})`;
}

/** Heat creeping in from the screen edges while the player stands in fire; the lake frost in fire colours. */
export class FireVignette {
  private el:HTMLDivElement|null=null;
  private layers:{el:HTMLDivElement,tile:number,speed:number,sway:number}[]=[];
  private level=0;
  private time=0;
  private shown='';
  update(target:number,dt:number):void{
    if(typeof document==='undefined')return;
    if(!this.el&&target<=0)return;
    if(!this.el){
      const el=this.el=document.createElement('div');
      el.className='crater-fire-heat';
      // Same build as the lake frost: glowing cinders over a hot glow, masked to creep in from the
      // edges and corners. No box shadow or scaling: those read as a rectangular frame.
      const mask='radial-gradient(ellipse 80% 78% at 50% 50%, transparent 20%, rgba(0,0,0,.35) 50%, rgba(0,0,0,.75) 75%, #000 100%)';
      mountUnderUi(el);
      Object.assign(el.style,{opacity:'0',overflow:'hidden',
        background:'radial-gradient(ellipse 80% 78% at 50% 50%, rgba(200,50,0,0) 20%, rgba(210,60,5,.25) 50%, rgba(230,70,10,.5) 75%, rgba(255,110,30,.75) 100%)',
        WebkitMaskImage:mask,maskImage:mask});
      // Each cinder layer is one tile taller and wider than the view and slides by transform only,
      // so the browser moves a cached layer instead of repainting the masked overlay every frame.
      for(const [tile,count,minR,maxR,seed,speed,sway] of [[512,40,2.2,4.2,11,75,10],[384,60,1.2,2.4,23,45,-6]]){
        const layer=document.createElement('div');
        Object.assign(layer.style,{position:'absolute',left:`-${tile}px`,top:'0',right:'0',bottom:`-${tile}px`,
          background:`${cinders(tile,count,minR,maxR,seed)} 0 0/${tile}px ${tile}px repeat`,willChange:'transform'});
        el.appendChild(layer);this.layers.push({el:layer,tile,speed,sway});
      }
    }
    // Flares up quickly when you step in, cools slowly once you are out.
    this.level+=(target-this.level)*Math.min(1,dt*(target>this.level?3:1.2));
    if(this.level<.003)this.level=0;
    // Above 1 (standing in fire on a map that already burns) the overlay saturates and brightens.
    const o=Math.min(1,this.level*(.85+.06*Math.sin(this.time*2.4))).toFixed(2);
    const boost=Math.max(0,this.level-1).toFixed(2);
    if(o+boost!==this.shown){this.shown=o+boost;this.el.style.opacity=o;this.el.style.filter=+boost>0?`brightness(${(1+ +boost*1.2).toFixed(2)}) saturate(${(1+ +boost).toFixed(2)})`:'';}
    if(this.level<=0)return;
    this.time+=dt;
    // Cinders float upward, the near layer faster, swaying side to side.
    for(const l of this.layers){
      const x=l.tile/2+Math.sin(this.time*1.3)*l.sway,y=-(this.time*l.speed%l.tile);
      l.el.style.transform=`translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    }
  }
  dispose():void{this.el?.remove();this.el=null;this.layers=[];}
}
