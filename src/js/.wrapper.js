(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['three', 'D.js', 'uevent'], factory);
  }
  else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('three'), require('d.js'), require('uevent'));
  }
  else {
    root.PhotoSphereViewer = factory(root.THREE, root.D, root.uEvent);
  }
}(this, function(THREE, D, uEvent) {
"use strict";

@@js

return PhotoSphereViewer;
}));
