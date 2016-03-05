/**
 * Starts to load the panorama
 */
PhotoSphereViewer.prototype.load = function() {
  this.setPanorama(this.config.panorama, false);
};

/**
 * Performs a render
 */
PhotoSphereViewer.prototype.render = function() {
  
  
  if( this.prop.device_gyroscope === false){
		this.prop.direction = this.sphericalCoordsToVector3(this.prop.longitude, this.prop.latitude);
		this.camera.fov = this.config.max_fov + (this.prop.zoom_lvl / 100) * (this.config.min_fov - this.config.max_fov);
		this.camera.lookAt(this.prop.direction);
		this.camera.updateProjectionMatrix();
  }
  else{
	  this.controls.update();
  }
  if (this.composer) {
    this.composer.render();
  }
  else {
    this.renderer.render(this.scene, this.camera);
  }
  this.trigger('render');
};

/**
 * Destroy the viewer
 */
PhotoSphereViewer.prototype.destroy = function() {
  // remove listeners
  window.removeEventListener('resize', this);
  document.removeEventListener(PhotoSphereViewer.SYSTEM.fullscreenEvent, this);

  if (this.config.mousemove) {
    this.hud.container.removeEventListener('mousedown', this);
    this.hud.container.removeEventListener('touchstart', this);
    window.removeEventListener('mouseup', this);
    window.removeEventListener('touchend', this);
    this.hud.container.removeEventListener('mousemove', this);
    this.hud.container.removeEventListener('touchmove', this);
  }

  if (this.config.mousewheel) {
    this.hud.container.removeEventListener(PhotoSphereViewer.SYSTEM.mouseWheelEvent, this);
  }

  // destroy components
  if (this.hud) this.hud.destroy();
  if (this.loader) this.loader.destroy();
  if (this.navbar) this.navbar.destroy();
  if (this.panel) this.panel.destroy();
  if (this.tooltip) this.tooltip.destroy();

  // destroy ThreeJS view
  if (this.scene) {
    this.scene.remove(this.camera);
    this.scene.remove(this.mesh);
  }

  if (this.mesh) {
    this.mesh.material.geometry.dispose();
    this.mesh.material.geometry = null;
    this.mesh.material.map.dispose();
    this.mesh.material.map = null;
    this.mesh.material.dispose();
    this.mesh.material = null;
  }

  // remove container
  if (this.canvas_container) {
    this.container.removeChild(this.canvas_container);
  }
  this.parent.removeChild(this.container);

  // clean references
  this.container = null;
  this.loader = null;
  this.navbar = null;
  this.hud = null;
  this.panel = null;
  this.tooltip = null;
  this.canvas_container = null;
  this.renderer = null;
  this.composer = null;
  this.scene = null;
  this.controls = null;
  this.camera = null;
  this.mesh = null;
  this.raycaster = null;
  this.passes = {};
  this.actions = {};
};

PhotoSphereViewer.prototype.ToggleEditMode = function () {
    if (this.prop.editMode) {
        this.hud.container.style.cursor = 'move';
    } else {
        this.hud.container.style.cursor = 'crosshair';
    }
    this.prop.editMode = !this.prop.editMode;
}

/**
 * Load a panorama file
 * If the "position" is not defined the camera will not move and the ongoing animation will continue
 * "config.transition" must be configured for "transition" to be taken in account
 * @param path (String)
 * @param position (Object, optional) latitude & longitude or x & y
 * @param transition (boolean, optional)
 * @return (D.promise)
 */
PhotoSphereViewer.prototype.setPanorama = function(path, position, transition,zoom) {
  if (typeof position == 'boolean') {
    transition = position;
    position = undefined;
  }

  if (position) {
    this._cleanPosition(position);

    this.stopAutorotate();
    this.stopAnimation();
  }
  
  if(zoom){
	    // the user has given us a default zoom-in value
        // but we can only change it once we have a rendered scene 
        // so make a one off event for it
        var defaultZoomin = function () {
            this.off('render', defaultZoomin);
            this.prop.zoom_lvl = zoom;
            this.zoom(zoom);
        }
        if (zoom != undefined)
            this.on('render', defaultZoomin);
  }
  

  this.config.panorama = path;

  var self = this;

  if (!transition || !this.config.transition || !this.scene) {
    this.loader = new PSVLoader(this);

    return this._loadXMP()
      .then(this._loadTexture.bind(this))
      .then(this._setTexture.bind(this))
      .then(function() {
        if (self.loader) {
          self.loader.destroy();
          self.loader = null;
        }

        if (position) {
          self.rotate(position);
        }
        else {
          self.render();
        }
      });
  }
  else {
    if (this.config.transition.loader) {
      this.loader = new PSVLoader(this);
    }

    return this._loadXMP()
      .then(this._loadTexture.bind(this))
      .then(function(texture) {
        if (self.loader) {
          self.loader.destroy();
          self.loader = null;
        }

        return self._transition(texture, position);
      });
  }
};

/**
 * Starts the autorotate animation
 */
PhotoSphereViewer.prototype.startAutorotate = function() {
  this.stopAutorotate();
  this.stopAnimation();

  var self = this;
  var last = null;
  var elapsed = null;

  (function run(timestamp) {
    if (timestamp) {
      elapsed = last === null ? 0 : timestamp - last;
      last = timestamp;

      self.rotate({
        longitude: self.prop.longitude + self.prop.anim_speed * elapsed / 1000,
        latitude: self.prop.latitude - (self.prop.latitude - self.config.anim_lat) / 200
      });
    }

    self.prop.autorotate_reqid = window.requestAnimationFrame(run);
  }(null));

  this.trigger('autorotate', true);
};

/**
 * Stops the autorotate animation
 */
PhotoSphereViewer.prototype.stopAutorotate = function() {
  if (this.prop.start_timeout) {
    window.clearTimeout(this.prop.start_timeout);
    this.prop.start_timeout = null;
  }

  if (this.prop.autorotate_reqid) {
    window.cancelAnimationFrame(this.prop.autorotate_reqid);
    this.prop.autorotate_reqid = null;

    this.trigger('autorotate', false);
  }
};

/**
 * Launches/stops the autorotate animation
 */
PhotoSphereViewer.prototype.toggleAutorotate = function() {
  if (this.prop.autorotate_reqid) {
    this.stopAutorotate();
  }
  else {
    this.startAutorotate();
  }
};

/**
 * Resizes the canvas
 * @param width (integer) The new canvas width
 * @param height (integer) The new canvas height
 */
PhotoSphereViewer.prototype.resize = function(width, height) {
  this.prop.size.width = parseInt(width);
  this.prop.size.height = parseInt(height);
  this.prop.size.ratio = this.prop.size.width / this.prop.size.height;
  this.prop.boundingRect = this.container.getBoundingClientRect();

  if (this.camera) {
    this.camera.aspect = this.prop.size.ratio;
    this.camera.updateProjectionMatrix();
  }

  if (this.renderer) {
    this.renderer.setSize(this.prop.size.width, this.prop.size.height);
    if (this.composer) {
      this.composer.reset(new THREE.WebGLRenderTarget(this.prop.size.width, this.prop.size.height));
    }
    this.render();
  }

  this.trigger('size-updated', {
    width: this.prop.size.width,
    height: this.prop.size.height
  });
};


PhotoSphereViewer.prototype._rotateLeft = function () {
    // Rotates the sphere && Returns to the equator (latitude = 0)
    this.animate({longitude: this.prop.longitude - 0.7, latitude: this.prop.latitude}, 300);
};

PhotoSphereViewer.prototype._rotateRight = function () {
    // Rotates the sphere && Returns to the equator (latitude = 0)
	this.animate({longitude: this.prop.longitude + 0.7, latitude: this.prop.latitude}, 300);
};

PhotoSphereViewer.prototype._rotateDown = function () {
    // Rotates the sphere && Returns to the equator (latitude = 0)
	this.animate({longitude: this.prop.longitude , latitude: this.prop.latitude - 0.7}, 300);
};

PhotoSphereViewer.prototype._rotateUp = function () {
    // Rotates the sphere && Returns to the equator (latitude = 0)
	this.animate({longitude: this.prop.longitude , latitude: this.prop.latitude + 0.7}, 300);
};

/**
 * Rotate the camera
 * @param position (Object) latitude & longitude or x & y
 */
PhotoSphereViewer.prototype.rotate = function(position) {
  this._cleanPosition(position);

  this.prop.longitude = position.longitude;
  this.prop.latitude = position.latitude;

  if (this.renderer) {
    this.render();
  }

  this.trigger('position-updated', {
    longitude: this.prop.longitude,
    latitude: this.prop.latitude
  });
};

/**
 * Rotate the camera with animation
 * @param position (Object) latitude & longitude or x & y
 * @param duration (String|integer) Animation speed (per spec) or duration (milliseconds)
 */
PhotoSphereViewer.prototype.animate = function(position, duration) {
  this.stopAutorotate();
  this.stopAnimation();

  if (!duration) {
    this.rotate(position);
    return;
  }

  this._cleanPosition(position);

  if (!duration && typeof duration != 'number') {
    // desired radial speed
    duration = duration ? this._parseAnimSpeed(duration) : this.prop.anim_speed;
    // get the angle between current position and target
    var angle = Math.acos(
      Math.cos(this.prop.latitude) * Math.cos(position.latitude) * Math.cos(this.prop.longitude - position.longitude) +
      Math.sin(this.prop.latitude) * Math.sin(position.latitude)
    );
    // compute duration
    duration = angle / duration * 1000;
  }

  // longitude offset for shortest arc
  var tCandidates = [
    0, // direct
    PhotoSphereViewer.TwoPI, // clock-wise cross zero
    -PhotoSphereViewer.TwoPI // counter-clock-wise cross zero
  ];

  var tOffset = tCandidates.reduce(function(value, candidate) {
    candidate = position.longitude - this.prop.longitude + candidate;
    return Math.abs(candidate) < Math.abs(value) ? candidate : value;
  }.bind(this), Infinity);

  this.prop.animation_promise = PSVUtils.animation({
    properties: {
      longitude: { start: this.prop.longitude, end: this.prop.longitude + tOffset },
      latitude: { start: this.prop.latitude, end: position.latitude }
    },
    duration: duration,
    easing: 'inOutSine',
    onTick: this.rotate.bind(this)
  });
};

/**
 * Stop the ongoing animation
 */
PhotoSphereViewer.prototype.stopAnimation = function() {
  if (this.prop.animation_promise) {
    this.prop.animation_promise.cancel();
    this.prop.animation_promise = null;
  }
};

/**
 * Zoom
 * @param level (integer) New zoom level
 */
PhotoSphereViewer.prototype.zoom = function(level) {
  this.prop.zoom_lvl = PSVUtils.stayBetween(parseInt(Math.round(level)), 0, 100);
  this.render();
  this.trigger('zoom-updated', this.prop.zoom_lvl);
};

/**
 * Zoom in
 */
PhotoSphereViewer.prototype.zoomIn = function() {
  if (this.prop.zoom_lvl < 100) {
    this.zoom(this.prop.zoom_lvl + 1);
  }
};

/**
 * Zoom out
 */
PhotoSphereViewer.prototype.zoomOut = function() {
  if (this.prop.zoom_lvl > 0) {
    this.zoom(this.prop.zoom_lvl - 1);
  }
};

/**
 * Enables/disables fullscreen
 */
PhotoSphereViewer.prototype.toggleFullscreen = function() {
  if (!PSVUtils.isFullscreenEnabled()) {
    PSVUtils.requestFullscreen(this.container);
  }
  else {
    PSVUtils.exitFullscreen();
  }
};

PhotoSphereViewer.prototype.ToggleGyroscope = function () {
    this.prop.device_gyroscope = !this.prop.device_gyroscope;
}

/**
 * Sets the animation speed
 * @param speed (string) The speed, in radians/degrees/revolutions per second/minute
 */
PhotoSphereViewer.prototype.setAnimSpeed = function(speed) {
  this.prop.anim_speed = this._parseAnimSpeed(speed);
};

/**
 * Adds an event listener
 * If "func" is an object, its "handleEvent" method will be called with an object as paremeter
 *    - type: name of the event prefixed with "psv:"
 *    - args: array of action arguments
 * @param name (string) Action name
 * @param func (Function|Object) The handler function, or an object with an "handleEvent" method
 * @return (PhotoSphereViewer)
 */
PhotoSphereViewer.prototype.on = function(name, func) {
  if (!(name in this.actions)) {
    this.actions[name] = [];
  }

  this.actions[name].push(func);

  return this;
};

/**
 * Removes an event listener
 * @param name (string) Action name
 * @param func (Function|Object)
 * @return (PhotoSphereViewer)
 */
PhotoSphereViewer.prototype.off = function(name, func) {
  if (name in this.actions) {
    var idx = this.actions[name].indexOf(func);
    if (idx !== -1) {
      this.actions[name].splice(idx, 1);
    }
  }

  return this;
};

/**
 * Triggers an action
 * @param name (string) Action name
 * @param args... (mixed) Arguments to send to the handler functions
 */
PhotoSphereViewer.prototype.trigger = function(name, args) {
  args = Array.prototype.slice.call(arguments, 1);
  if ((name in this.actions) && this.actions[name].length > 0) {
    this.actions[name].forEach(function(func) {
      if (typeof func === 'object') {
        func.handleEvent({
          type: 'psv:' + name,
          args: args
        });
      }
      else {
        func.apply(this, args);
      }
    }, this);
  }
};
