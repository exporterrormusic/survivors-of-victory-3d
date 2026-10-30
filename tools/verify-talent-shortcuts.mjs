import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.route('**/talent-key-test',r=>r.fulfill({contentType:'text/html',body:'<div id="frame"></div>'}));
 await page.goto('http://127.0.0.1:5198/talent-key-test');
 const result=await page.evaluate(async()=>{
  const {Run}=await import('/src/survivor/run.ts');
  const {TalentBoard,TalentPicker}=await import('/src/survivor/talent-picker.ts');
  const results=[];
  for(const code of ['Digit1','Digit2','Digit3','Numpad1','Numpad2','Numpad3']) {
   const run=new Run();run.level=run.tiers.tiers[0].level;let count=0;
   const board=new TalentBoard(run,'',()=>{},()=>count++);board.open();
   board.element.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true}));
   results.push({code,choice:run.tiers.chosenIndex(0),count});board.destroy();
  }
  const run=new Run();run.level=run.tiers.tiers[0].level;
  const picker=new TalentPicker(run,document.querySelector('#frame'),{weapon:'',special:''},()=>{});
  picker.update(0);window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit2'}));
  results.push({code:'HUD Digit2',choice:run.tiers.chosenIndex(0),count:1});picker.dispose();
  return results;
 });
 result.forEach((r,i)=>{assert.equal(r.choice,i===6?1:i%3);assert.equal(r.count,1);});console.log(result);
}finally{await browser.close();}
