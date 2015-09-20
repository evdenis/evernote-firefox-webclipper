var {imported, exported} = channel;

function onClick(evt) {
  var id = this.getAttribute('id');
  //self.port.emit('ui-cmd', {type: 'color', color: id});
  imported.doUICommand({type: 'color', color: id});
  imported.hide();
}

try {
  var els = document.querySelectorAll('[id]');
  for(var i = 0; i < els.length; i++) {
    let el = els[i];
    el.addEventListener('click', onClick);
  }
} catch(e) {
  console.error(e);
}
