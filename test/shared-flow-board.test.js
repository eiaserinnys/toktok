import {it,expect} from 'vitest';
import {renderFlowBoard} from '../public/shared/screens/flow-board.js';
const graph={nodes:[{id:'a',title:'<img onerror=alert(1)>',route:'/',mode:'all'},{id:'b',title:'두 번째 화면',route:'/guide',mode:'all'}],edges:[{transitionId:'next',from:'a',to:'b',kind:'forward',label:'열기',event:'click',layout:true},{transitionId:'back',from:'b',to:'a',kind:'back',label:'돌아가기',event:'click',layout:false}]};
it('uses simultaneous previews and shared action layout without inline CSS or srcdoc',()=>{
 const {markup,layout}=renderFlowBoard(graph);
 expect((markup.match(/<iframe /g)??[]).length).toBe(2);
 expect(markup).not.toMatch(/\sstyle=|srcdoc=|index\.html\?fixture/);
 expect(markup).not.toContain('<img onerror');expect(markup).toContain('&lt;img');
 expect(layout.edges.find(e=>e.canonicalTransitionId==='back').routeType).toBe('reference');
 expect(layout.nodes.find(n=>n.canonicalId==='b').depth).toBeGreaterThan(layout.nodes.find(n=>n.canonicalId==='a').depth);
 expect(markup).toContain('키보드로 살펴보는 화면 연결');
});
