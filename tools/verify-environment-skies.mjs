import { chromium } from 'file:///C:/Users/rmdou/Desktop/GAME%20DEV/NIKKE%20POKEMON/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/environment-skies';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?run=test-range&environment=forest');
  await page.waitForFunction(()=>window.game?.scene?.isReady(),null,{timeout:240000});
  await page.evaluate(()=>{
    const g=window.game;
    g.camera.override=(camera)=>{camera.position.set(0,20,-8);camera.setTarget(camera.position.clone().addInPlaceFromFloats(0,3,20));};
    document.getElementById('hud').style.display='none';
  });
  for(const theme of ['forest','outskirts','sakura','frozen','city','storm','volcano']){
    await page.evaluate(theme=>window.game.setRangeEnvironment(theme),theme);
    await page.waitForFunction(theme=>{
      const sky=window.game.scene.getMeshByName('environment-sky');
      const texture=theme;
      return sky?.material.diffuseTexture?.url.endsWith(`${texture}.png`)&&sky.material.diffuseTexture.isReady();
    },theme,{timeout:60000});
    await page.waitForTimeout(500);
    await page.screenshot({path:`${out}/${theme}.png`,timeout:120000});
    const state=await page.evaluate(()=>{
      const sky=window.game.scene.getMeshByName('environment-sky');
      return {pickable:sky.isPickable,fog:sky.applyFog,enabled:sky.isEnabled(),texture:sky.material.diffuseTexture.getSize()};
    });
    assert.equal(state.pickable,false); assert.equal(state.fog,false);assert.equal(state.enabled,true);
    assert.equal(state.texture.width/state.texture.height,2);
    console.log(theme,state);
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}

