/**
 * Loads the XMP data with AJAX
 * @return (D.promise)
 */
PhotoSphereViewer.prototype._loadXMP = function() {
  if (!this.config.usexmpdata) {
    return D.resolved(null);
  }

  var defer = D();
  var xhr = new XMLHttpRequest();
  var self = this;
  var progress = 0;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200 || xhr.status === 201 || xhr.status === 202 || xhr.status === 0) {
        if (self.loader) {
          self.loader.setProgress(100);
        }

        var binary = xhr.responseText;
        var a = binary.indexOf('<x:xmpmeta'), b = binary.indexOf('</x:xmpmeta>');
        var data = binary.substring(a, b);

        // No data retrieved
        if (a === -1 || b === -1 || data.indexOf('GPano:') === -1) {
          defer.resolve(null);
        }
        else {
          var pano_data = {
            full_width: parseInt(PSVUtils.getXMPValue(data, 'FullPanoWidthPixels')),
            full_height: parseInt(PSVUtils.getXMPValue(data, 'FullPanoHeightPixels')),
            cropped_width: parseInt(PSVUtils.getXMPValue(data, 'CroppedAreaImageWidthPixels')),
            cropped_height: parseInt(PSVUtils.getXMPValue(data, 'CroppedAreaImageHeightPixels')),
            cropped_x: parseInt(PSVUtils.getXMPValue(data, 'CroppedAreaLeftPixels')),
            cropped_y: parseInt(PSVUtils.getXMPValue(data, 'CroppedAreaTopPixels'))
          };

          defer.resolve(pano_data);
        }
      }
      else {
        self.container.textContent = 'Cannot load image';
        defer.reject();
      }
    }
    else if (xhr.readyState === 3) {
      if (self.loader) {
        self.loader.setProgress(progress + 10);
      }
    }
  };

  xhr.onprogress = function(e) {
    if (e.lengthComputable && self.loader) {
      var new_progress = parseInt(e.loaded / e.total * 100);
      if (new_progress > progress) {
        progress = new_progress;
        self.loader.setProgress(progress);
      }
    }
  };

  xhr.onerror = function() {
    self.container.textContent = 'Cannot load image';
    defer.reject();
  };

  xhr.open('GET', this.config.panorama, true);
  xhr.send(null);

  return defer.promise;
};

/**
 * Loads the sphere texture
 * @param pano_data (Object) An object containing the panorama XMP data
 * @return (D.promise)
 */
PhotoSphereViewer.prototype._loadTexture = function(pano_data) {
  var defer = D();
  var loader = new THREE.ImageLoader();
  var self = this;
  var progress = pano_data ? 100 : 0;

  // CORS when the panorama is not given as a base64 string
  if (!this.config.panorama.match(/^data:image\/[a-z]+;base64/)) {
    loader.setCrossOrigin('anonymous');
  }

  var onload = function(img) {
    if (self.loader) {
      self.loader.setProgress(100);
    }

    // Default XMP data
    if (!pano_data) {
      pano_data = {
        full_width: img.width,
        full_height: img.height,
        cropped_width: img.width,
        cropped_height: img.height,
        cropped_x: 0,
        cropped_y: 0
      };
    }

    // Size limit for mobile compatibility
    var max_width = 4096;
    if (PhotoSphereViewer.SYSTEM.isWebGLSupported) {
      max_width = PhotoSphereViewer.SYSTEM.maxTextureWidth;
    }

    var new_width = Math.min(pano_data.full_width, max_width);
    var r = new_width / pano_data.full_width;

    pano_data.full_width *= r;
    pano_data.full_height *= r;
    pano_data.cropped_width *= r;
    pano_data.cropped_height *= r;
    pano_data.cropped_x *= r;
    pano_data.cropped_y *= r;

    img.width = pano_data.cropped_width;
    img.height = pano_data.cropped_height;

    // Create buffer
    var buffer = document.createElement('canvas');
    buffer.width = pano_data.full_width;
    buffer.height = pano_data.full_height;

    var ctx = buffer.getContext('2d');
    ctx.drawImage(img, pano_data.cropped_x, pano_data.cropped_y, pano_data.cropped_width, pano_data.cropped_height);

    self.prop.size.image_width = pano_data.cropped_width;
    self.prop.size.image_height = pano_data.cropped_height;

    var texture = new THREE.Texture(buffer);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    defer.resolve(texture);
  };

  var onprogress = function(e) {
    if (e.lengthComputable && self.loader) {
      var new_progress = parseInt(e.loaded / e.total * 100);
      if (new_progress > progress) {
        progress = new_progress;
        self.loader.setProgress(progress);
      }
    }
  };

  var onerror = function() {
    self.container.textContent = 'Cannot load image';
    defer.reject();
  };

  loader.load(this.config.panorama, onload, onprogress, onerror);

  return defer.promise;
};

/**
 * Applies the texture to the scene
 * Creates the scene if needed
 * @param texture (THREE.Texture) The sphere texture
 * @returns (D.promise)
 */
PhotoSphereViewer.prototype._setTexture = function(texture) {
  if (!this.scene) {
    this._createScene();
  }

  if (this.mesh.material.map) {
    this.mesh.material.map.dispose();
  }

  this.mesh.material.map = texture;

  this.trigger('panorama-loaded');

  this.render();

  return D.resolved();
};

/**
 * Creates the 3D scene and GUI components
 */
PhotoSphereViewer.prototype._createScene = function() {
  this._onResize();

  this.raycaster = new THREE.Raycaster();

  // Renderer depends on whether WebGL is supported or not
  this.renderer = PhotoSphereViewer.SYSTEM.isWebGLSupported && this.config.webgl ? new THREE.WebGLRenderer() : new THREE.CanvasRenderer();
  this.renderer.setSize(this.prop.size.width, this.prop.size.height);

  this.camera = new THREE.PerspectiveCamera(this.config.default_fov, this.prop.size.ratio, 1, 300);
  this.camera.position.set(0, 0, 0);

  this.scene = new THREE.Scene();
  this.scene.add(this.camera);

  // The middle of the panorama is placed at longitude=0
  var geometry = new THREE.SphereGeometry(200, 32, 32, -PhotoSphereViewer.HalfPI);

  var material = new THREE.MeshBasicMaterial();
  material.side = THREE.DoubleSide;

  this.mesh = new THREE.Mesh(geometry, material);
  this.mesh.scale.x = -1;

  this.scene.add(this.mesh);

  // create canvas container
  this.canvas_container = document.createElement('div');
  this.canvas_container.className = 'canvas-container';
  this.container.appendChild(this.canvas_container);
  this.canvas_container.appendChild(this.renderer.domElement);

  // Navigation bar
  if (this.config.navbar) {
    this.container.classList.add('has-navbar');
    this.navbar = new PSVNavBar(this);
  }

  // HUD
  this.hud = new PSVHUD(this);
  this.config.markers.forEach(function(marker) {
    this.hud.addMarker(marker, false);
  }, this);

  // Panel
  this.panel = new PSVPanel(this);

  // Tooltip
  this.tooltip = new PSVTooltip(this.hud);

  // Queue animation
  if (this.config.time_anim !== false) {
    this.prop.start_timeout = window.setTimeout(this.startAutorotate.bind(this), this.config.time_anim);
  }

  // Init shader renderer
  if (this.config.transition && this.config.transition.blur) {
    this.composer = new THREE.EffectComposer(this.renderer);

    this.passes.render = new THREE.RenderPass(this.scene, this.camera);

    this.passes.copy = new THREE.ShaderPass(THREE.CopyShader);
    this.passes.copy.renderToScreen = true;

    this.passes.blur = new THREE.ShaderPass(THREE.GodraysShader);
    this.passes.blur.enabled = false;
    this.passes.blur.renderToScreen = true;

    // values for minimal luminosity change
    this.passes.blur.uniforms.fDensity.value = 0.0;
    this.passes.blur.uniforms.fWeight.value = 0.5;
    this.passes.blur.uniforms.fDecay.value = 0.5;
    this.passes.blur.uniforms.fExposure.value = 1.0;

    this.composer.addPass(this.passes.render);
    this.composer.addPass(this.passes.copy);
    this.composer.addPass(this.passes.blur);
  }

  this._bindEvents();
  this.trigger('ready');
};

/**
 * Perform transition between current and new texture
 * @param texture (THREE.Texture)
 * @param position ({latitude: double, longitude: double})
 * @returns (D.promise)
 */
PhotoSphereViewer.prototype._transition = function(texture, position) {
  var self = this;

  // create a new sphere with the new texture
  var geometry = new THREE.SphereGeometry(150, 32, 32, -PhotoSphereViewer.HalfPI);

  var material = new THREE.MeshBasicMaterial();
  material.side = THREE.DoubleSide;
  material.map = texture;
  material.transparent = true;
  material.opacity = 0;

  var mesh = new THREE.Mesh(geometry, material);
  mesh.scale.x = -1;

  // rotate the new sphere to make the target position face the camera
  if (position) {
    // Longitude rotation along the vertical axis
    mesh.rotateY(position.longitude - this.prop.longitude);

    // Latitude rotation along the camera horizontal axis
    var axis = new THREE.Vector3(0, 1, 0).cross(this.camera.getWorldDirection()).normalize();
    var q = new THREE.Quaternion().setFromAxisAngle(axis, position.latitude - this.prop.latitude);
    mesh.quaternion.multiplyQuaternions(q, mesh.quaternion);
  }

  this.scene.add(mesh);
  this.render();

  // animation with blur/zoom ?
  var original_zoom_lvl = this.prop.zoom_lvl;
  if (this.config.transition.blur) {
    this.passes.copy.enabled = false;
    this.passes.blur.enabled = true;
  }

  var onTick = function(properties) {
    material.opacity = properties.opacity;

    if (self.config.transition.blur) {
      self.passes.blur.uniforms.fDensity.value = properties.density;
      self.prop.zoom_lvl = properties.zoom;
    }

    self.render();
  };

  // 1st half animation
  return PSVUtils.animation({
      properties: {
        density: { start: 0.0, end: 1.5 },
        opacity: { start: 0.0, end: 0.5 },
        zoom: { start: original_zoom_lvl, end: 100 }
      },
      duration: self.config.transition.duration / (self.config.transition.blur ? 4 / 3 : 2),
      easing: self.config.transition.blur ? 'outCubic' : 'linear',
      onTick: onTick
    })
    .then(function() {
      // 2nd half animation
      return PSVUtils.animation({
        properties: {
          density: { start: 1.5, end: 0.0 },
          opacity: { start: 0.5, end: 1.0 },
          zoom: { start: 100, end: original_zoom_lvl }
        },
        duration: self.config.transition.duration / (self.config.transition.blur ? 4 : 2),
        easing: self.config.transition.blur ? 'inCubic' : 'linear',
        onTick: onTick
      });
    })
    .then(function() {
      // disable blur shader
      if (self.config.transition.blur) {
        self.passes.copy.enabled = true;
        self.passes.blur.enabled = false;

        self.prop.zoom_lvl = original_zoom_lvl;
      }

      // remove temp sphere and transfer the texture to the main sphere
      self.mesh.material.map.dispose();
      self.mesh.material.map = texture;

      self.scene.remove(mesh);

      mesh.geometry.dispose();
      mesh.geometry = null;
      mesh.material.dispose();
      mesh.material = null;

      // actually rotate the camera
      if (position) {
        self.rotate(position);
      }
      else {
        self.render();
      }
    });
};
