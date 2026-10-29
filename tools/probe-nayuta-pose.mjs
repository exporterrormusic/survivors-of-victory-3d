import {chromium} from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto('http://127.0.0.1:5198/?run=test-range&character=nayuta&enemies=inactive');await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:180000});
const rows=await page.evaluate(()=>{
 const g=game;g.engine.stopRenderLoop();g.scene.onBeforeAnimationsObservable.clear();g.scene.onAfterAnimationsObservable.clear();g.player.aim.set(0,0,-20);g.kit.useBurst(g.player.position,Math.PI);g.kit.update(1.3);g.player.afterAnimation();
 const root=g.scene.getTransformNodeByName('c223_01'),nodes=g.scene.transformNodes.filter(n=>n.isDescendantOf(root));
 const joint=name=>nodes.find(n=>n.name===name),hip=joint('Bip001 Pelvis'),left=joint('Bip001 L Foot'),right=joint('Bip001 R Foot');
 const groups=g.scene.animationGroups.filter(a=>a.targetedAnimations.some(t=>t.target?.isDescendantOf?.(root)));
 for(const a of groups)a.stop();
 const rows=[];
 for(const name of ['idle','idlespecial','talk_idle','cover_idle','aim_idle']){
  const clip=groups.find(a=>a.name===name);if(!clip)continue;clip.start(true,0);clip.weight=1;
  for(const frac of [0,.25,.5,.75,.99]){clip.goToFrame(clip.from+(clip.to-clip.from)*frac);g.scene.render();const h=hip.getAbsolutePosition(),l=left.getAbsolutePosition(),r=right.getAbsolutePosition();rows.push({name,frac,drop:h.y-(l.y+r.y)/2,spread:Math.abs(l.x-r.x)});}
  clip.stop();
 }
 rows.sort((a,b)=>a.drop-b.drop);const best=rows[0],clip=groups.find(a=>a.name===best.name);clip.start(true,0);clip.weight=1;clip.goToFrame(clip.from+(clip.to-clip.from)*best.frac);g.scene.render();return rows;
});console.log(rows);await page.screenshot({path:'artifacts/nayuta/pose-probe.png'});await writeFile('artifacts/nayuta/pose-probe.json',JSON.stringify(rows,null,2));
}finally{await browser.close();}
