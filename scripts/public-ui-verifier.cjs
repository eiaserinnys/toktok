// A repeated text is not evidence that a newly accepted sequence reached the DOM.
function observesMessage(expected,messages=document.querySelectorAll('.message')){
 return Array.from(messages).some(e=>Number(e.dataset.sequence)===expected.sequence&&e.querySelector('.bubble')?.textContent===expected.text);
}
module.exports={observesMessage};
