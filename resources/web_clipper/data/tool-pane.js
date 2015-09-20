var {imported, exported} = channel;

function onClick(evt) {
  var tool = this.getAttribute('selection');
  imported.doUICommand({type: 'tool', tool: tool});
  imported.hide();
  //self.port.emit('ui-cmd', {type: 'tool', tool: tool});
}

try {
  var els = document.querySelectorAll('[selection]');
  for(var i = 0; i < els.length; i++) {
    let el = els[i];
    el.addEventListener('click', onClick);
  }
}catch(e){
  console.error(e);
}
