/**
 * Init the global SYSTEM var with information generic support information
 */
PhotoSphereViewer.loadSystem = function() {
  var S = PhotoSphereViewer.SYSTEM;
  S.loaded = true;
  S.pixelRatio = window.devicePixelRatio || 1;
  S.isWebGLSupported = PSVUtils.isWebGLSupported();
  S.isCanvasSupported = PSVUtils.isCanvasSupported();
  S.maxTextureWidth = S.isWebGLSupported ? PSVUtils.getMaxTextureWidth() : 4096;
  S.mouseWheelEvent = PSVUtils.mouseWheelEvent();
  S.fullscreenEvent = PSVUtils.fullscreenEvent();
  S.deviceOrientationSupported = D();

  window.addEventListener('deviceorientation', PhotoSphereViewer.deviceOrientationListener, false);
};

/**
 * Resolve or reject SYSTEM.deviceOrientationSupported
 * We can only be sure device orientation is supported once received an event with coherent data
 * @param event
 */
PhotoSphereViewer.deviceOrientationListener = function(event) {
  if (event.alpha !== null) {
    PhotoSphereViewer.SYSTEM.deviceOrientationSupported.resolve();
  }
  else {
    PhotoSphereViewer.SYSTEM.deviceOrientationSupported.reject();
  }

  window.removeEventListener('deviceorientation', PhotoSphereViewer.deviceOrientationListener);
};

/**
 * Sets the viewer size
 * @param size (Object) An object containing the wanted width and height
 */
PhotoSphereViewer.prototype._setViewerSize = function(size) {
  ['width', 'height'].forEach(function(dim) {
    if (size[dim]) {
      if (/^[0-9.]+$/.test(size[dim])) size[dim] += 'px';
      this.parent.style[dim] = size[dim];
    }
  }, this);
};

/**
 * Converts pixel texture coordinates to spherical radians coordinates
 * @param x (int)
 * @param y (int)
 * @returns ({longitude: double, latitude: double})
 */
PhotoSphereViewer.prototype.textureCoordsToSphericalCoords = function(x, y) {
  var relativeX = (x + this.prop.pano_data.cropped_x) / this.prop.pano_data.full_width * PSVUtils.TwoPI;
  var relativeY = (y + this.prop.pano_data.cropped_y) / this.prop.pano_data.full_height * Math.PI;

  return {
    longitude: relativeX >= Math.PI ? relativeX - Math.PI : relativeX + Math.PI,
    latitude: PSVUtils.HalfPI - relativeY
  };
};

/**
 * Converts spherical radians coordinates to pixel texture coordinates
 * @param longitude (double)
 * @param latitude (double)
 * @returns ({x: int, y: int})
 */
PhotoSphereViewer.prototype.sphericalCoordsToTextureCoords = function(longitude, latitude) {
  var relativeLong = longitude / PSVUtils.TwoPI * this.prop.pano_data.full_width;
  var relativeLat = latitude / Math.PI * this.prop.pano_data.full_height;

  return {
    x: parseInt(longitude < Math.PI ? relativeLong + this.prop.pano_data.full_width / 2 : relativeLong - this.prop.pano_data.full_width / 2) - this.prop.pano_data.cropped_x,
    y: parseInt(this.prop.pano_data.full_height / 2 - relativeLat) - this.prop.pano_data.cropped_y
  };
};

/**
 * Converts spherical radians coordinates to a THREE.Vector3
 * @param longitude (double)
 * @param latitude (double)
 * @returns (THREE.Vector3)
 */
PhotoSphereViewer.prototype.sphericalCoordsToVector3 = function(longitude, latitude) {
  return new THREE.Vector3(
    -Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude)
  );
};

/**
 * Converts a THREE.Vector3 to spherical radians coordinates
 * @param vector (THREE.Vector3)
 * @returns ({longitude: double, latitude: double})
 */
PhotoSphereViewer.prototype.vector3ToSphericalCoords = function(vector) {
  var phi = Math.acos(vector.y / Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z));
  var theta = Math.atan2(vector.x, vector.z);

  return {
    longitude: theta < 0 ? -theta : PSVUtils.TwoPI - theta,
    latitude: PSVUtils.HalfPI - phi
  };
};

/**
 * Converts x/y to latitude/longitude if present and ensure boundaries
 * @param position (Object)
 */
PhotoSphereViewer.prototype._cleanPosition = function(position) {
  if (position.hasOwnProperty('x') && position.hasOwnProperty('y')) {
    var sphericalCoords = this.textureCoordsToSphericalCoords(position.x, position.y);
    position.longitude = sphericalCoords.longitude;
    position.latitude = sphericalCoords.latitude;
  }

  position.longitude = PSVUtils.parseAngle(position.longitude);
  position.latitude = PSVUtils.stayBetween(PSVUtils.parseAngle(position.latitude, -Math.PI), -PSVUtils.HalfPI, PSVUtils.HalfPI);
};

/**
 * Apply "longitude_range" and "latitude_range"
 * @param position
 */
PhotoSphereViewer.prototype._applyRanges = function(position) {
  var range, offset;

  if (this.config.longitude_range) {
    range = PSVUtils.clone(this.config.longitude_range);
    offset = this.prop.hFov / 180 * Math.PI / 2;

    range[0] = PSVUtils.parseAngle(range[0] + offset);
    range[1] = PSVUtils.parseAngle(range[1] - offset);

    if (range[0] > range[1]) { // when the range cross longitude 0
      if (position.longitude > range[1] && position.longitude < range[0]) {
        if (position.longitude > (range[0] / 2 + range[1] / 2)) { // detect which side we are closer too
          position.longitude = range[0];
          this.trigger('_side-reached', 'left');
        }
        else {
          position.longitude = range[1];
          this.trigger('_side-reached', 'right');
        }
      }
    }
    else {
      if (position.longitude < range[0]) {
        position.longitude = range[0];
        this.trigger('_side-reached', 'left');
      }
      else if (position.longitude > range[1]) {
        position.longitude = range[1];
        this.trigger('_side-reached', 'right');
      }
    }
  }

  if (this.config.latitude_range) {
    range = PSVUtils.clone(this.config.latitude_range);
    offset = this.prop.vFov / 180 * Math.PI / 2;

    range[0] = PSVUtils.parseAngle(range[0] + offset, -Math.PI);
    range[1] = PSVUtils.parseAngle(range[1] - offset, -Math.PI);

    if (position.latitude < range[0]) {
      position.latitude = range[0];
      this.trigger('_side-reached', 'bottom');
    }
    else if (position.latitude > range[1]) {
      position.latitude = range[1];
      this.trigger('_side-reached', 'top');
    }
  }
};
