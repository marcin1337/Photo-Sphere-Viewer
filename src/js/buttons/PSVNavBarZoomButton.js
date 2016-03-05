/**
 * Navigation bar zoom button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarZoomButton(navbar) {
  PSVNavBarButton.call(this, navbar);

  this.zoom_range = null;
  this.zoom_value = null;

  this.prop = {
    mousedown: false,
    buttondown: false,
    longPressInterval: null
  };

  this.create();
}

PSVNavBarZoomButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarZoomButton.prototype.constructor = PSVNavBarZoomButton;

PSVNavBarZoomButton.className = 'psv-button zoom-button';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarZoomButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  var zoom_minus = document.createElement('div');
  zoom_minus.className = 'minus';
  zoom_minus.title = this.psv.config.lang.zoomOut;
  zoom_minus.innerHTML = PhotoSphereViewer.ICONS['zoom-out.svg'];
  this.container.appendChild(zoom_minus);

  var zoom_range_bg = document.createElement('div');
  zoom_range_bg.className = 'range';
  this.container.appendChild(zoom_range_bg);

  this.zoom_range = document.createElement('div');
  this.zoom_range.className = 'line';
  this.zoom_range.title = this.psv.config.lang.zoom;
  zoom_range_bg.appendChild(this.zoom_range);

  this.zoom_value = document.createElement('div');
  this.zoom_value.className = 'handle';
  this.zoom_value.title = this.psv.config.lang.zoom;
  this.zoom_range.appendChild(this.zoom_value);

  var zoom_plus = document.createElement('div');
  zoom_plus.className = 'plus';
  zoom_plus.title = this.psv.config.lang.zoomIn;
  zoom_plus.innerHTML = PhotoSphereViewer.ICONS['zoom-in.svg'];
  this.container.appendChild(zoom_plus);

  this.zoom_range.addEventListener('mousedown', this);
  this.zoom_range.addEventListener('touchstart', this);
  this.psv.container.addEventListener('mousemove', this);
  this.psv.container.addEventListener('touchmove', this);
  this.psv.container.addEventListener('mouseup', this);
  this.psv.container.addEventListener('touchend', this);
  zoom_minus.addEventListener('mousedown', this._zoomOut.bind(this));
  zoom_plus.addEventListener('mousedown', this._zoomIn.bind(this));

  this.psv.on('zoom-updated', this);

  var self = this;
  window.setTimeout(function() {
    self._moveZoomValue(self.psv.prop.zoom_lvl);
  }, 0);
};

/**
 * Destroys the button
 */
PSVNavBarZoomButton.prototype.destroy = function() {
  this.psv.container.removeEventListener('mousemove', this);
  this.psv.container.removeEventListener('touchmove', this);
  this.psv.container.removeEventListener('mouseup', this);
  this.psv.container.removeEventListener('touchend', this);

  this.psv.off('zoom-updated', this);

  PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarZoomButton.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'mousedown': this._initZoomChangeWithMouse(e); break;
    case 'touchstart': this._initZoomChangeByTouch(e); break;
    case 'mousemove': this._changeZoomWithMouse(e); break;
    case 'touchmove': this._changeZoomByTouch(e); break;
    case 'mouseup': this._stopZoomChange(e); break;
    case 'touchend': this._stopZoomChange(e); break;
    case 'psv:zoom-updated': this._moveZoomValue(e.args[0]); break;
    // @formatter:on
  }
};

/**
 * Moves the zoom cursor
 * @param level (integer) Zoom level (between 0 and 100)
 * @return (void)
 */
PSVNavBarZoomButton.prototype._moveZoomValue = function(level) {
  this.zoom_value.style.left = (level / 100 * this.zoom_range.offsetWidth - this.zoom_value.offsetWidth / 2) + 'px';
};

/**
 * The user wants to zoom
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._initZoomChangeWithMouse = function(evt) {
  this.prop.mousedown = true;
  this._changeZoom(evt.clientX);
};

/**
 * The user wants to zoom (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._initZoomChangeByTouch = function(evt) {
  this.prop.mousedown = true;
  this._changeZoom(evt.changedTouches[0].clientX);
};

/**
 * The user clicked the + button
 * Zoom in and register long press timer
 */
PSVNavBarZoomButton.prototype._zoomIn = function() {
  this.prop.buttondown = true;
  this.psv.zoomIn();
  window.setTimeout(this._startLongPressInterval.bind(this, 1), 200);
};

/**
 * The user clicked the - button
 * Zoom out and register long press timer
 */
PSVNavBarZoomButton.prototype._zoomOut = function() {
  this.prop.buttondown = true;
  this.psv.zoomOut();
  window.setTimeout(this._startLongPressInterval.bind(this, -1), 200);
};

/**
 * Continue zooming as long as the user press the button
 * @param value
 */
PSVNavBarZoomButton.prototype._startLongPressInterval = function(value) {
  if (this.prop.buttondown) {
    this.prop.longPressInterval = window.setInterval(function() {
      this.psv.zoom(this.psv.prop.zoom_lvl + value);
    }.bind(this), 50);
  }
};

/**
 * The user wants to stop zooming
 * @return (void)
 */
PSVNavBarZoomButton.prototype._stopZoomChange = function() {
  window.clearInterval(this.prop.longPressInterval);
  this.prop.longPressInterval = null;
  this.prop.mousedown = false;
  this.prop.buttondown = false;
};

/**
 * The user moves the zoom cursor
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._changeZoomWithMouse = function(evt) {
  evt.preventDefault();
  this._changeZoom(evt.clientX);
};

/**
 * The user moves the zoom cursor (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._changeZoomByTouch = function(evt) {
  evt.preventDefault();
  this._changeZoom(evt.changedTouches[0].clientX);
};

/**
 * Zoom change
 * @param x (integer) Horizontal coordinate
 * @return (void)
 */
PSVNavBarZoomButton.prototype._changeZoom = function(x) {
  if (this.prop.mousedown) {
    var user_input = parseInt(x) - this.zoom_range.getBoundingClientRect().left;
    var zoom_level = user_input / this.zoom_range.offsetWidth * 100;
    this.psv.zoom(zoom_level);
  }
};
