export interface Point { x:number; y:number }
export interface Area { shape:"square"|"ray"|"circle"|"cone"; origin:Point; direction:number; length:number; width:number; angle?:number; wallOrigin?:Point }
export function polygon(area:Area):Point[] {
  const {origin:o,direction:a,length:l,width:w}=area;
  const u={x:Math.cos(a),y:Math.sin(a)}, v={x:-u.y,y:u.x};
  const start=area.shape==="square"?-l/2:0, end=area.shape==="square"?l/2:l;
  return [[start,-w/2],[end,-w/2],[end,w/2],[start,w/2]].map(([x,y])=>({x:o.x+u.x*x!+v.x*y!,y:o.y+u.y*x!+v.y*y!}));
}
export function evadeAllowed(ref:number,mode:"raw"|"everyone"|"none") { return mode==="everyone" || mode==="raw" && ref>=8; }
export function winsAreaDefense(defense:number,attack:number,ties=false) { return ties?defense>=attack:defense>attack; }
