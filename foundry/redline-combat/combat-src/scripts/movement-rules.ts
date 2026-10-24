export interface MovePoint {x:number;y:number}
export interface MoveStep {from:MovePoint;to:MovePoint;cost:number}
export interface MoveRecord {combat:string;turn:string;start:MovePoint & {elevation:number};spent:number;onFoot?:number;hidden?:boolean;last?:MoveStep}
/** Cost in grid spaces. Only adjacent, perpendicular one-square steps may be folded. */
export function recordStep(record:MoveRecord,from:MovePoint,to:MovePoint,size:number,blocked:(from:MovePoint,to:MovePoint)=>boolean):MoveRecord {
  if(!(size>0)||![from.x,from.y,to.x,to.y].every(Number.isFinite))throw Error("Некорректные координаты движения.");
  const dx=(to.x-from.x)/size,dy=(to.y-from.y)/size;
  const cost=Math.max(Math.abs(dx),Math.abs(dy));
  if(!cost)return record;
  const result:MoveRecord={...record,start:{...record.start},spent:record.spent+cost,hidden:false,last:{from:{...from},to:{...to},cost}};
  const last=record.last;
  const cardinal=(x:number,y:number)=>Math.abs(x)+Math.abs(y)===1&&(x===0||y===0);
  if(last&&last.to.x===from.x&&last.to.y===from.y){
    const px=(last.to.x-last.from.x)/size,py=(last.to.y-last.from.y)/size;
    if(cardinal(px,py)&&cardinal(dx,dy)&&px*dx+py*dy===0&&!blocked(last.from,to)){
      result.spent-=1;
      result.last={from:{...last.from},to:{...to},cost:1};
    }
  }
  return result;
}
