/* Deterministic action-depth layout. No authored per-screen coordinates. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.toktokFlowLayout=api})(typeof window==='undefined'?globalThis:window,function(){
const geometry={nodeWidth:320,nodeHeight:390,columnGap:490,rowGap:170,padding:90,labelWidth:354,labelHeight:110};
function layout(graph,filter={}){
 const allowed=n=>(!filter.mode||n.mode==='all'||n.mode===filter.mode)&&(!filter.role||filter.role==='all'||!n.audiences||n.audiences.includes(filter.role));
 let nodes=graph.nodes.filter(allowed).map(n=>({...n})),map=new Map(nodes.map(n=>[n.id,n]));
 let edges=graph.edges.filter(e=>map.has(e.from)&&map.has(e.to)&&(!filter.role||filter.role==='all'||!e.audiences||e.audiences.includes(filter.role))).map(e=>({...e}));
 let progression=edges.filter(e=>e.layout!==false&&!['back','reference','time'].includes(e.kind));
 const indegree=new Map(nodes.map(n=>[n.id,0]));progression.forEach(e=>indegree.set(e.to,indegree.get(e.to)+1));
 const queue=nodes.filter(n=>indegree.get(n.id)===0);nodes.forEach(n=>n.depth=0);let visited=0;
 while(queue.length){const a=queue.shift();visited++;for(const e of progression.filter(e=>e.from===a.id)){const b=map.get(e.to);b.depth=Math.max(b.depth,a.depth+1);indegree.set(b.id,indegree.get(b.id)-1);if(!indegree.get(b.id))queue.push(b)}}
 if(visited!==nodes.length)throw Error('Action graph must be acyclic; mark return/reference edges separately');
 // A state reached after different numbers of actions gets a contextual instance.
 // Its canonical screen/fixture stays shared, but every progression edge advances one column.
 const originals=nodes,originalEdges=edges,originalProgression=progression,instances=[],instanceEdges=[],byKey=new Map();
 const make=(n,depth)=>{const id=n.id+'@'+depth;if(byKey.has(id))return byKey.get(id);const copy={...n,id,instanceId:id,canonicalId:n.id,screenId:n.screenId||n.id,depth};byKey.set(id,copy);instances.push(copy);return copy};
 originals.filter(n=>!originalProgression.some(e=>e.to===n.id)).forEach(n=>make(n,0));
 for(let i=0;i<instances.length;i++){const a=instances[i];for(const e of originalProgression.filter(e=>e.from===a.canonicalId)){const b=make(map.get(e.to),a.depth+1);instanceEdges.push({...e,canonicalTransitionId:e.transitionId,transitionId:e.transitionId+'@'+a.depth,from:a.id,to:b.id})}}
 for(const e of originalEdges.filter(e=>!originalProgression.includes(e))){for(const a of instances.filter(n=>n.canonicalId===e.from)){const candidates=instances.filter(n=>n.canonicalId===e.to).sort((x,y)=>Math.abs(x.depth-a.depth)-Math.abs(y.depth-a.depth)||x.depth-y.depth);if(candidates[0])instanceEdges.push({...e,canonicalTransitionId:e.transitionId,transitionId:e.transitionId+'@'+a.depth,from:a.id,to:candidates[0].id,layout:false})}}
 nodes=instances;edges=instanceEdges;map=new Map(nodes.map(n=>[n.id,n]));progression=edges.filter(e=>e.layout!==false&&!['back','reference','time'].includes(e.kind));

 const maxDepth=Math.max(0,...nodes.map(n=>n.depth)),layers=[];let maxBottom=0;
 for(let d=0;d<=maxDepth;d++){const layer=nodes.filter(n=>n.depth===d);const ancestry=n=>{const ps=progression.filter(e=>e.to===n.id).map(e=>map.get(e.from));return ps.length?ps.reduce((sum,p)=>sum+(p.row||0),0)/ps.length:nodes.indexOf(n)};layer.sort((a,b)=>ancestry(a)-ancestry(b)||nodes.indexOf(a)-nodes.indexOf(b));layer.forEach((n,row)=>{n.row=row;n.x=geometry.padding+d*(geometry.nodeWidth+geometry.columnGap);n.y=geometry.padding+70+row*(geometry.nodeHeight+geometry.rowGap);maxBottom=Math.max(maxBottom,n.y+geometry.nodeHeight)});layers.push({depth:d,x:geometry.padding+d*(geometry.nodeWidth+geometry.columnGap),nodes:layer.map(n=>n.id)})}
 const width=geometry.padding*2+(maxDepth+1)*geometry.nodeWidth+maxDepth*geometry.columnGap;
 const lanes=new Map();let referenceIndex=0;
 for(const e of edges){const a=map.get(e.from),b=map.get(e.to),forward=progression.includes(e)&&b.depth===a.depth+1;e.routeType=forward?'progression':'reference';
  if(forward){const lane=lanes.get(a.depth)||[],desired=b.y+geometry.nodeHeight/2;let cy=desired;while(lane.some(y=>Math.abs(y-cy)<geometry.labelHeight+24))cy+=geometry.labelHeight+24;lane.push(cy);lanes.set(a.depth,lane);const x1=a.x+geometry.nodeWidth,y1=a.y+geometry.nodeHeight/2,x2=b.x,y2=b.y+geometry.nodeHeight/2,cx=x1+geometry.columnGap/2;e.labelBox={x:cx-geometry.labelWidth/2,y:cy-geometry.labelHeight/2,width:geometry.labelWidth,height:geometry.labelHeight};e.path=`M${x1},${y1} H${x1+28} V${cy} H${x2-28} V${y2} H${x2}`;maxBottom=Math.max(maxBottom,cy+geometry.labelHeight/2+30)}
  else{const laneY=maxBottom+160+referenceIndex*115,sourceX=a.x+geometry.nodeWidth-22,targetX=b.x+22;e.referenceIndex=referenceIndex++;e.labelBox={x:Math.max(geometry.padding,Math.min(width-geometry.labelWidth-geometry.padding,(sourceX+targetX-geometry.labelWidth)/2)),y:laneY-geometry.labelHeight/2,width:geometry.labelWidth,height:geometry.labelHeight};e.path=`M${sourceX},${a.y+geometry.nodeHeight} V${laneY} H${targetX} V${b.y+geometry.nodeHeight}`}
 }
 // Reference lanes are recalculated after progression labels establish their lower bound.
 edges.filter(e=>e.routeType==='reference').forEach(e=>{const a=map.get(e.from),b=map.get(e.to),laneY=maxBottom+160+e.referenceIndex*140;e.labelBox.y=laneY-geometry.labelHeight/2;e.path=`M${a.x+geometry.nodeWidth},${a.y+geometry.nodeHeight/2} H${a.x+geometry.nodeWidth+18} V${laneY} H${b.x-18} V${b.y+geometry.nodeHeight/2} H${b.x}`});
 const height=maxBottom+(filter.showReferences&&referenceIndex?220+referenceIndex*140:90);
 return {nodes,edges,layers,width,height,geometry,diagnostics:{orphan:nodes.filter(n=>!edges.some(e=>e.from===n.id||e.to===n.id)).map(n=>n.id),referenceEdges:referenceIndex}};
}
return {layout,geometry};
});
