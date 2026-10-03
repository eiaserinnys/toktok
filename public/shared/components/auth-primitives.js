// Pure Common room markup, extracted from design/prototype at 736605b7.
// Dynamic values are data; the controller owns every side effect.
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const internalPath=value=>typeof value==='string'&&/^\/(?!\/)[a-zA-Z0-9/_.?=#%&-]*$/.test(value)?value:'/';
export function tag(text,type=''){return `<span class="x-tag ${type}">${escapeHtml(text)}</span>`;}
export function field(label,name,value='',attrs='',help=''){return `<label class="x-field">${escapeHtml(label)}<input name="${name}" value="${escapeHtml(value)}" ${attrs}>${help?`<small>${escapeHtml(help)}</small>`:''}</label>`;}
export function notice(title,text,tone=''){return `<div class="x-notice ${tone}"><span class="notice-symbol" aria-hidden="true">${tone==='error'?'!':tone==='peach'?'i':'✓'}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div></div>`;}
