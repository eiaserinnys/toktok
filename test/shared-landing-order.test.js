import {it,expect} from 'vitest';
import {componentRegistry,screenRegistry} from '../public/shared/registry.js';
import {createFixtureAdapter} from '../public/admin-design/fixture-adapter.js';

it('keeps the explanation before the public rooms in every shared landing flow preview',()=>{
 for(const mode of ['DEMO','HOSTED']){
  const fixtures=createFixtureAdapter().catalog(mode).screens.filter(f=>f.screenId==='introduction');
  expect(fixtures.length).toBeGreaterThan(1);
  for(const fixture of fixtures){
   const html=screenRegistry.introduction.render(...fixture.args);
   const positions=['class="home-hero"','id="service-description"','id="public-catalog"','class="x-bottom-links"'].map(marker=>html.indexOf(marker));
   expect(positions.every(p=>p>=0)).toBe(true);
   expect(positions).toEqual([...positions].sort((a,b)=>a-b));
   expect(html.match(/id="public-catalog"/g)).toHaveLength(1);
   expect(html).toContain(componentRegistry['public-catalog'].render({status:'ready',rooms:fixture.args[0].Config.catalog}));
  }
 }
});

it('shares loading, empty and unavailable states without exposing unescaped room data',()=>{
 const render=componentRegistry['public-catalog'].render;
 expect(render()).toContain('data-catalog-state="loading"');
 expect(render({status:'ready',rooms:[]})).toContain('지금 열린 공개방이 없어요');
 expect(render({status:'unavailable'})).toContain('공개방 목록을 읽지 못했어요');
 const html=render({status:'ready',rooms:[{slug:'fictional-room',title:'<script>alert("fixture")</script>'}]});
 expect(html).toContain('href="/public/fictional-room"');
 expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
});
