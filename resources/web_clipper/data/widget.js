var widgetLoaded = Lpc.Client.remote("widgetLoaded");
var widgetLeftClick = Lpc.Client.remote("widgetLeftClick");
var widgetRightClick = Lpc.Client.remote("widgetRightClick");

self.port.on('test', function() {
});

window.addEventListener('click', function(event) {
  if(event.button == 0 && event.shiftKey == false) {
    widgetLeftClick(event.button, event.shiftKey);
  } else if(event.button == 2 || (event.button == 0 && event.shiftKey == true)) {
    widgetRightClick(event.button, event.shiftKey);
  }
  event.preventDefault();
}, true);

self.port.on('set-state', function setState(data) {
  try {
  //console.log('set-state');
  var image = document.querySelector('#content');
  image.className = data;
  } catch(e) {
    console.error(e);
    console.error(e.stack);
  }
});

widgetLoaded();
