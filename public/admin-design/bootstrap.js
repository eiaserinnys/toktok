// This file and HTML are only served after the server's actual admin gate.
import {mountDesignReview} from './controller.js';
const views=new Map([
 ['/admin/design/components','components'],
 ['/admin/design/dialogues','dialogues'],
 ['/admin/design/flows','flows']
]);
const root=document.querySelector('#design-review'),view=views.get(location.pathname);
if(!view){root.replaceChildren();const message=document.createElement('p');message.textContent='검수 화면을 찾을 수 없어요.';root.append(message);}
else{root.replaceChildren();mountDesignReview(root,view);}
