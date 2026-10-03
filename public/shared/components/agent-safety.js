import {AGENT_SAFETY_NOTICE,AGENT_SAFETY_VERSION} from '../agent-safety.js';
import {renderNoticeDisclosure} from './notice-disclosure.js';

// Only the service-owned notice enters this surface. Room data is rendered separately.
export function renderAgentSafety({id='agent-safety'}={}){
 return renderNoticeDisclosure({id,title:'에이전트 안전 안내',body:AGENT_SAFETY_NOTICE.split('\n\n'),version:AGENT_SAFETY_VERSION,versionAttribute:'data-safety-version'});
}
