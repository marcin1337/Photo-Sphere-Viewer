/**
 * Base sub-component class
 * @param parent (PhotoSphereViewer | PSVComponent) The parent with a "container" property
 */
function PSVComponent(parent) {
  this.psv = parent instanceof PhotoSphereViewer ? parent : parent.psv;
  this.parent = parent;
  this.container = null;

  // expose some methods to the viewer
  if (this.constructor.publicMethods) {
    this.constructor.publicMethods.forEach(function(method) {
      this.psv[method] = this[method].bind(this);
    }, this);
  }
}

/**
 * Creates the component
 */
PSVComponent.prototype.create = function() {
  this.container = document.createElement('div');

  if (this.constructor.className) {
    this.container.className = this.constructor.className;
  }

  this.parent.container.appendChild(this.container);
};

/**
 * Destroys the component
 */
PSVComponent.prototype.destroy = function() {
  this.parent.container.removeChild(this.container);

  this.container = null;
  this.psv = null;
  this.parent = null;
};

/**
 * Hides the component
 */
PSVComponent.prototype.hide = function() {
  this.container.style.visibility = 'hidden';
};

/**
 * Restores component visibility
 */
PSVComponent.prototype.show = function() {
  this.container.style.visibility = null;
};
