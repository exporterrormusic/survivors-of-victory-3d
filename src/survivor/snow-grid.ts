/** Preserve the finely tessellated playable square, adding coarse scenery-only borders. */
export function snowGridAxis(size:number,segments:number,outerExtent=size/2):number[]{
  const half=size/2,axis:number[]=[];
  if(outerExtent>half)for(let i=16;i>0;i--)axis.push(-half-(outerExtent-half)*i/16);
  for(let i=0;i<=segments;i++)axis.push((i/segments-.5)*size);
  if(outerExtent>half)for(let i=1;i<=16;i++)axis.push(half+(outerExtent-half)*i/16);
  return axis;
}
