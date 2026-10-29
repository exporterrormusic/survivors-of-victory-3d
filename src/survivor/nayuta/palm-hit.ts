/** Circle versus a forward rectangular strike, including contact at its edges. */
export function palmOverlaps(along: number, side: number, radius: number, reach: number, halfWidth: number): boolean {
 const forwardGap=Math.max(-along,along-reach,0);
 const lateralGap=Math.max(Math.abs(side)-halfWidth,0);
 return forwardGap*forwardGap+lateralGap*lateralGap<=radius*radius;
}
