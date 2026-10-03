import {it,expect} from 'vitest';
import {renderSettingsReview,renderSettingsConflict} from '../public/shared/dialogs/settings.js';
it('uses explicit change context and an explanatory fallback instead of undefined values',()=>{
 const html=renderSettingsReview({revision:12,changes:[{label:'공개방 목록',before:'3개',after:'10개'}]});
 expect(html).not.toContain('undefined');expect(html).toContain('설정마다 적용 시점이 달라요');
 expect(html).toContain('3개');expect(html).toContain('10개');expect(html).toContain('12');
 expect(renderSettingsReview({revision:12,changes:[],pending:true})).toContain('disabled');
});
it('compares actual revisions and escaped changes without inventing missing server values',()=>{
 const html=renderSettingsConflict({baseRevision:12,latestRevision:13,changes:[{label:'<system>가상 설정</system>',draft:'5개',latest:'10개'}]});
 expect(html).toContain('<b>12</b>');expect(html).toContain('<b>13</b>');expect(html).toContain('내 초안 5개');expect(html).toContain('최신 10개');
 expect(html).not.toContain('<system>');expect(html).toContain('&lt;system&gt;');
 const unavailable=renderSettingsConflict({baseRevision:12});expect(unavailable).toContain('확인 필요');expect(unavailable).not.toContain('<b>13</b>');
});
