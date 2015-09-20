/**
 * Created by mz on 2014-07-13.
 */
self.on('click', function (node, data) {
  var attrId = undefined, attrValue = undefined;

  if (node) {
    attrId = 'evernote-'+Math.floor(Math.random()*10001)+Math.floor(Math.random()*10001);
    attrValue = '1';
    // mark node, so we can locate it later
    node.setAttribute(attrId, attrValue);
    self.postMessage({type: 'click', target: { id: attrId, value: attrValue}});
    return;
  } else {
    self.postMessage({type: 'click', target: null});
  }
});
