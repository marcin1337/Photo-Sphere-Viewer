/*!
 * Photo Sphere Viewer 3.1.0
 * Copyright (c) 2014-2015 Jérémy Heleine
 * Copyright (c) 2015-2016 Damien "Mistic" Sorel
 * Licensed under MIT (http://opensource.org/licenses/MIT)
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['three', 'D.js'], factory);
  }
  else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('three'), require('d.js'));
  }
  else {
    root.PhotoSphereViewer = factory(root.THREE, root.D);
  }
}(this, function(THREE, D) {
"use strict";

/**
 * Viewer class
 * @param options (Object) Viewer settings
 */
function PhotoSphereViewer(options) {
  if (!(this instanceof PhotoSphereViewer)) {
    return new PhotoSphereViewer(options);
  }

  if (!PhotoSphereViewer.SYSTEM.loaded) {
    PhotoSphereViewer.loadSystem();
  }

  this.config = PSVUtils.deepmerge(PhotoSphereViewer.DEFAULTS, options);

  // normalize config
  this.config.min_fov = PSVUtils.stayBetween(this.config.min_fov, 1, 179);
  this.config.max_fov = PSVUtils.stayBetween(this.config.max_fov, 1, 179);
  this.config.tilt_up_max = PSVUtils.stayBetween(this.config.tilt_up_max, -PhotoSphereViewer.HalfPI, PhotoSphereViewer.HalfPI);
  this.config.tilt_down_max = PSVUtils.stayBetween(this.config.tilt_down_max, -PhotoSphereViewer.HalfPI, PhotoSphereViewer.HalfPI);
  if (this.config.default_fov === null) {
    this.config.default_fov = this.config.max_fov / 2 + this.config.min_fov / 2;
  }
  else {
    this.config.default_fov = PSVUtils.stayBetween(this.config.default_fov, this.config.min_fov, this.config.max_fov);
  }
  if (this.config.anim_lat === null) {
    this.config.anim_lat = this.config.default_lat;
  }
  this.config.anim_lat = PSVUtils.stayBetween(this.config.anim_lat, -PhotoSphereViewer.HalfPI, PhotoSphereViewer.HalfPI);
  if (this.config.caption && !this.config.navbar) {
    this.config.navbar = ['caption'];
  }

  // check config
  if (!options.panorama || !options.container) {
    throw new PSVError('No value given for panorama or container.');
  }

  if ((!PhotoSphereViewer.SYSTEM.isWebGLSupported || !this.config.webgl) && !PSVUtils.checkTHREE('CanvasRenderer', 'Projector')) {
    throw new PSVError('Missing Three.js components: CanvasRenderer, Projector. Get them from threejs-examples package.');
  }

  if (this.config.transition && this.config.transition.blur) {
    if (!PhotoSphereViewer.SYSTEM.isWebGLSupported || !this.config.webgl) {
      this.config.transition.blur = false;
      console.warn('PhotoSphereViewer: Using canvas rendering, blur transition disabled.');
    }
    else if (!PSVUtils.checkTHREE('EffectComposer', 'RenderPass', 'ShaderPass', 'MaskPass', 'CopyShader')) {
      throw new PSVError('Missing Three.js components: EffectComposer, RenderPass, ShaderPass, MaskPass, CopyShader. Get them from threejs-examples package.');
    }
  }

  if (this.config.max_fov < this.config.min_fov) {
    throw new PSVError('max_fov cannot be lower than min_fov.');
  }

  if (this.config.tilt_up_max < this.config.tilt_down_max) {
    throw new PSVError('tilt_up_max cannot be lower than tilt_down_max.');
  }

  // references to components
  this.parent = (typeof this.config.container == 'string') ? document.getElementById(this.config.container) : this.config.container;
  this.container = null;
  this.loader = null;
  this.navbar = null;
  this.hud = null;
  this.panel = null;
  this.tooltip = null;
  this.canvas_container = null;
  this.renderer = null;
  this.composer = null;
  this.passes = {};
  this.scene = null;
  this.camera = null;
  this.mesh = null;
  this.raycaster = null;
  this.doControls = null;
  this.actions = {};

  // local properties
  this.prop = {
    latitude: 0, // current latitude of the center
    longitude: 0, // current longitude of the center
    anim_speed: 0, // parsed anim speed (rad/sec)
    zoom_lvl: 0, // current zoom level
    moving: false, // is the user moving
    zooming: false, // is the user zooming
	editing: false,
    start_mouse_x: 0, // start x position of the click/touch
    start_mouse_y: 0, // start y position of the click/touch
    mouse_x: 0, // current x position of the cursor
    mouse_y: 0, // current y position of the cursor
    mouse_history: [], // list of latest positions of the cursor [time, x, y]
    pinch_dist: 0, // distance between fingers when zooming
    direction: null, // direction of the camera (Vector3)
    orientation_reqid: null, // animationRequest id of the device orientation
    autorotate_reqid: null, // animationRequest id of the automatic rotation
    animation_promise: null, // promise of the current animation (either go to position or image transition)
    start_timeout: null, // timeout id of the automatic rotation delay
    boundingRect: null, // DOMRect of the container
    size: { // size of the container
      width: 0,
      height: 0
    },
    image_size: { // size of the image
      width: 0,
      height: 0,
      original_width: 0,
      original_height: 0,	  
    },
    pano_data: { // panorama metadata
      full_width: 0,
      full_height: 0,
      cropped_width: 0,
      cropped_height: 0,
      cropped_x: 0,
      cropped_y: 0
    }
  };

  // compute zoom level
  this.prop.zoom_lvl = Math.round((this.config.default_fov - this.config.min_fov) / (this.config.max_fov - this.config.min_fov) * 100);
  this.prop.zoom_lvl -= 2 * (this.prop.zoom_lvl - 50);

  // create actual container
  this.container = document.createElement('div');
  this.container.classList.add('psv-container');
  this.parent.appendChild(this.container);

  // is canvas supported?
  if (!PhotoSphereViewer.SYSTEM.isCanvasSupported) {
    this.container.textContent = 'Canvas is not supported, update your browser!';
    throw new PSVError('Canvas is not supported.');
  }

  // init
  this.setAnimSpeed(this.config.anim_speed);

  this.rotate({
    longitude: this.config.default_long,
    latitude: this.config.default_lat
  });

  if (this.config.size !== null) {
    this._setViewerSize(this.config.size);
  }

  if (this.config.autoload) {
    this.load();
  }
}

PhotoSphereViewer.PI = Math.PI;
PhotoSphereViewer.TwoPI = Math.PI * 2.0;
PhotoSphereViewer.HalfPI = Math.PI / 2.0;

/**
 * Number of pixels bellow which a mouse move will be considered as a click
 * @type (int)
 */
PhotoSphereViewer.MOVE_THRESHOLD = 4;

/**
 * Time size of the mouse position history used to compute inertia
 * @type (int)
 */
PhotoSphereViewer.INERTIA_WINDOW = 300;

/**
 * SVG icons sources
 * @type (Object)
 */
PhotoSphereViewer.ICONS = {};

/**
 * System properties
 * @type (Object)
 */
PhotoSphereViewer.SYSTEM = {
  loaded: false,
  isWebGLSupported: false,
  isCanvasSupported: false,
  deviceOrientationSupported: null,
  maxTextureWidth: 0,
  mouseWheelEvent: null,
  fullscreenEvent: null
};

/**
 * PhotoSphereViewer defaults
 * @type (Object)
 */
PhotoSphereViewer.DEFAULTS = {
  panorama: null,
  container: null,
  caption: null,
  autoload: true,
  usexmpdata: true,
  webgl: true,
  min_fov: 30,
  max_fov: 90,
  default_fov: null,
  default_long: 0,
  default_lat: 0,
  tilt_up_max: PhotoSphereViewer.HalfPI,
  tilt_down_max: -PhotoSphereViewer.HalfPI,
  long_offset: Math.PI / 1440.0,
  lat_offset: Math.PI / 720.0,
  time_anim: 2000,
  anim_speed: '2rpm',
  anim_lat: null,
  navbar: [
    'autorotate',
    'zoom',
    'download',
    'markers',
    'caption',
    'gyroscope',
    'fullscreen'
  ],
  tooltip: {
    offset: 5,
    arrow_size: 7,
    delay: 100
  },
  lang: {
    autorotate: 'Automatic rotation',
    zoom: 'Zoom',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    download: 'Download',
    fullscreen: 'Fullscreen',
    markers: 'Markers',
    gyroscope: 'Gyroscope'
  },
  mousewheel: true,
  mousemove: true,
  move_inertia: true,
  click_event_on_marker: true,
  transition: {
    duration: 1500,
    loader: true,
    blur: false
  },
  loading_img: null,
  loading_txt: 'Loading...',
  size: null,
  markers: []
};


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
 * Navigation bar button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarButton(navbar) {
  PSVComponent.call(this, navbar);
}

PSVNavBarButton.prototype = Object.create(PSVComponent.prototype);
PSVNavBarButton.prototype.constructor = PSVNavBarButton;

/**
 * Creates the button
 */
PSVNavBarButton.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  if (this.constructor.icon) {
    this.container.innerHTML = PhotoSphereViewer.ICONS[this.constructor.icon];
  }
};

/**
 * Changes the active state of the button
 * @param active (boolean) true if the button should be active, false otherwise
 * @return (void)
 */
PSVNavBarButton.prototype.toggleActive = function(active) {
  this.container.classList.toggle('active', active);

  if (this.constructor.iconActive) {
    this.container.innerHTML = PhotoSphereViewer.ICONS[active ? this.constructor.iconActive : this.constructor.icon];
  }
};


/**
 * Custom error used in the lib
 * http://stackoverflow.com/a/27724419/1207670
 * @param message (Mixed)
 */
function PSVError(message) {
  this.message = message;

  // Use V8's native method if available, otherwise fallback
  if ('captureStackTrace' in Error) {
    Error.captureStackTrace(this, PSVError);
  }
  else {
    this.stack = (new Error()).stack;
  }
}

PSVError.prototype = Object.create(Error.prototype);
PSVError.prototype.name = 'PSVError';
PSVError.prototype.constructor = PSVError;


/**
 * Static utilities for PSV
 */
var PSVUtils = {};

/**
 * Check if some Three.js components are loaded
 * @param components (String...)
 * @returns (boolean)
 */
PSVUtils.checkTHREE = function(/* components */) {
  for (var i = 0, l = arguments.length; i < l; i++) {
    if (!(arguments[i] in THREE)) {
      return false;
    }
  }

  return true;
};

/**
 * Detects whether canvas is supported
 * @return (boolean) true if canvas is supported, false otherwise
 */
PSVUtils.isCanvasSupported = function() {
  var canvas = document.createElement('canvas');
  return !!(canvas.getContext && canvas.getContext('2d'));
};

/**
 * Tries to return a canvas webgl context
 * @return (ctx) if canvas is supported, undefined otherwise
 */
PSVUtils.getWebGLCtx = function() {
  var canvas = document.createElement('canvas');
  var names = ['webgl', 'experimental-webgl', 'moz-webgl', 'webkit-3d'];
  var context = null;

  if (!canvas.getContext) {
    return null;
  }

  if (names.some(function(name) {
      try {
        context = canvas.getContext(name);
        return (context && typeof context.getParameter == 'function');
      } catch (e) {
        return false;
      }
    })) {
    return context;
  }
  else {
    return null;
  }
};

/**
 * Detects whether WebGL is supported
 * @return (boolean) true if WebGL is supported, false otherwise
 */
PSVUtils.isWebGLSupported = function() {
  return !!window.WebGLRenderingContext && PSVUtils.getWebGLCtx() !== null;
};

/**
 * Get max texture width in WebGL context
 * @return (int)
 */
PSVUtils.getMaxTextureWidth = function() {
  var ctx = PSVUtils.getWebGLCtx();
  return ctx.getParameter(ctx.MAX_TEXTURE_SIZE);
};

/**
 * Search if an element has a particular, at any level including itself
 * @param el (HTMLElement)
 * @param parent (HTMLElement)
 * @return (Boolean)
 */
PSVUtils.hasParent = function(el, parent) {
  do {
    if (el === parent) {
      return true;
    }
  } while (!!(el = el.parentNode));

  return false;
};

/**
 * Get closest parent (can by itself)
 * @param el (HTMLElement)
 * @param selector (String)
 * @return (HTMLElement)
 */
PSVUtils.getClosest = function(el, selector) {
  var matches = el.matches || el.msMatchesSelector;

  do {
    if (matches.bind(el)(selector)) {
      return el;
    }
  } while (!!(el = el.parentElement));

  return null;
};

/**
 * Get the event name for mouse wheel
 * @return (string)
 */
PSVUtils.mouseWheelEvent = function() {
  return 'onwheel' in document.createElement('div') ? 'wheel' : // Modern browsers support "wheel"
    document.onmousewheel !== undefined ? 'mousewheel' : // Webkit and IE support at least "mousewheel"
      'DOMMouseScroll'; // let's assume that remaining browsers are older Firefox
};

/**
 * Get the event name for fullscreen event
 * @return (string)
 */
PSVUtils.fullscreenEvent = function() {
  var map = {
    'exitFullscreen': 'fullscreenchange',
    'webkitExitFullscreen': 'webkitfullscreenchange',
    'mozCancelFullScreen': 'mozfullscreenchange',
    'msExitFullscreen': 'msFullscreenEnabled'
  };

  for (var exit in map) {
    if (exit in document) return map[exit];
  }

  return 'fullscreenchange';
};

/**
 * Ensures that a number is in a given interval
 * @param x (number) The number to check
 * @param min (number) First endpoint
 * @param max (number) Second endpoint
 * @return (number) The checked number
 */
PSVUtils.stayBetween = function(x, min, max) {
  return Math.max(min, Math.min(max, x));
};

/**
 * Returns the value of a given attribute in the panorama metadata
 * @param data (string) The panorama metadata
 * @param attr (string) The wanted attribute
 * @return (string) The value of the attribute
 */
PSVUtils.getXMPValue = function(data, attr) {
  var a, b;
  // XMP data are stored in children
  if ((a = data.indexOf('<GPano:' + attr + '>')) !== -1 && (b = data.indexOf('</GPano:' + attr + '>')) !== -1) {
    return data.substring(a, b).replace('<GPano:' + attr + '>', '');
  }
  // XMP data are stored in attributes
  else if ((a = data.indexOf('GPano:' + attr)) !== -1 && (b = data.indexOf('"', a + attr.length + 8)) !== -1) {
    return data.substring(a + attr.length + 8, b);
  }
  else {
    return null;
  }
};

/**
 * Detects whether fullscreen is enabled or not
 * @return (boolean) true if fullscreen is enabled, false otherwise
 */
PSVUtils.isFullscreenEnabled = function() {
  return !!(document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
};

/**
 * Enters fullscreen mode
 * @param elt (HTMLElement)
 */
PSVUtils.requestFullscreen = function(elt) {
  (elt.requestFullscreen || elt.mozRequestFullScreen || elt.webkitRequestFullscreen || elt.msRequestFullscreen).call(elt);
};

/**
 * Exits fullscreen mode
 * @param elt (HTMLElement)
 */
PSVUtils.exitFullscreen = function(elt) {
  (document.exitFullscreen || document.mozCancelFullScreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
};

/**
 * Gets an element style
 * @param elt (HTMLElement)
 * @param prop (string)
 * @return mixed
 */
PSVUtils.getStyle = function(elt, prop) {
  return window.getComputedStyle(elt, null)[prop];
};

/**
 * Translate CSS values like "top center" or "10% 50%" as top and left positions
 * The implementation is as close as possible to the "background-position" specification
 * https://developer.mozilla.org/en-US/docs/Web/CSS/background-position
 * @param value (String)
 * @return Object ({top: double: left: double})
 */
PSVUtils.parsePosition = function(value) {
  if (!value) {
    return { top: 0.5, left: 0.5 };
  }

  if (typeof value === 'object') {
    return value;
  }

  var tokens = value.toLocaleLowerCase().split(' ').slice(0, 2);

  if (tokens.length === 1) {
    if (PSVUtils.parsePosition.positions[tokens[0]] !== undefined) {
      tokens = [tokens[0], 'center'];
    }
    else {
      tokens = [tokens[0], tokens[0]];
    }
  }

  var xFirst = tokens[1] != 'left' && tokens[1] != 'right' && tokens[0] != 'top' && tokens[0] != 'bottom';

  tokens = tokens.map(function(token) {
    return PSVUtils.parsePosition.positions[token] || token;
  });

  if (!xFirst) {
    tokens.reverse();
  }

  var parsed = tokens.join(' ').match(/^([0-9.]+)% ([0-9.]+)%$/);

  if (parsed) {
    return {
      left: parsed[1] / 100,
      top: parsed[2] / 100
    };
  }
  else {
    return { top: 0.5, left: 0.5 };
  }
};

PSVUtils.parsePosition.positions = { 'top': '0%', 'bottom': '100%', 'left': '0%', 'right': '100%', 'center': '50%' };

/**
 * Utility for animations
 * @param options (Object)
 *    - properties ({name: {end: number, start: number}})
 *    - duration (int)
 *    - delay (int, optional)
 *    - easing (string|function, optional)
 *    - onTick (function(properties))
 *    - onCancel (function)
 * @returns (D.promise) with an additional "cancel" method
 */
PSVUtils.animation = function(options) {
  var defer = D();
  var start = null;

  if (!options.easing || typeof options.easing == 'string') {
    options.easing = PSVUtils.animation.easings[options.easing || 'linear'];
  }

  function run(timestamp) {
    // the animation has been cancelled
    if (defer.promise.getStatus() === -1) {
      return;
    }

    // first iteration
    if (start === null) {
      start = timestamp;
    }

    // compute progress
    var progress = (timestamp - start) / options.duration;
    var current = {};
    var name;

    if (progress < 1.0) {
      // interpolate properties
      for (name in options.properties) {
        current[name] = options.properties[name].start + (options.properties[name].end - options.properties[name].start) * options.easing(progress);
      }

      options.onTick(current, progress);

      window.requestAnimationFrame(run);
    }
    else {
      // call onTick one last time with final values
      for (name in options.properties) {
        current[name] = options.properties[name].end;
      }

      options.onTick(current, 1.0);

      defer.resolve();
    }
  }

  if (options.delay !== undefined) {
    window.setTimeout(function() {
      window.requestAnimationFrame(run);
    }, options.delay);
  }
  else {
    window.requestAnimationFrame(run);
  }

  // add a "cancel" to the promise
  var promise = defer.promise;
  promise.cancel = function() {
    if (options.onCancel) {
      options.onCancel();
      defer.reject(defer);
    }
  };
  return promise;
};

/**
 * Collection of easing functions
 * https://gist.github.com/frederickk/6165768
 */
// @formatter:off
// jscs:disable
/* jshint ignore:start */
PSVUtils.animation.easings = {
  // no easing, no acceleration
  linear: function(t) { return t; },

  // accelerating from zero velocity
  inQuad: function(t) { return t*t; },
  // decelerating to zero velocity
  outQuad: function(t) { return t*(2-t); },
  // acceleration until halfway, then deceleration
  inOutQuad: function(t) { return t<.5 ? 2*t*t : -1+(4-2*t)*t; },

  // accelerating from zero velocity
  inCubic: function(t) { return t*t*t; },
  // decelerating to zero velocity
  outCubic: function(t) { return (--t)*t*t+1; },
  // acceleration until halfway, then deceleration
  inOutCubic: function(t) { return t<.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1; },

  // accelerating from zero velocity
  inQuart: function(t) { return t*t*t*t; },
  // decelerating to zero velocity
  outQuart: function(t) { return 1-(--t)*t*t*t; },
  // acceleration until halfway, then deceleration
  inOutQuart: function(t) { return t<.5 ? 8*t*t*t*t : 1-8*(--t)*t*t*t; },

  // accelerating from zero velocity
  inQuint: function(t) { return t*t*t*t*t; },
  // decelerating to zero velocity
  outQuint: function(t) { return 1+(--t)*t*t*t*t; },
  // acceleration until halfway, then deceleration
  inOutQuint: function(t) { return t<.5 ? 16*t*t*t*t*t : 1+16*(--t)*t*t*t*t; },

  // accelerating from zero velocity
  inSine: function(t) { return 1-Math.cos(t*(Math.PI/2)); },
  // decelerating to zero velocity
  outSine: function(t) { return Math.sin(t*(Math.PI/2)); },
  // accelerating until halfway, then decelerating
  inOutSine: function(t) { return .5-.5*Math.cos(Math.PI*t); },

  // accelerating from zero velocity
  inExpo: function(t) { return Math.pow(2, 10*(t-1)); },
  // decelerating to zero velocity
  outExpo: function(t) { return 1-Math.pow(2, -10*t); },
  // accelerating until halfway, then decelerating
  inOutExpo: function(t) { t=t*2-1; return t<0 ? .5*Math.pow(2, 10*t) : 1-.5*Math.pow(2, -10*t); },

  // accelerating from zero velocity
  inCirc: function(t) { return 1-Math.sqrt(1-t*t); },
  // decelerating to zero velocity
  outCirc: function(t) { t--; return Math.sqrt(1-t*t); },
  // acceleration until halfway, then deceleration
  inOutCirc: function(t) { t*=2; return t<1 ? .5-.5*Math.sqrt(1-t*t) : .5+.5*Math.sqrt(1-(t-=2)*t); }
};
// jscs:enable
/* jshint ignore:end */
// @formatter:off

/**
 * Returns a function, that, when invoked, will only be triggered at most once during a given window of time.
 * @copyright underscore.js - modified by Clément Prévost http://stackoverflow.com/a/27078401
 * @param func (Function)
 * @param wait (int)
 * @returns (Function)
 */
PSVUtils.throttle = function(func, wait) {
  var self, args, result;
  var timeout = null;
  var previous = 0;
  var later = function() {
    previous = Date.now();
    timeout = null;
    result = func.apply(self, args);
    if (!timeout) self = args = null;
  };
  return function() {
    var now = Date.now();
    if (!previous) previous = now;
    var remaining = wait - (now - previous);
    self = this;
    args = arguments;
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      result = func.apply(self, args);
      if (!timeout) self = args = null;
    }
    else if (!timeout) {
      timeout = setTimeout(later, remaining);
    }
    return result;
  };
};

/**
 * Merge the enumerable attributes of two objects.
 * Modified to replace arrays instead of merge.
 * @copyright Nicholas Fisher <nfisher110@gmail.com>"
 * @license MIT
 * @param target (Object)
 * @param src (Object)
 * @return (Object)
 */
PSVUtils.deepmerge = function(target, src) {
  var array = Array.isArray(src);
  var dst = array && [] || {};

  if (array) {
    src.forEach(function(e, i) {
      if (typeof dst[i] === 'undefined') {
        dst[i] = e;
      }
      else {
        dst[i] = PSVUtils.deepmerge(null, e);
      }
    });
  }
  else {
    if (target && Array.isArray(target)) {
      target = undefined;
    }
    if (target && typeof target === 'object') {
      Object.keys(target).forEach(function(key) {
        dst[key] = target[key];
      });
    }
    Object.keys(src).forEach(function(key) {
      if (typeof src[key] !== 'object' || !src[key]) {
        dst[key] = src[key];
      }
      else {
        if (!target[key]) {
          dst[key] = src[key];
        }
        else {
          dst[key] = PSVUtils.deepmerge(target[key], src[key]);
        }
      }
    });
  }

  return dst;
};

/**
 * Clone an object
 * @param src (Object)
 * @return (Object)
 */
PSVUtils.clone = function(src) {
  return PSVUtils.deepmerge(Array.isArray(src) ? [] : {}, src);
};


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

    self.prop.image_size.original_width = pano_data.cropped_width;
    self.prop.image_size.original_height = pano_data.cropped_height;

    // resize the panorama depending on max allowed texture size
    var max_width = 4096; // canvas size limit for mobile compatibility
    if (PhotoSphereViewer.SYSTEM.isWebGLSupported) {
      max_width = PhotoSphereViewer.SYSTEM.maxTextureWidth;
    }

    var r = Math.min(pano_data.full_width, max_width) / pano_data.full_width;

    pano_data.full_width *= r;
    pano_data.full_height *= r;
    pano_data.cropped_width *= r;
    pano_data.cropped_height *= r;
    pano_data.cropped_x *= r;
    pano_data.cropped_y *= r;

    img.width = pano_data.cropped_width;
    img.height = pano_data.cropped_height;

    self.prop.image_size.width = pano_data.cropped_width;
    self.prop.image_size.height = pano_data.cropped_height;
    self.prop.pano_data = pano_data;

    // create a new image containing the source image and black for cropped parts
    var buffer = document.createElement('canvas');
    buffer.width = pano_data.full_width;
    buffer.height = pano_data.full_height;

    var ctx = buffer.getContext('2d');
    ctx.drawImage(img, pano_data.cropped_x, pano_data.cropped_y, pano_data.cropped_width, pano_data.cropped_height);

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

  this.camera = new THREE.PerspectiveCamera(this.config.default_fov, this.prop.size.width / this.prop.size.height, 1, 300);
  this.camera.position.set(0, 0, 0);

  if (PSVUtils.checkTHREE('DeviceOrientationControls')) {
    this.doControls = new THREE.DeviceOrientationControls(this.camera);
  }

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


/**
 * Add all needed event listeners
 */
PhotoSphereViewer.prototype._bindEvents = function() {
  window.addEventListener('resize', this);
  document.addEventListener(PhotoSphereViewer.SYSTEM.fullscreenEvent, this);

  // all interation events are binded to the HUD only
  if (this.config.mousemove) {
    this.hud.container.style.cursor = 'move';
    this.hud.container.addEventListener('mousedown', this);
    this.hud.container.addEventListener('touchstart', this);
    window.addEventListener('mouseup', this);
    window.addEventListener('touchend', this);
    this.hud.container.addEventListener('mousemove', this);
    this.hud.container.addEventListener('touchmove', this);
  }

  if (this.config.mousewheel) {
    this.hud.container.addEventListener(PhotoSphereViewer.SYSTEM.mouseWheelEvent, this);
  }
};

/**
 * Handle events
 * DO NOT RENAME THIS METHOD
 * @param e (Event)
 */
PhotoSphereViewer.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'resize': PSVUtils.throttle(this._onResize(), 50); break;
    case 'mousedown':   this._onMouseDown(e);   break;
    case 'touchstart':  this._onTouchStart(e);  break;
    case 'mouseup':     this._onMouseUp(e);     break;
    case 'touchend':    this._onTouchEnd(e);    break;
    case 'mousemove':   this._onMouseMove(e);   break;
    case 'touchmove':   this._onTouchMove(e);   break;
    case PhotoSphereViewer.SYSTEM.fullscreenEvent:  this._fullscreenToggled();  break;
    case PhotoSphereViewer.SYSTEM.mouseWheelEvent:  this._onMouseWheel(e);      break;
    // @formatter:on
  }
};

/**
 * Resizes the canvas when the window is resized
 */
PhotoSphereViewer.prototype._onResize = function() {
  if (this.container.clientWidth != this.prop.size.width || this.container.clientHeight != this.prop.size.height) {
    this.prop.size.width = parseInt(this.container.clientWidth);
    this.prop.size.height = parseInt(this.container.clientHeight);
    this.prop.boundingRect = this.container.getBoundingClientRect();

    if (this.camera) {
      this.camera.aspect = this.prop.size.width / this.prop.size.height;
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
  }
};

/**
 * The user wants to move
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._onMouseDown = function(evt) {
  this._startMove(evt);
};

/**
 * The user wants to move (touch version)
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._onTouchStart = function(evt) {
  if (evt.touches.length === 1) {
    this._startMove(evt.touches[0]);
  }
  else if (evt.touches.length === 2) {
    this._startZoom(evt);
  }
};

/**
 * Initializes the movement
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._startMove = function(evt) {
  if (this.prop.orientation_reqid || this.prop.autorotate_reqid) {
    return;
  }
  
  if (this.prop.editMode) {
    this._addMarker(event);
    this.ToggleEditMode();
	return;
  }

  this.stopAll();

  this.prop.mouse_x = this.prop.start_mouse_x = parseInt(evt.clientX);
  this.prop.mouse_y = this.prop.start_mouse_y = parseInt(evt.clientY);
  this.prop.moving = true;
  this.prop.zooming = false;

  this.prop.mouse_history.length = 0;
  this._logMouseMove(evt);
};

/**
 * Initializes the zoom
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._startZoom = function(evt) {
  var t = [
    { x: parseInt(evt.touches[0].clientX), y: parseInt(evt.touches[0].clientY) },
    { x: parseInt(evt.touches[1].clientX), y: parseInt(evt.touches[1].clientY) }
  ];

  this.prop.pinch_dist = Math.sqrt(Math.pow(t[0].x - t[1].x, 2) + Math.pow(t[0].y - t[1].y, 2));
  this.prop.moving = false;
  this.prop.zooming = true;
};

/**
 * The user wants to stop moving
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._onMouseUp = function(evt) {
  this._stopMove(evt);
};

/**
 * The user wants to stop moving (touch version)
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._onTouchEnd = function(evt) {
  this._stopMove(evt.changedTouches[0]);
};

/**
 * Stops the movement
 * If the user was moving (one finger) : if the move threshold was not reached, a click event is triggered
 *    otherwise a animation is launched to simulate inertia
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._stopMove = function(evt) {
  if (this.prop.moving) {
    // move threshold to trigger a click
    if (Math.abs(evt.clientX - this.prop.start_mouse_x) < PhotoSphereViewer.MOVE_THRESHOLD && Math.abs(evt.clientY - this.prop.start_mouse_y) < PhotoSphereViewer.MOVE_THRESHOLD) {
      this._click(evt);
      this.prop.moving = false;
    }
    // inertia animation
    else if (this.config.move_inertia) {
      this._logMouseMove(evt);
      this._stopMoveInertia(evt);
    }
    else {
      this.prop.moving = false;
    }
  }

  this.prop.mouse_history.length = 0;
  this.prop.zooming = false;
};

/**
 * Performs an animation to simulate inertia when stop moving
 * @param evt
 */
PhotoSphereViewer.prototype._stopMoveInertia = function(evt) {
  var self = this;

  var direction = {
    x: evt.clientX - this.prop.mouse_history[0][1],
    y: evt.clientY - this.prop.mouse_history[0][2]
  };

  var norm = Math.sqrt(direction.x * direction.x + direction.y * direction.y);

  this.prop.animation_promise = PSVUtils.animation({
    properties: {
      clientX: { start: evt.clientX, end: evt.clientX + direction.x },
      clientY: { start: evt.clientY, end: evt.clientY + direction.y }
    },
    duration: norm * PhotoSphereViewer.INERTIA_WINDOW / 100,
    easing: 'outCirc',
    onTick: function(properties) {
      self._move(properties);
    },
    onCancel: function() {
      self.prop.moving = false;
    }
  });

  this.prop.animation_promise.then(function() {
    self.prop.moving = false;
  });
};

/**
 * Trigger an event with all coordinates when a simple click is performed
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._click = function(evt) {
  this.trigger('_click', evt);
  if (evt.defaultPrevented) {
    return;
  }

  var data = {
    client_x: parseInt(evt.clientX - this.prop.boundingRect.left),
    client_y: parseInt(evt.clientY - this.prop.boundingRect.top)
  };

  if (evt.data) {
    data = PSVUtils.deepmerge(data, evt.data);
  }

  var screen = new THREE.Vector2(
    2 * data.client_x / this.prop.size.width - 1,
    -2 * data.client_y / this.prop.size.height + 1
  );

  this.raycaster.setFromCamera(screen, this.camera);

  var intersects = this.raycaster.intersectObjects(this.scene.children);

  if (intersects.length === 1) {
    var sphericalCoords = this.vector3ToSphericalCoords(intersects[0].point);

    data.longitude = sphericalCoords.longitude;
    data.latitude = sphericalCoords.latitude;

    var textureCoords = this.sphericalCoordsToTextureCoords(data.longitude, data.latitude);

    data.texture_x = textureCoords.x;
    data.texture_y = textureCoords.y;

    this.trigger('click', data);
  }
};

/**
 * The user moves the image
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._onMouseMove = function(evt) {
  if (evt.buttons !== 0) {
    evt.preventDefault();
    this._move(evt);
  }
};

/**
 * The user moves the image (touch version)
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._onTouchMove = function(evt) {
  if (evt.touches.length === 1) {
    evt.preventDefault();
    this._move(evt.touches[0]);
  }
  else if (evt.touches.length === 2) {
    evt.preventDefault();
    this._zoom(evt);
  }
};

/**
 * Performs movement
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._move = function(evt) {
  if (this.prop.moving) {
    var x = parseInt(evt.clientX);
    var y = parseInt(evt.clientY);

    this.rotate({
      longitude: this.prop.longitude - (x - this.prop.mouse_x) * this.config.long_offset,
      latitude: this.prop.latitude + (y - this.prop.mouse_y) * this.config.lat_offset
    });

    this.prop.mouse_x = x;
    this.prop.mouse_y = y;

    this._logMouseMove(evt);
  }
};

/**
 * Zoom
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._zoom = function(evt) {
  if (this.prop.zooming) {
    var t = [
      { x: parseInt(evt.touches[0].clientX), y: parseInt(evt.touches[0].clientY) },
      { x: parseInt(evt.touches[1].clientX), y: parseInt(evt.touches[1].clientY) }
    ];

    var p = Math.sqrt(Math.pow(t[0].x - t[1].x, 2) + Math.pow(t[0].y - t[1].y, 2));
    var delta = 80 * (p - this.prop.pinch_dist) / this.prop.size.width;

    this.zoom(this.prop.zoom_lvl + delta);

    this.prop.pinch_dist = p;
  }
};

/**
 * The user wants to zoom (wheel version)
 * @param evt (Event) The event
 */
PhotoSphereViewer.prototype._onMouseWheel = function(evt) {
  evt.preventDefault();
  evt.stopPropagation();

  var delta = evt.deltaY !== undefined ? -evt.deltaY : (evt.wheelDelta !== undefined ? evt.wheelDelta : -evt.detail);

  if (delta !== 0) {
    var direction = parseInt(delta / Math.abs(delta));
    this.zoom(this.prop.zoom_lvl + direction);
  }
};

/**
 * Fullscreen state has changed
 */
PhotoSphereViewer.prototype._fullscreenToggled = function() {
  this.trigger('fullscreen-updated', PSVUtils.isFullscreenEnabled());
};

/**
 * Store each mouse position during a mouse move
 * Positions older than "INERTIA_WINDOW" are removed
 * Positions before a pause of "INERTIA_WINDOW" / 10 are removed
 * @param evt (Event)
 */
PhotoSphereViewer.prototype._logMouseMove = function(evt) {
  var now = Date.now();
  this.prop.mouse_history.push([now, evt.clientX, evt.clientY]);

  var previous = null;

  for (var i = 0; i < this.prop.mouse_history.length;) {
    if (this.prop.mouse_history[0][i] < now - PhotoSphereViewer.INERTIA_WINDOW) {
      this.prop.mouse_history.splice(i, 1);
    }
    else if (previous && this.prop.mouse_history[0][i] - previous > PhotoSphereViewer.INERTIA_WINDOW / 10) {
      this.prop.mouse_history.splice(0, i);
      i = 0;
      previous = this.prop.mouse_history[0][i];
    }
    else {
      i++;
      previous = this.prop.mouse_history[0][i];
    }
  }
};

PhotoSphereViewer.prototype._translateClientPosToTexturePos = function (evt) {
  var data = {
    client_x: parseInt(evt.clientX - this.prop.boundingRect.left),
    client_y: parseInt(evt.clientY - this.prop.boundingRect.top)
  };

  if (evt.data) {
    data = PSVUtils.deepmerge(data, evt.data);
  }

  var screen = new THREE.Vector2(
    2 * data.client_x / this.prop.size.width - 1,
    -2 * data.client_y / this.prop.size.height + 1
  );

  this.raycaster.setFromCamera(screen, this.camera);

  var intersects = this.raycaster.intersectObjects(this.scene.children);

  if (intersects.length === 1) {
    var sphericalCoords = this.vector3ToSphericalCoords(intersects[0].point);

    data.longitude = sphericalCoords.longitude;
    data.latitude = sphericalCoords.latitude;

    var textureCoords = this.sphericalCoordsToTextureCoords(data.longitude, data.latitude);

    data.texture_x = textureCoords.x;
    data.texture_y = textureCoords.y;
	return data;
  }
}

/**
* Add marker to canvas
* @param evt (Event) The event
* @return (void)
*/
PhotoSphereViewer.prototype._addMarker = function (evt) {
    var data = this._translateClientPosToTexturePos(evt);
    var newMarker =
    {
        id: Date.now(),
        name: "Marker bez nazwy",
        tooltip: "Marker bez nazwy",
        content: '',
        x: data.texture_x,
        y: data.texture_y,
        html: '<i class="material-icons marker" style="color:black;font-size:64px;" aria-hidden="true">details</i>',
		markerIcon : 'details',
		markerColor:'black',
		markerSize:'64',
        width: 32,
        height: 32,
        anchor: 'bottom center'
    };
    var newMarker = this.addMarker(newMarker, true);
    this.trigger('newMarker', newMarker);

};


/**
 * Starts to load the panorama
 */
PhotoSphereViewer.prototype.load = function() {
  this.setPanorama(this.config.panorama, false);
};

/**
 * Performs a render
 * @param updateDirection (boolean) false to NOT update view direction
 */
PhotoSphereViewer.prototype.render = function(updateDirection) {
  if (updateDirection !== false) {
    this.prop.direction = this.sphericalCoordsToVector3(this.prop.longitude, this.prop.latitude);
    this.camera.lookAt(this.prop.direction);
    this.camera.rotation.z = 0;
  }

  this.camera.fov = this.config.max_fov + (this.prop.zoom_lvl / 100) * (this.config.min_fov - this.config.max_fov);
  this.camera.updateProjectionMatrix();

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
  if (this.doControls) this.doControls.disconnect();

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
  this.camera = null;
  this.mesh = null;
  this.raycaster = null;
  this.passes = {};
  this.actions = {};
};

/**
 * Load a panorama file
 * If the "position" is not defined the camera will not move and the ongoing animation will continue
 * "config.transition" must be configured for "transition" to be taken in account
 * @param path (String)
 * @param position (Object, optional) latitude & longitude or x & y
 * @param transition (boolean, optional)
 * @return (D.promise)
 */
PhotoSphereViewer.prototype.setPanorama = function(path, position, transition) {
  if (typeof position == 'boolean') {
    transition = position;
    position = undefined;
  }

  if (position) {
    this._cleanPosition(position);

    this.stopAll();
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
 * Stops all current animations
 */
PhotoSphereViewer.prototype.stopAll = function() {
  this.stopAutorotate();
  this.stopAnimation();
  this.stopGyroscopeControl();
};

/**
 * Starts the autorotate animation
 */
PhotoSphereViewer.prototype.startAutorotate = function() {
  this.stopAll();

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
 * Starts the gyroscope interaction
 */
PhotoSphereViewer.prototype.startGyroscopeControl = function() {
  this.stopAll();

  var self = this;

  (function run() {
    self.doControls.update();
    self.prop.direction = self.camera.getWorldDirection();

    var sphericalCoords = self.vector3ToSphericalCoords(self.prop.direction);
    self.prop.longitude = sphericalCoords.longitude;
    self.prop.latitude = sphericalCoords.latitude;

    self.render(false);

    self.prop.orientation_reqid = window.requestAnimationFrame(run);
  }());

  this.trigger('gyroscope-updated', true);
};

/**
 * Stops the gyroscope interaction
 */
PhotoSphereViewer.prototype.stopGyroscopeControl = function() {
  if (this.prop.orientation_reqid) {
    window.cancelAnimationFrame(this.prop.orientation_reqid);
    this.prop.orientation_reqid = null;

    this.trigger('gyroscope-updated', false);

    this.render();
  }
};

/**
 * Toggles the gyroscope interaction
 */
PhotoSphereViewer.prototype.toggleGyroscopeControl = function() {
  if (this.prop.orientation_reqid) {
    this.stopGyroscopeControl();
  }
  else {
    this.startGyroscopeControl();
  }
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
  this.stopAll();

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
  this.prop.zoom_lvl = PSVUtils.stayBetween(Math.round(level), 0, 100);
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

PhotoSphereViewer.prototype.ToggleEditMode = function () {
    if (this.prop.editMode) {
        this.hud.container.style.cursor = 'move';
    } else {
        this.hud.container.style.cursor = 'crosshair';
    }
    this.prop.editMode = !this.prop.editMode;
}

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


/**
 * Init the global SYSTEM var with information generic support information
 */
PhotoSphereViewer.loadSystem = function() {
  var S = PhotoSphereViewer.SYSTEM;
  S.loaded = true;
  S.isWebGLSupported = PSVUtils.isWebGLSupported();
  S.isCanvasSupported = PSVUtils.isCanvasSupported();
  S.maxTextureWidth = PSVUtils.getMaxTextureWidth();
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
 * Parse the animation speed
 * @param speed (string) The speed, in radians/degrees/revolutions per second/minute
 * @return (double) radians per second
 */
PhotoSphereViewer.prototype._parseAnimSpeed = function(speed) {
  speed = speed.toString().trim();

  // Speed extraction
  var speed_value = parseFloat(speed.replace(/^(-?[0-9]+(?:\.[0-9]*)?).*$/, '$1'));
  var speed_unit = speed.replace(/^-?[0-9]+(?:\.[0-9]*)?(.*)$/, '$1').trim();

  // "per minute" -> "per second"
  if (speed_unit.match(/(pm|per minute)$/)) {
    speed_value /= 60;
  }

  var rad_per_second = 0;

  // Which unit?
  switch (speed_unit) {
    // Degrees per minute / second
    case 'dpm':
    case 'degrees per minute':
    case 'dps':
    case 'degrees per second':
      rad_per_second = speed_value * Math.PI / 180;
      break;

    // Radians per minute / second
    case 'radians per minute':
    case 'radians per second':
      rad_per_second = speed_value;
      break;

    // Revolutions per minute / second
    case 'rpm':
    case 'revolutions per minute':
    case 'rps':
    case 'revolutions per second':
      rad_per_second = speed_value * PhotoSphereViewer.TwoPI;
      break;

    // Unknown unit
    default:
      throw new PSVError('unknown speed unit "' + speed_unit + '"');
  }

  return rad_per_second;
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
  var relativeX = x / this.prop.image_size.original_width * PhotoSphereViewer.TwoPI;
  var relativeY = y / this.prop.image_size.original_height * PhotoSphereViewer.PI;

  return {
    longitude: relativeX >= PhotoSphereViewer.PI ? relativeX - PhotoSphereViewer.PI : relativeX + PhotoSphereViewer.PI,
    latitude: PhotoSphereViewer.HalfPI - relativeY
  };
};

/**
 * Converts spherical radians coordinates to pixel texture coordinates
 * @param longitude (double)
 * @param latitude (double)
 * @returns ({x: int, y: int})
 */
PhotoSphereViewer.prototype.sphericalCoordsToTextureCoords = function(longitude, latitude) {
  var relativeLong = longitude / PhotoSphereViewer.TwoPI * this.prop.image_size.original_width;
  var relativeLat = latitude / PhotoSphereViewer.PI * this.prop.image_size.original_height;

  return {
    x: parseInt(longitude < PhotoSphereViewer.PI ? relativeLong + this.prop.image_size.original_width / 2 : relativeLong - this.prop.image_size.original_width / 2),
    y: parseInt(this.prop.image_size.original_height / 2 - relativeLat)
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
 * Converts a THREE.Vector3 to sperical radians coordinates
 * @param vector (THREE.Vector3)
 * @returns ({longitude: double, latitude: double})
 */
PhotoSphereViewer.prototype.vector3ToSphericalCoords = function(vector) {
  var phi = Math.acos(vector.y / Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z));
  var theta = Math.atan2(vector.x, vector.z);

  return {
    longitude: theta < 0 ? -theta : PhotoSphereViewer.TwoPI - theta,
    latitude: PhotoSphereViewer.HalfPI - phi
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

  position.longitude = position.longitude - Math.floor(position.longitude / PhotoSphereViewer.TwoPI) * PhotoSphereViewer.TwoPI;
  position.latitude = PSVUtils.stayBetween(position.latitude, this.config.tilt_down_max, this.config.tilt_up_max);
};


/**
 * Navigation bar autorotate button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarAutorotateButton(navbar) {
  PSVNavBarButton.call(this, navbar);

  this.create();
}

PSVNavBarAutorotateButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarAutorotateButton.prototype.constructor = PSVNavBarAutorotateButton;

PSVNavBarAutorotateButton.className = 'psv-button hover-scale autorotate-button';
PSVNavBarAutorotateButton.icon = 'play.svg';
PSVNavBarAutorotateButton.iconActive = 'play-active.svg';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarAutorotateButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.container.title = this.psv.config.lang.autorotate;

  this.container.addEventListener('click', this.psv.toggleAutorotate.bind(this.psv));

  this.psv.on('autorotate', this);
};

/**
 * Destroys the button
 */
PSVNavBarAutorotateButton.prototype.destroy = function() {
  this.psv.off('autorotate', this);

  PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarAutorotateButton.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'psv:autorotate': this.toggleActive(e.args[0]); break;
    // @formatter:on
  }
};


/**
 * Navigation bar custom button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 * @param config (Object)
 */
function PSVNavBarCustomButton(navbar, config) {
  PSVNavBarButton.call(this, navbar);

  this.config = config;

  this.create();
}

PSVNavBarCustomButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarCustomButton.prototype.constructor = PSVNavBarCustomButton;

PSVNavBarCustomButton.className = 'psv-button hoverable';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarCustomButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  if (this.config.className) {
    this.container.classList.add(this.config.className);
  }

  if (this.config.title) {
    this.container.title = this.config.title;
  }

  if (this.config.content) {
    this.container.innerHTML = this.config.content;
  }

  if (this.config.onClick) {
    this.container.addEventListener('click', this.config.onClick);
  }
};


/**
 * Navigation bar download button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarDownloadButton(navbar) {
  PSVNavBarButton.call(this, navbar);

  this.create();
}

PSVNavBarDownloadButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarDownloadButton.prototype.constructor = PSVNavBarDownloadButton;

PSVNavBarDownloadButton.className = 'psv-button hover-scale download-button';
PSVNavBarDownloadButton.icon = 'download.svg';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarDownloadButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.container.title = this.psv.config.lang.download;

  this.container.addEventListener('click', this._download.bind(this));
};

/**
 * Ask the browser to download the panorama source file
 */
PSVNavBarDownloadButton.prototype._download = function() {
  var link = document.createElement('a');
  link.href = this.psv.config.panorama;
  link.download = this.psv.config.panorama;
  this.psv.container.appendChild(link);
  link.click();
};


/**
 * Navigation bar fullscreen button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarFullscreenButton(navbar) {
  PSVNavBarButton.call(this, navbar);

  this.create();
}

PSVNavBarFullscreenButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarFullscreenButton.prototype.constructor = PSVNavBarFullscreenButton;

PSVNavBarFullscreenButton.className = 'psv-button hover-scale fullscreen-button';
PSVNavBarFullscreenButton.icon = 'fullscreen-in.svg';
PSVNavBarFullscreenButton.iconActive = 'fullscreen-out.svg';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarFullscreenButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.container.title = this.psv.config.lang.fullscreen;

  this.container.addEventListener('click', this.psv.toggleFullscreen.bind(this.psv));

  this.psv.on('fullscreen-updated', this);
};

/**
 * Destroys the button
 */
PSVNavBarFullscreenButton.prototype.destroy = function() {
  this.psv.off('fullscreen-updated', this);

  PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarFullscreenButton.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'psv:fullscreen-updated': this.toggleActive(e.args[0]); break;
    // @formatter:on
  }
};


/**
 * Navigation bar gyroscope button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarGyroscopeButton(navbar) {
  PSVNavBarButton.call(this, navbar);

  this.create();
}

PSVNavBarGyroscopeButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarGyroscopeButton.prototype.constructor = PSVNavBarGyroscopeButton;

PSVNavBarGyroscopeButton.className = 'psv-button hover-scale gyroscope-button';
PSVNavBarGyroscopeButton.icon = 'compass.svg';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarGyroscopeButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.container.style.display = 'none';
  this.container.title = this.psv.config.lang.gyroscope;

  PhotoSphereViewer.SYSTEM.deviceOrientationSupported.promise.then(
    this._onAvailabilityChange.bind(this, true),
    this._onAvailabilityChange.bind(this, false)
  );

  this.container.addEventListener('click', this.psv.toggleGyroscopeControl.bind(this.psv));

  this.psv.on('gyroscope-updated', this);
};

/**
 * Destroys the button
 */
PSVNavBarGyroscopeButton.prototype.destroy = function() {
  this.psv.off('gyroscope-updated', this);

  PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarGyroscopeButton.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'psv:gyroscope-updated': this.toggleActive(e.args[0]); break;
    // @formatter:on
  }
};

PSVNavBarGyroscopeButton.prototype._onAvailabilityChange = function(available) {
  if (available) {
    if (this.psv.doControls) {
      this.container.style.display = 'block';
    }
    else {
      throw new PSVError('Missing Three.js components: DeviceOrientationControls. Get them from threejs-examples package.');
    }
  }
  else {
    this.destroy();
  }
};


/**
 * Navigation bar markers button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarMarkersButton(navbar) {
  PSVNavBarButton.call(this, navbar);

  this.prop = {
    panelOpened: false,
    panelOpening: false
  };

  this.create();
}

PSVNavBarMarkersButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarMarkersButton.prototype.constructor = PSVNavBarMarkersButton;

PSVNavBarMarkersButton.className = 'psv-button hover-scale markers-button';
PSVNavBarMarkersButton.icon = 'pin.svg';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarMarkersButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.container.title = this.psv.config.lang.markers;

  this.container.addEventListener('click', this.toggleMarkers.bind(this));

  this.psv.on('open-panel', this);
  this.psv.on('close-panel', this);
};

/**
 * Destroys the button
 */
PSVNavBarMarkersButton.prototype.destroy = function() {
  this.psv.off('open-panel', this);
  this.psv.off('close-panel', this);

  PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarMarkersButton.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'psv:open-panel': this._onPanelOpened(); break;
    case 'psv:close-panel': this._onPanelClosed(); break;
    // @formatter:on
  }
};

/**
 * Toggle the visibility of markers list
 * @return (void)
 */
PSVNavBarMarkersButton.prototype.toggleMarkers = function() {
  if (this.prop.panelOpened) {
    this.hideMarkers();
  }
  else {
    this.showMarkers();
  }
};

/**
 * Open side panel with list of markers
 * @return (void)
 */
PSVNavBarMarkersButton.prototype.showMarkers = function() {
  var html = '<div class="psv-markers-list">' +
    '<h1>' + this.psv.config.lang.markers + '</h1>' +
    '<ul>';

  for (var id in this.psv.hud.markers) {
    var marker = this.psv.hud.markers[id];

    var name = marker.id;
    if (marker.html) {
      name = marker.html;
    }
    else if (marker.tooltip) {
      name = typeof marker.tooltip === 'string' ? marker.tooltip : marker.tooltip.content;
    }

    html += '<li data-psv-marker="' + marker.id + '">';
    if (marker.image) {
      html += '<img class="marker-image" src="' + marker.image + '"/>';
    }
    html += '<p class="marker-name">' + name + '</p>' +
      '</li>';
  }

  html += '</ul>' +
    '</div>';

  this.prop.panelOpening = true;
  this.psv.panel.showPanel(html, true);

  this.psv.panel.container.querySelector('.psv-markers-list').addEventListener('click', this._onClickItem.bind(this));
};

/**
 * Close side panel
 * @return (void)
 */
PSVNavBarMarkersButton.prototype.hideMarkers = function() {
  this.psv.panel.hidePanel();
};

/**
 * Click on an item
 * @param e (Event)
 * @return (void)
 */
PSVNavBarMarkersButton.prototype._onClickItem = function(e) {
  var li;
  if (e.target && (li = PSVUtils.getClosest(e.target, 'li')) && li.dataset.psvMarker) {
    this.psv.hud.gotoMarker(li.dataset.psvMarker, 1000);
    this.psv.panel.hidePanel();
  }
};

/**
 * Update status when the panel is updated
 * @return (void)
 */
PSVNavBarMarkersButton.prototype._onPanelOpened = function() {
  if (this.prop.panelOpening) {
    this.prop.panelOpening = false;
    this.prop.panelOpened = true;
  }
  else {
    this.prop.panelOpened = false;
  }

  this.toggleActive(this.prop.panelOpened);
};

/**
 * Update status when the panel is updated
 * @return (void)
 */
PSVNavBarMarkersButton.prototype._onPanelClosed = function() {
  this.prop.panelOpened = false;
  this.prop.panelOpening = false;

  this.toggleActive(this.prop.panelOpened);
};


/**
 * Navigation bar scenes button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarScenesButton(navbar) {
    PSVNavBarButton.call(this, navbar);

    this.prop = {
        panelOpened: false,
        panelOpening: false
    };

    this.create();
}

PSVNavBarScenesButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarScenesButton.prototype.constructor = PSVNavBarScenesButton;

PSVNavBarScenesButton.className = 'psv-button markers-button';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarScenesButton.prototype.create = function () {
    PSVNavBarButton.prototype.create.call(this);

    this.container.title = 'Sceny';
    this.container.innerHTML = '<i class="material-icons"  aria-hidden="true">collections</i>';

    this.container.addEventListener('click', this.toggleScenes.bind(this));

    this.psv.on('open-panel', this);
    this.psv.on('close-panel', this);
};

/**
 * Destroys the button
 */
PSVNavBarScenesButton.prototype.destroy = function () {
    this.psv.off('open-panel', this);
    this.psv.off('close-panel', this);

    PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarScenesButton.prototype.handleEvent = function (e) {
    switch (e.type) {
        // @formatter:off
        case 'psv:open-panel': this._onPanelOpened(); break;
        case 'psv:close-panel': this._onPanelClosed(); break;
            // @formatter:on
    }
};

/**
 * Toggle the visibility of scenes list
 * @return (void)
 */
PSVNavBarScenesButton.prototype.toggleScenes = function () {
    if (this.prop.panelOpened) {
        this.hideScenes();
    }
    else {
        this.showScenes();
    }
};

/**
 * Open side panel with list of scenes
 * @return (void)
 */
PSVNavBarScenesButton.prototype.showScenes = function () {
    var html = '<div class="psv-markers-list">' +
      '<h1>' + 'Sceny' + '</h1>' +
      '<ul>';

    loader.minatureList.forEach(function (elem) {
        html += '<li data-psv-marker="' + elem.sceneIndex + '">';

        html += '<img  src="' + elem.imgURL + '"/>';

        html += '<p class="marker-name">' + elem.sceneName + '</p>' +
          '</li>';
    });

    html += '</ul>' +
      '</div>';

    this.prop.panelOpening = true;
    this.psv.panel.showPanel(html, true);

    this.psv.panel.container.querySelector('.psv-markers-list').addEventListener('click', this._onClickItem.bind(this));
};

/**
 * Close side panel
 * @return (void)
 */
PSVNavBarScenesButton.prototype.hideScenes = function () {
    this.psv.panel.hidePanel();
};

/**
 * Click on an item
 * @param e (Event)
 * @return (void)
 */
PSVNavBarScenesButton.prototype._onClickItem = function (e) {
    var li;
    if (e.target && (li = PSVUtils.getClosest(e.target, 'li')) && li.dataset.psvMarker) {
        this.psv.trigger('sceneTransition', li.dataset.psvMarker);
    }
};

/**
 * Update status when the panel is updated
 * @return (void)
 */
PSVNavBarScenesButton.prototype._onPanelOpened = function () {
    if (this.prop.panelOpening) {
        this.prop.panelOpening = false;
        this.prop.panelOpened = true;
    }
    else {
        this.prop.panelOpened = false;
    }

    this.toggleActive(this.prop.panelOpened);
};

/**
 * Update status when the panel is updated
 * @return (void)
 */
PSVNavBarScenesButton.prototype._onPanelClosed = function () {
    this.prop.panelOpened = false;
    this.prop.panelOpening = false;

    this.toggleActive(this.prop.panelOpened);
};


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


/**
 * HUD class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVHUD(psv) {
  PSVComponent.call(this, psv);

  this.$svg = null;
  this.markers = {};
  this.currentMarker = null;
  this.hoveringMarker = null;

  this.create();
}

PSVHUD.prototype = Object.create(PSVComponent.prototype);
PSVHUD.prototype.constructor = PSVHUD;

PSVHUD.className = 'psv-hud';
PSVHUD.publicMethods = ['addMarker', 'removeMarker', 'updateMarker', 'getMarker', 'getCurrentMarker', 'gotoMarker', 'hideMarker', 'showMarker', 'toggleMarker'];

PSVHUD.svgNS = 'http://www.w3.org/2000/svg';

/**
 * Creates the HUD
 * @return (void)
 */
PSVHUD.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.$svg = document.createElementNS(PSVHUD.svgNS, 'svg');
  this.$svg.setAttribute('class', 'psv-svg-container');
  this.container.appendChild(this.$svg);

  // Markers events via delegation
  this.container.addEventListener('mouseenter', this, true);
  this.container.addEventListener('mouseleave', this, true);
  this.container.addEventListener('mousemove', this, true);

  // Viewer events
  this.psv.on('_click', this);
  this.psv.on('render', this);
};

/**
 * Destroys the HUD
 */
PSVHUD.prototype.destroy = function() {
  this.container.removeEventListener('mouseenter', this);
  this.container.removeEventListener('mouseleave', this);
  this.container.removeEventListener('mousemove', this);

  this.psv.off('_click', this);
  this.psv.off('render', this);

  this.container.removeChild(this.$svg);
  this.$svg = null;

  PSVComponent.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVHUD.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'mouseenter': this._onMouseEnter(e);    break;
    case 'mouseleave': this._onMouseLeave(e);    break;
    case 'mousemove':  this._onMouseMove(e);     break;
    case 'psv:_click': this._onClick(e.args[0]); break;
    case 'psv:render': this.updatePositions();   break;
    // @formatter:on
  }
};

/**
 * Add a new marker to HUD
 * @param marker (Object)
 * @param render (Boolean) "false" to disable immediate render
 * @return (Object) a modified marker object
 */
PSVHUD.prototype.addMarker = function(marker, render) {
  if (!marker.id) {
    throw new PSVError('missing marker id');
  }

  if (this.markers[marker.id]) {
    throw new PSVError('marker "' + marker.id + '" already exists');
  }

  if (!marker.image && !marker.html && !marker.polygon_px && !marker.polygon_rad) {
    throw new PSVError('missing marker content, image or html or polygon');
  }

  if (marker.image && (!marker.width || !marker.height)) {
    throw new PSVError('missing marker width/height');
  }

  if (marker.image || marker.html) {
    if ((!marker.hasOwnProperty('x') || !marker.hasOwnProperty('y')) && (!marker.hasOwnProperty('latitude') || !marker.hasOwnProperty('longitude'))) {
      throw new PSVError('missing marker position, latitude/longitude or x/y');
    }
  }

  // temporary object replaced by updateMarker()
  var temp = {
    id: marker.id,
    $el: null
  };

  // create DOM
  if (marker.image || marker.html) {
    temp.$el = document.createElement('div');
    temp.$el.setAttribute('class', 'psv-marker');
    this.container.appendChild(temp.$el);
  }
  else {
    temp.$el = document.createElementNS(PSVHUD.svgNS, 'polygon');
    temp.$el.setAttribute('class', 'psv-marker svg-marker');
    this.$svg.appendChild(temp.$el);
  }

  temp.$el.id = 'psv-marker-' + temp.id;

  this.markers[marker.id] = temp;

  return this.updateMarker(marker, render);
};

/**
 * Get a marker by it's id or external object
 * @param marker (Mixed)
 * @return (Object)
 */
PSVHUD.prototype.getMarker = function(marker) {
  var id = typeof marker === 'object' ? marker.id : marker;

  if (!this.markers[id]) {
    throw new PSVError('cannot find marker "' + id + '"');
  }

  return this.markers[id];
};

/**
 * Get the current selected marker
 * @return (Object)
 */
PSVHUD.prototype.getCurrentMarker = function() {
  return this.currentMarker;
};

/**
 * Update a marker
 * @param marker (Object)
 * @param render (Boolean) "false" to disable immediate render
 * @return (Object) a modified marker object
 */
PSVHUD.prototype.updateMarker = function(marker, render) {
  var old = this.getMarker(marker);

  // clean some previous data
  if (old.className) {
    old.$el.classList.remove(old.className);
  }
  if (old.tooltip) {
    old.$el.classList.remove('has-tooltip');
  }

  // merge objects
  if (marker == old) marker = PSVUtils.clone(marker);
  delete marker.$el;
  marker = PSVUtils.deepmerge(old, marker);

  marker.position2D = null;

  // add classes
  if (marker.className) {
    marker.$el.classList.add(marker.className);
  }
  if (marker.tooltip) {
    marker.$el.classList.add('has-tooltip');
    if (typeof marker.tooltip === 'string') {
      marker.tooltip = { content: marker.tooltip };
    }
  }

  if (marker.image || marker.html) {
    this._updateNormalMarker(marker);
  }
  else {
    this._updatePolygonMarker(marker);
  }

  if (!marker.hasOwnProperty('visible')) {
    marker.visible = true;
  }

  // save
  marker.$el.psvMarker = marker;
  this.markers[marker.id] = marker;

  if (render !== false) {
    this.updatePositions();
  }

  return marker;
};

/**
 * Update a marker of type point
 * @param marker
 * @private
 */
PSVHUD.prototype._updateNormalMarker = function(marker) {
  marker.isPolygon = false;

  // set image
  var style = marker.$el.style;

  if (marker.width && marker.height) {
    style.width = marker.width + 'px';
    style.height = marker.height + 'px';
    marker.dynamicSize = false;
  }
  else {
    marker.dynamicSize = true;
  }

  if (marker.style) {
    Object.getOwnPropertyNames(marker.style).forEach(function(prop) {
      style[prop] = marker.style[prop];
    });
  }

  if (marker.image) {
    style.backgroundImage = 'url(' + marker.image + ')';
  }
  else {
    marker.$el.innerHTML = marker.html;
  }

  // parse anchor
  marker.anchor = PSVUtils.parsePosition(marker.anchor);
  style.transformOrigin = marker.anchor.left * 100 + '% ' + marker.anchor.top * 100 + '%';
  
  // convert texture coordinates to spherical coordinates
  this.psv._cleanPosition(marker);

  // compute x/y/z position
  marker.position3D = this.psv.sphericalCoordsToVector3(marker.longitude, marker.latitude);
};

/**
 * Update a marker of type polygon
 * @param marker
 * @private
 */
PSVHUD.prototype._updatePolygonMarker = function(marker) {
  marker.isPolygon = true;
  marker.dynamicSize = true;

  if (marker.style) {
    Object.getOwnPropertyNames(marker.style).forEach(function(prop) {
      marker.$el.setAttribute(prop, marker.style[prop]);
    });
  }
  else {
    marker.$el.setAttribute('fill', 'rgba(0,0,0,0.5)');
  }

  // fold arrays: [1,2,3,4] => [[1,2],[3,4]]
  [marker.polygon_rad, marker.polygon_px].forEach(function(polygon) {
    if (polygon && typeof polygon[0] != 'object') {
      for (var i = 0; i < polygon.length; i++) {
        polygon.splice(i, 2, [polygon[i], polygon[i + 1]]);
      }
    }
  });

  // convert texture coordinates to spherical coordinates
  if (marker.polygon_px) {
    marker.polygon_rad = marker.polygon_px.map(function(coord) {
      var sphericalCoords = this.psv.textureCoordsToSphericalCoords(coord[0], coord[1]);
      return [sphericalCoords.longitude, sphericalCoords.latitude];
    }, this);
  }

  // TODO : compute the center of the polygon
  marker.longitude = marker.polygon_rad[0][0];
  marker.latitude = marker.polygon_rad[0][1];

  // compute x/y/z positions
  marker.positions3D = marker.polygon_rad.map(function(coord) {
    return this.psv.sphericalCoordsToVector3(coord[0], coord[1]);
  }, this);
};

/**
 * Remove a marker
 * @param marker (Mixed)
 * @param render (Boolean) "false" to disable immediate render
 * @return (void)
 */
PSVHUD.prototype.removeMarker = function(marker, render) {
  marker = this.getMarker(marker);

  if (marker.isPolygon) {
    this.$svg.removeChild(marker.$el);
  }
  else {
    this.container.removeChild(marker.$el);
  }

  delete this.markers[marker.id];

  if (render !== false) {
    this.updatePositions();
  }
};

/**
 * Go to a specific marker
 * @param marker (Mixed)
 * @param duration (Mixed, optional)
 * @return (void)
 */
PSVHUD.prototype.gotoMarker = function(marker, duration) {
  marker = this.getMarker(marker);
  this.psv.animate(marker, duration);
};

/**
 * Hide a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.hideMarker = function(marker) {
  this.getMarker(marker).visible = false;
  this.updatePositions();
};

/**
 * Show a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.showMarker = function(marker) {
  this.getMarker(marker).visible = true;
  this.updatePositions();
};

/**
 * Toggle a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.toggleMarker = function(marker) {
  this.getMarker(marker).visible ^= true;
  this.updatePositions();
};

/**
 * Update visibility and position of all markers
 * @return (void)
 */
PSVHUD.prototype.updatePositions = function() {
  var rotation = this.psv.camera.rotation.z / PhotoSphereViewer.PI * 180;

  for (var id in this.markers) {
    var marker = this.markers[id];

    if (marker.isPolygon) {
      var positions = this._getPolygonPositions(marker);

      if (this._isPolygonVisible(marker, positions)) {
        marker.position2D = this._getPolygonDimensions(positions);
        marker.width = marker.position2D.width;
        marker.height = marker.position2D.height;

        var points = '';
        positions.forEach(function(pos) {
          points += pos.left + ',' + pos.top + ' ';
        });

        marker.$el.setAttributeNS(null, 'points', points);

        if (!marker.$el.classList.contains('visible')) {
          marker.$el.classList.add('visible');
        }
      }
      else {
        marker.position2D = null;
        marker.$el.classList.remove('visible');
      }
    }
    else {
      var position = this._getMarkerPosition(marker);

      if (this._isMarkerVisible(marker, position)) {
        marker.position2D = position;

        marker.$el.style.transform = 'translate3D(' + position.left + 'px, ' + position.top + 'px, ' + '0px) rotateZ(' + rotation + 'deg)';

        if (!marker.$el.classList.contains('visible')) {
          marker.$el.classList.add('visible');
        }
      }
      else {
        marker.position2D = null;
        marker.$el.classList.remove('visible');
      }
    }
  }
};

/**
 * Determine if a point marker is visible
 * It tests if the point is in the general direction of the camera, then check if it's in the viewport
 * @param marker (Object)
 * @param position (Object)
 * @return (Boolean)
 */
PSVHUD.prototype._isMarkerVisible = function(marker, position) {
  return marker.visible &&
    marker.position3D.dot(this.psv.prop.direction) > 0 &&
    position.left + marker.width >= 0 &&
    position.left - marker.width <= this.psv.prop.size.width &&
    position.top + marker.height >= 0 &&
    position.top - marker.height <= this.psv.prop.size.height;
};

/**
 * Determine if a polygon marker is visible
 * It tests if at least one point is in teh viewport
 * @param marker (Object)
 * @param positions (Object[])
 * @returns (boolean)
 * @private
 */
PSVHUD.prototype._isPolygonVisible = function(marker, positions) {
  return marker.visible &&
    positions.some(function(pos, i) {
      return marker.positions3D[i].dot(this.psv.prop.direction) > 0 &&
        pos.left >= 0 &&
        pos.left <= this.psv.prop.size.width &&
        pos.top >= 0 &&
        pos.top <= this.psv.prop.size.height;
    }, this);
};

/**
 * Compute HUD coordinates of a marker
 * @param marker (Object)
 * @return (Object) top and left position
 */
PSVHUD.prototype._getMarkerPosition = function(marker) {
  if (marker.dynamicSize) {
    // make the marker visible to get it's size
    marker.$el.classList.add('transparent');
    var rect = marker.$el.getBoundingClientRect();
    marker.$el.classList.remove('transparent');

    marker.width = rect.right - rect.left;
    marker.height = rect.bottom - rect.top;
  }

  var vector = marker.position3D.clone();
  vector.project(this.psv.camera);

  return {
    top: (1 - vector.y) / 2 * this.psv.prop.size.height - marker.height * marker.anchor.top,
    left: (vector.x + 1) / 2 * this.psv.prop.size.width - marker.width * marker.anchor.left
  };
};

/**
 * Compute HUD coordinates of each point of a polygon
 * @param marker (Object)
 * @returns (Object[])
 * @private
 */
PSVHUD.prototype._getPolygonPositions = function(marker) {
  return marker.positions3D.map(function(pos) {
    var vector = pos.clone();
    vector.project(this.psv.camera);

    return {
      top: (1 - vector.y) / 2 * this.psv.prop.size.height,
      left: (vector.x + 1) / 2 * this.psv.prop.size.width
    };
  }, this);
};

/**
 * Compute the boundaries positions of a polygon marker
 * @param positions (Object[])
 * @returns (Object)
 * @private
 */
PSVHUD.prototype._getPolygonDimensions = function(positions) {
  var minX = +Infinity;
  var minY = +Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;

  positions.forEach(function(pos) {
    minX = Math.min(minX, pos.left);
    minY = Math.min(minY, pos.top);
    maxX = Math.max(maxX, pos.left);
    maxY = Math.max(maxY, pos.top);
  });

  return {
    top: minY,
    left: minX,
    width: maxX - minX,
    height: maxY - minY
  };
};

/**
 * The mouse enters a marker : show the tooltip
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onMouseEnter = function(e) {
  var marker;
  if (e.target && (marker = e.target.psvMarker) !== undefined && marker.tooltip && !marker.isPolygon) {
    this.hoveringMarker = marker;

    this.psv.tooltip.showTooltip({
      content: marker.tooltip.content,
      position: marker.tooltip.position,
      top: marker.position2D.top,
      left: marker.position2D.left,
      marker: marker
    });
  }
};

/**
 * The mouse leaves a marker : hide the tooltip
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onMouseLeave = function(e) {
  if (e.target && e.target.psvMarker) {
    // do not hide if we enter the tooltip while hovering a polygon
    if (e.target.psvMarker.isPolygon && e.relatedTarget && PSVUtils.hasParent(e.relatedTarget, this.psv.tooltip.container)) {
      return;
    }

    this.hoveringMarker = null;

    this.psv.tooltip.hideTooltip();
  }
};

/**
 * The mouse hovers a polygon marker, the tooltip follow the cursor.
 * @param e
 * @private
 */
PSVHUD.prototype._onMouseMove = function(e) {
  if (!this.psv.prop.moving) {
    var marker;
    // do not hide if we enter the tooltip while hovering a polygon
    if (e.target && (marker = e.target.psvMarker) && marker.tooltip && marker.isPolygon ||
      e.target && PSVUtils.hasParent(e.target, this.psv.tooltip.container) && (marker = this.hoveringMarker)) {

      this.hoveringMarker = marker;

      // simulate a marker with the size of the tooltip arrow to separate it from the cursor
      this.psv.tooltip.showTooltip({
        content: marker.tooltip.content,
        position: marker.tooltip.position,
        top: e.clientY - this.psv.prop.boundingRect.top - this.psv.config.tooltip.arrow_size,
        left: e.clientX - this.psv.prop.boundingRect.left - this.psv.config.tooltip.arrow_size,
        marker: {
          width: this.psv.config.tooltip.arrow_size * 2,
          height: this.psv.config.tooltip.arrow_size * 2
        }
      });
    }
    else if (this.hoveringMarker && this.hoveringMarker.isPolygon) {
      this.psv.tooltip.hideTooltip();
    }
  }
};

/**
 * The mouse button is release : show/hide the panel if threshold was not reached, or do nothing
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onClick = function(e) {
  var marker;
  if (e.target && (marker = PSVUtils.getClosest(e.target, '.psv-marker')) && marker.psvMarker) {
    this.currentMarker = marker.psvMarker;
    this.psv.trigger('select-marker', marker.psvMarker);

    if (this.psv.config.click_event_on_marker) {
      // add the marker to event data
      e.data = {
        marker: marker.psvMarker
      };
    }
    else {
      // prevent the public "click" event
      e.preventDefault();
    }
  }
  else if (this.currentMarker) {
    this.currentMarker = null;
    this.psv.trigger('unselect-marker');
  }

  if (marker && marker.psvMarker) {
	  switch (marker.psvMarker.type) {
        case "1":
            this.psv.panel.showPanel(marker.psvMarker.content);
            break;
        case "2":
            this.psv.trigger('sceneTransition', marker.psvMarker.target_scene);
            break;
        case "3":
            window.open(marker.psvMarker.link);
            break;
		case "4":
			this.psv.trigger('onMarkerChangeSpot',{ spotId : marker.psvMarker.spotId , sceneIndex : marker.psvMarker.sceneIndex});
			break;
		default:
			this.psv.panel.showPanel(marker.psvMarker.content);
			break;
    }	     
  }
  else if (this.psv.panel.prop.opened) {
    e.preventDefault(); // prevent the public "click" event
    this.psv.panel.hidePanel();
  }
};


/**
 * Loader class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVLoader(psv) {
  PSVComponent.call(this, psv);

  this.canvas = null;
  this.loader = null;

  this.create();
}

PSVLoader.prototype = Object.create(PSVComponent.prototype);
PSVLoader.prototype.constructor = PSVLoader;

PSVLoader.className = 'loader-container';

/**
 * Creates the loader content
 */
PSVLoader.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.loader = document.createElement('div');
  this.loader.className = 'psv-loader';
  this.container.appendChild(this.loader);

  this.canvas = document.createElement('canvas');
  this.canvas.className = 'loader-canvas';

  this.canvas.width = this.loader.clientWidth;
  this.canvas.height = this.loader.clientWidth;
  this.loader.appendChild(this.canvas);

  this.tickness = (this.loader.offsetWidth - this.loader.clientWidth) / 2;

  var inner;
  if (this.psv.config.loading_img) {
    inner = document.createElement('img');
    inner.className = 'loader-image';
    inner.src = this.psv.config.loading_img;
  }
  else if (this.psv.config.loading_txt) {
    inner = document.createElement('div');
    inner.className = 'loader-text';
    inner.innerHTML = this.psv.config.loading_txt;
  }
  if (inner) {
    var a = Math.round(Math.sqrt(2 * Math.pow(this.canvas.width / 2 - this.tickness / 2, 2)));
    inner.style.maxWidth = a + 'px';
    inner.style.maxHeight = a + 'px';
    this.loader.appendChild(inner);
  }
};

/**
 * Sets the loader progression
 * @param value (int) from 0 to 100
 */
PSVLoader.prototype.setProgress = function(value) {
  var context = this.canvas.getContext('2d');

  context.clearRect(0, 0, this.canvas.width, this.canvas.height);

  context.lineWidth = this.tickness;
  context.strokeStyle = PSVUtils.getStyle(this.loader, 'color');

  context.beginPath();
  context.arc(
    this.canvas.width / 2, this.canvas.height / 2,
    this.canvas.width / 2 - this.tickness / 2,
    -Math.PI / 2, value / 100 * 2 * Math.PI - Math.PI / 2
  );
  context.stroke();
};


/**
 * Navigation bar class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVNavBar(psv) {
  PSVComponent.call(this, psv);

  this.config = this.psv.config.navbar;
  this.items = [];

  // all buttons
  if (this.config === true) {
    this.config = PSVUtils.clone(PhotoSphereViewer.DEFAULTS.navbar);
  }
  // space separated list
  else if (typeof this.config == 'string') {
    this.config = this.config.split(' ');
  }
  // migration from object
  else if (!Array.isArray(this.config)) {
    console.warn('PhotoSphereViewer: hashmap form of "navbar" is deprecated, use an array instead.');

    var config = this.config;
    this.config = [];
    for (var key in config) {
      if (config[key]) {
        this.config.push(key);
      }
    }

    this.config.sort(function(a, b) {
      return PhotoSphereViewer.DEFAULTS.navbar.indexOf(a) - PhotoSphereViewer.DEFAULTS.navbar.indexOf(b);
    });
  }

  this.create();
}

PSVNavBar.prototype = Object.create(PSVComponent.prototype);
PSVNavBar.prototype.constructor = PSVNavBar;

PSVNavBar.className = 'psv-navbar';

/**
 * Creates the navbar
 * @return (void)
 */
PSVNavBar.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.config.forEach(function(button) {
    if (typeof button == 'object') {
      this.items.push(new PSVNavBarCustomButton(this, button));
    }
    else {
      switch (button) {
        case 'autorotate':
          this.items.push(new PSVNavBarAutorotateButton(this));
          break;

        case 'zoom':
          this.items.push(new PSVNavBarZoomButton(this));
          break;

        case 'download':
          this.items.push(new PSVNavBarDownloadButton(this));
          break;

        case 'markers':
          this.items.push(new PSVNavBarMarkersButton(this));
          break;

        case 'fullscreen':
          this.items.push(new PSVNavBarFullscreenButton(this));
          break;

        case 'gyroscope':
          this.items.push(new PSVNavBarGyroscopeButton(this));
          break;

        case 'caption':
          this.items.push(new PSVNavBarCaption(this, this.psv.config.caption));
          break;

		case 'scenes':
		this.items.push(new PSVNavBarScenesButton(this));
		break;
		  
        case 'spacer':
          button = 'spacer-5';
        /* falls through */
        default:
          var matches = button.match(/spacer\-([0-9]+)/);
          if (matches !== null) {
            this.items.push(new PSVNavBarSpacer(this, matches[1]));
          }
          else {
            throw new PSVError('Unknown button ' + button);
          }
          break;
      }
    }
  }, this);
};

/**
 * Destroys the navbar
 */
PSVNavBar.prototype.destroy = function() {
  this.items.forEach(function(item) {
    item.destroy();
  });

  this.items.length = 0;

  PSVComponent.prototype.destroy.call(this);
};


/**
 * Navbar caption class
 * @param navbar (PSVNavBar) A PSVNavBar object
 * @param caption (String)
 */
function PSVNavBarCaption(navbar, caption) {
  PSVComponent.call(this, navbar);

  this.create();

  this.setCaption(caption);
}

PSVNavBarCaption.prototype = Object.create(PSVComponent.prototype);
PSVNavBarCaption.prototype.constructor = PSVNavBarCaption;

PSVNavBarCaption.className = 'psv-caption';
PSVNavBarCaption.publicMethods = ['setCaption'];

/**
 * Sets the bar caption
 * @param (string) html
 */
PSVNavBarCaption.prototype.setCaption = function(html) {
  if (!html) {
    this.container.innerHTML = '';
  }
  else {
    this.container.innerHTML = html;
  }
};


/**
 * Navbar spacer class
 * @param navbar (PSVNavBar) A PSVNavBar object
 * @param weight (int)
 */
function PSVNavBarSpacer(navbar, weight) {
  PSVComponent.call(this, navbar);

  this.create();

  this.container.classList.add('weight-' + (weight || 5));
}

PSVNavBarSpacer.prototype = Object.create(PSVComponent.prototype);
PSVNavBarSpacer.prototype.constructor = PSVNavBarSpacer;

PSVNavBarSpacer.className = 'psv-spacer';


/**
 * Panel class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVPanel(psv) {
  PSVComponent.call(this, psv);

  this.content = null;

  this.prop = {
    mouse_x: 0,
    mouse_y: 0,
    mousedown: false,
    opened: false
  };

  this.create();
}

PSVPanel.prototype = Object.create(PSVComponent.prototype);
PSVPanel.prototype.constructor = PSVPanel;

PSVPanel.className = 'psv-panel';
PSVPanel.publicMethods = ['showPanel', 'hidePanel'];

/**
 * Creates the panel
 * @return (void)
 */
PSVPanel.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.container.innerHTML =
    '<div class="resizer"></div>' +
    '<div class="close-button"></div>' +
    '<div class="content"></div>';

  this.content = this.container.querySelector('.content');

  var closeBtn = this.container.querySelector('.close-button');
  closeBtn.addEventListener('click', this.hidePanel.bind(this));

  // Stop event bubling from panel
  if (this.psv.config.mousewheel) {
    this.container.addEventListener(PhotoSphereViewer.SYSTEM.mouseWheelEvent, function(e) {
      e.stopPropagation();
    });
  }

  // Event for panel resizing + stop bubling
  var resizer = this.container.querySelector('.resizer');
  resizer.addEventListener('mousedown', this);
  resizer.addEventListener('touchstart', this);
  this.psv.container.addEventListener('mouseup', this);
  this.psv.container.addEventListener('touchend', this);
  this.psv.container.addEventListener('mousemove', this);
  this.psv.container.addEventListener('touchmove', this);
};

/**
 * Destroys the panel
 */
PSVPanel.prototype.destroy = function() {
  this.psv.container.removeEventListener('mousemove', this);
  this.psv.container.removeEventListener('touchmove', this);
  this.psv.container.removeEventListener('mouseup', this);
  this.psv.container.removeEventListener('touchend', this);

  PSVComponent.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVPanel.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'mousedown': this._onMouseDown(e); break;
    case 'touchstart': this._onTouchStart(e); break;
    case 'mousemove': this._onMouseMove(e); break;
    case 'touchmove': this._onTouchMove(e); break;
    case 'mouseup': this._onMouseUp(e); break;
    case 'touchend': this._onMouseUp(e); break;
    // @formatter:on
  }
};

/**
 * Show the panel
 * @param marker (Object)
 * @param noMargin (Boolean)
 * @return (void)
 */
PSVPanel.prototype.showPanel = function(content, noMargin) {
  this.content.innerHTML = content;
  this.content.scrollTop = 0;
  this.container.classList.add('open');

  if (noMargin) {
    if (!this.content.classList.contains('no-margin')) {
      this.content.classList.add('no-margin');
    }
  }
  else {
    this.content.classList.remove('no-margin');
  }

  this.prop.opened = true;
  this.psv.trigger('open-panel');
};


/**
 * Hide the panel
 * @return (void)
 */
PSVPanel.prototype.hidePanel = function() {
  this.prop.opened = false;
  this.container.classList.remove('open');
  this.psv.trigger('close-panel');
};

/**
 * The user wants to move
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onMouseDown = function(evt) {
  evt.stopPropagation();
  this._startResize(evt);
};

/**
 * The user wants to move (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onTouchStart = function(evt) {
  evt.stopPropagation();
  this._startResize(evt.changedTouches[0]);
};

/**
 * Initializes the movement
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._startResize = function(evt) {
  this.prop.mouse_x = parseInt(evt.clientX);
  this.prop.mouse_y = parseInt(evt.clientY);
  this.prop.mousedown = true;
  this.content.classList.add('no-interaction');
};

/**
 * The user wants to stop moving
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onMouseUp = function(evt) {
  if (this.prop.mousedown) {
    evt.stopPropagation();
    this.prop.mousedown = false;
    this.content.classList.remove('no-interaction');
  }
};

/**
 * The user resizes the panel
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onMouseMove = function(evt) {
  if (this.prop.mousedown) {
    evt.stopPropagation();
    this._resize(evt);
  }
};

/**
 * The user resizes the panel (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onTouchMove = function(evt) {
  if (this.prop.mousedown) {
    evt.stopPropagation();
    this._resize(evt.touches[0]);
  }
};

/**
 * Panel resizing
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._resize = function(evt) {
  var x = parseInt(evt.clientX);
  var y = parseInt(evt.clientY);

  this.container.style.width = (this.container.offsetWidth - (x - this.prop.mouse_x)) + 'px';

  this.prop.mouse_x = x;
  this.prop.mouse_y = y;
};


/**
 * Tooltip class
 * @param hud (PSVHUD) A PSVHUD object
 */
function PSVTooltip(hud) {
  PSVComponent.call(this, hud);

  this.config = this.psv.config.tooltip;

  this.create();
}

PSVTooltip.prototype = Object.create(PSVComponent.prototype);
PSVTooltip.prototype.constructor = PSVTooltip;

PSVTooltip.className = 'psv-tooltip';
PSVTooltip.publicMethods = ['showTooltip', 'hideTooltip', 'isTooltipVisible'];

PSVTooltip.leftMap = { 0: 'left', 0.5: 'center', 1: 'right' };
PSVTooltip.topMap = { 0: 'top', 0.5: 'center', 1: 'bottom' };

/**
 * Creates the tooltip
 * @return (void)
 */
PSVTooltip.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.container.innerHTML = '<div class="arrow"></div><div class="content"></div>';
  this.container.style.top = '-1000px';
  this.container.style.left = '-1000px';

  this.psv.on('render', this);
};

/**
 * Destroys the tooltip
 */
PSVTooltip.prototype.destroy = function() {
  this.psv.off('render', this);

  PSVComponent.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVTooltip.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'psv:render': this.hideTooltip(); break;
    // @formatter:on
  }
};

PSVTooltip.prototype.isTooltipVisible = function() {
  return this.container.classList.contains('visible');
};

/**
 * Show the tooltip
 * @param config (Object)
 *    - content
 *    - top
 *    - left
 *    - position (default: 'top center')
 *    - className (optional)
 *    - marker (optional) -- take marker dimensions in account when positioning the tooltip
 * @return (void)
 */
PSVTooltip.prototype.showTooltip = function(config) {
  var isUpdate = this.isTooltipVisible();
  var t = this.container;
  var c = t.querySelector('.content');
  var a = t.querySelector('.arrow');

  if (!config.position) {
    config.position = ['top', 'center'];
  }

  if (!config.marker) {
    config.marker = {
      width: 0,
      height: 0
    };
  }

  // parse position
  if (typeof config.position === 'string') {
    var tempPos = PSVUtils.parsePosition(config.position);

    if (!(tempPos.left in PSVTooltip.leftMap) || !(tempPos.top in PSVTooltip.topMap)) {
      throw new PSVError('unable to parse tooltip position "' + tooltip.position + '"');
    }

    config.position = [PSVTooltip.topMap[tempPos.top], PSVTooltip.leftMap[tempPos.left]];
  }

  if (config.position[0] == 'center' && config.position[1] == 'center') {
    throw new PSVError('unable to parse tooltip position "center center"');
  }

  if (isUpdate) {
    // Remove every other classes (Firefox does not implements forEach)
    for (var i = t.classList.length - 1; i >= 0; i--) {
      var item = t.classList.item(i);
      if (item != 'psv-tooltip' && item != 'visible') {
        t.classList.remove(item);
      }
    }
  }
  else {
    t.className = 'psv-tooltip'; // reset the class
    if (config.className) {
      t.classList.add(config.className);
    }
  }

  c.innerHTML = config.content;
  t.style.top = '0px';
  t.style.left = '0px';

  // compute size
  var rect = t.getBoundingClientRect();
  var style = {
    posClass: config.position.slice(),
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    top: 0,
    left: 0,
    arrow_top: 0,
    arrow_left: 0
  };

  // set initial position
  this._computeTooltipPosition(style, config);

  // correct position if overflow
  var refresh = false;
  if (style.top < this.config.offset) {
    style.posClass[0] = 'bottom';
    refresh = true;
  }
  else if (style.top + style.height > this.psv.prop.size.height - this.config.offset) {
    style.posClass[0] = 'top';
    refresh = true;
  }
  if (style.left < this.config.offset) {
    style.posClass[1] = 'right';
    refresh = true;
  }
  else if (style.left + style.width > this.psv.prop.size.width - this.config.offset) {
    style.posClass[1] = 'left';
    refresh = true;
  }
  if (refresh) {
    this._computeTooltipPosition(style, config);
  }

  // apply position
  t.style.top = style.top + 'px';
  t.style.left = style.left + 'px';

  a.style.top = style.arrow_top + 'px';
  a.style.left = style.arrow_left + 'px';

  t.classList.add(style.posClass.join('-'));

  // delay for correct transition between the two classes
  if (!isUpdate) {
    var self = this;
    window.setTimeout(function() {
      t.classList.add('visible');
      self.psv.trigger('show-tooltip');
    }, this.config.delay);
  }
};

/**
 * Hide the tooltip
 * @return (void)
 */
PSVTooltip.prototype.hideTooltip = function() {
  if (this.isTooltipVisible()) {
    this.container.classList.remove('visible');
    this.psv.trigger('hide-tooltip');

    var self = this;
    window.setTimeout(function() {
      self.container.style.top = '-1000px';
      self.container.style.left = '-1000px';
    }, this.config.delay);
  }
};

/**
 * Compute the position of the tooltip and its arrow
 * @param style (Object)
 * @param config (Object)
 * @return (void)
 */
PSVTooltip.prototype._computeTooltipPosition = function(style, config) {
  var topBottom = false;

  switch (style.posClass[0]) {
    case 'bottom':
      style.top = config.top + config.marker.height + this.config.offset + this.config.arrow_size;
      style.arrow_top = -this.config.arrow_size * 2;
      topBottom = true;
      break;

    case 'center':
      style.top = config.top + config.marker.height / 2 - style.height / 2;
      style.arrow_top = style.height / 2 - this.config.arrow_size;
      break;

    case 'top':
      style.top = config.top - style.height - this.config.offset - this.config.arrow_size;
      style.arrow_top = style.height;
      topBottom = true;
      break;
  }

  switch (style.posClass[1]) {
    case 'right':
      if (topBottom) {
        style.left = config.left;
        style.arrow_left = config.marker.width / 2 - this.config.arrow_size;
      }
      else {
        style.left = config.left + config.marker.width + this.config.offset + this.config.arrow_size;
        style.arrow_left = -this.config.arrow_size * 2;
      }
      break;

    case 'center':
      style.left = config.left + config.marker.width / 2 - style.width / 2;
      style.arrow_left = style.width / 2 - this.config.arrow_size;
      break;

    case 'left':
      if (topBottom) {
        style.left = config.left - style.width + config.marker.width;
        style.arrow_left = style.width - config.marker.width / 2 - this.config.arrow_size;
      }
      else {
        style.left = config.left - style.width - this.config.offset - this.config.arrow_size;
        style.arrow_left = style.width;
      }
      break;
  }
};


/**
 * Godrays shader
 * from http://demo.bkcore.com/threejs/webgl_tron_godrays.html
 */

THREE.GodraysShader = {
  uniforms: {
    tDiffuse: { type: 't', value: 0, texture: null },
    fX: { type: 'f', value: 0.5 },
    fY: { type: 'f', value: 0.5 },
    fExposure: { type: 'f', value: 0.6 },
    fDecay: { type: 'f', value: 0.93 },
    fDensity: { type: 'f', value: 0.96 },
    fWeight: { type: 'f', value: 0.4 },
    fClamp: { type: 'f', value: 1.0 }
  },

  // @formatter:off
  vertexShader: [
    'varying vec2 vUv;',

    'void main()',
    '{',
      'vUv = vec2( uv.x, uv.y );',
      'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
    '}'
  ].join('\n'),
  // @formatter:off

  // @formatter:on
  fragmentShader: [
    'varying vec2 vUv;',
    'uniform sampler2D tDiffuse;',

    'uniform float fX;',
    'uniform float fY;',
    'uniform float fExposure;',
    'uniform float fDecay;',
    'uniform float fDensity;',
    'uniform float fWeight;',
    'uniform float fClamp;',

    'const int iSamples = 20;',

    'void main()',
    '{',
      'vec2 deltaTextCoord = vec2(vUv - vec2(fX,fY));',
      'deltaTextCoord *= 1.0 /  float(iSamples) * fDensity;',
      'vec2 coord = vUv;',
      'float illuminationDecay = 1.0;',
      'vec4 FragColor = vec4(0.0);',

      'for(int i=0; i < iSamples ; i++)',
      '{',
        'coord -= deltaTextCoord;',
        'vec4 texel = texture2D(tDiffuse, coord);',
        'texel *= illuminationDecay * fWeight;',

        'FragColor += texel;',

        'illuminationDecay *= fDecay;',
      '}',

      'FragColor *= fExposure;',
      'FragColor = clamp(FragColor, 0.0, fClamp);',
      'gl_FragColor = FragColor;',
    '}'
  ].join('\n')
  // @formatter:on
};


// Modified from http://mattsnider.com/cross-browser-and-legacy-supported-requestframeanimation/
// LICENSE: MIT: http://mattsnider.com/projects/license/

(function(w) {
    "use strict";
    // most browsers have an implementation
    w.requestAnimationFrame = w.requestAnimationFrame ||
            w.mozRequestAnimationFrame || w.webkitRequestAnimationFrame ||
            w.msRequestAnimationFrame;
    w.cancelAnimationFrame = w.cancelAnimationFrame ||
            w.mozCancelAnimationFrame || w.webkitCancelAnimationFrame ||
            w.msCancelAnimationFrame;

    // polyfill, when necessary
    if (!w.requestAnimationFrame) {
        var aAnimQueue = [],
            aProcessing = [],
            iRequestId = 0,
            iIntervalId;

        // create a mock requestAnimationFrame function
        w.requestAnimationFrame = function(callback) {
            aAnimQueue.push([++iRequestId, callback]);

            if (!iIntervalId) {
                iIntervalId = setInterval(function() {
                    if (aAnimQueue.length) {
                        var time = +new Date();
                        // Process all of the currently outstanding frame
                        // requests, but none that get added during the
                        // processing.
                        // Swap the arrays so we don't have to create a new
                        // array every frame.
                        var temp = aProcessing;
                        aProcessing = aAnimQueue;
                        aAnimQueue = temp;
                        while (aProcessing.length) {
                            aProcessing.shift()[1](time);
                        }
                    } else {
                        // don't continue the interval, if unnecessary
                        clearInterval(iIntervalId);
                        iIntervalId = undefined;
                    }
                }, 1000 / 50);  // estimating support for 50 frames per second
            }

            return iRequestId;
        };

        // create a mock cancelAnimationFrame function
        w.cancelAnimationFrame = function(requestId) {
            // find the request ID and remove it
            var i, j;
            for (i = 0, j = aAnimQueue.length; i < j; i += 1) {
                if (aAnimQueue[i][0] === requestId) {
                    aAnimQueue.splice(i, 1);
                    return;
                }
            }

            // If it's not in the queue, it may be in the set we're currently
            // processing (if cancelAnimationFrame is called from within a
            // requestAnimationFrame callback).
            for (i = 0, j = aProcessing.length; i < j; i += 1) {
                if (aProcessing[i][0] === requestId) {
                    aProcessing.splice(i, 1);
                    return;
                }
            }
        };
    }
})(window);


PhotoSphereViewer.ICONS['compass.svg'] = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve"><path d="M49.997,0C22.38,0.004,0.005,22.383,0,50.002C0.005,77.614,22.38,99.995,49.997,100C77.613,99.995,99.996,77.614,100,50.002C99.996,22.383,77.613,0.004,49.997,0z M49.997,88.81c-21.429-0.04-38.772-17.378-38.809-38.807c0.037-21.437,17.381-38.775,38.809-38.812C71.43,11.227,88.769,28.567,88.81,50.002C88.769,71.432,71.43,88.77,49.997,88.81z"/><path d="M72.073,25.891L40.25,41.071l-0.003-0.004l-0.003,0.009L27.925,74.109l31.82-15.182l0.004,0.004l0.002-0.007l-0.002-0.004L72.073,25.891z M57.837,54.411L44.912,42.579l21.092-10.062L57.837,54.411z"/><!--Created by iconoci from the Noun Project--></svg>';

PhotoSphereViewer.ICONS['download.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve"><path d="M83.285,35.575H66.271L66.277,3H32.151v32.575H16.561l33.648,32.701L83.285,35.575z"/><path d="M83.316,64.199v16.32H16.592v-16.32H-0.094v32.639H100V64.199H83.316z"/><!--Created by Michael Zenaty from the Noun Project--></svg>';

PhotoSphereViewer.ICONS['fullscreen-in.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve"><polygon points="100,39.925 87.105,39.925 87.105,18.895 66.075,18.895 66.075,6 100,6"/><polygon points="100,93.221 66.075,93.221 66.075,80.326 87.105,80.326 87.105,59.295 100,59.295"/><polygon points="33.925,93.221 0,93.221 0,59.295 12.895,59.295 12.895,80.326 33.925,80.326"/><polygon points="12.895,39.925 0,39.925 0,6 33.925,6 33.925,18.895 12.895,18.895"/><!--Created by Garrett Knoll from the Noun Project--></svg>';

PhotoSphereViewer.ICONS['fullscreen-out.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve"><polygon points="66.075,7 78.969,7 78.969,28.031 100,28.031 100,40.925 66.075,40.925"/><polygon points="66.075,60.295 100,60.295 100,73.19 78.969,73.19 78.969,94.221 66.075,94.221"/><polygon points="0,60.295 33.925,60.295 33.925,94.221 21.031,94.221 21.031,73.19 0,73.19"/><polygon points="21.031,7 33.925,7 33.925,40.925 0,40.925 0,28.031 21.031,28.031"/><!--Created by Garrett Knoll from the Noun Project--></svg>';

PhotoSphereViewer.ICONS['pin.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 48 48" enable-background="new 0 0 48 48" xml:space="preserve"><path d="M24,0C13.798,0,5.499,8.3,5.499,18.501c0,10.065,17.57,28.635,18.318,29.421C23.865,47.972,23.931,48,24,48s0.135-0.028,0.183-0.078c0.748-0.786,18.318-19.355,18.318-29.421C42.501,8.3,34.202,0,24,0z M24,7.139c5.703,0,10.342,4.64,10.342,10.343c0,5.702-4.639,10.342-10.342,10.342c-5.702,0-10.34-4.64-10.34-10.342C13.66,11.778,18.298,7.139,24,7.139z"/><!--Created by Daniele Marucci from the Noun Project--></svg>';

PhotoSphereViewer.ICONS['play-active.svg'] = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 41 41" enable-background="new 0 0 41 41" xml:space="preserve"><path d="M40.5,14.1c-0.1-0.1-1.2-0.5-2.898-1C37.5,13.1,37.4,13,37.4,12.9C34.5,6.5,28,2,20.5,2S6.6,6.5,3.7,12.9c0,0.1-0.1,0.1-0.2,0.2c-1.7,0.6-2.8,1-2.9,1L0,14.4v12.1l0.6,0.2c0.1,0,1.1,0.399,2.7,0.899c0.1,0,0.2,0.101,0.2,0.199C6.3,34.4,12.9,39,20.5,39c7.602,0,14.102-4.6,16.9-11.1c0-0.102,0.1-0.102,0.199-0.2c1.699-0.601,2.699-1,2.801-1l0.6-0.3V14.3L40.5,14.1z M6.701,11.5C9.7,7,14.8,4,20.5,4c5.8,0,10.9,3,13.8,7.5c0.2,0.3-0.1,0.6-0.399,0.5c-3.799-1-8.799-2-13.6-2c-4.7,0-9.5,1-13.2,2C6.801,12.1,6.601,11.8,6.701,11.5z M25.1,20.3L18.7,24c-0.3,0.2-0.7,0-0.7-0.5v-7.4c0-0.4,0.4-0.6,0.7-0.4 l6.399,3.8C25.4,19.6,25.4,20.1,25.1,20.3z M34.5,29.201C31.602,33.9,26.4,37,20.5,37c-5.9,0-11.1-3.1-14-7.898c-0.2-0.302,0.1-0.602,0.4-0.5c3.9,1,8.9,2.1,13.6,2.1c5,0,9.9-1,13.602-2C34.4,28.602,34.602,28.9,34.5,29.201z"/><!--Created by Nick Bluth from the Noun Project--></svg>';

PhotoSphereViewer.ICONS['play.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 41 41" enable-background="new 0 0 41 41" xml:space="preserve"><path d="M40.5,14.1c-0.1-0.1-1.2-0.5-2.899-1c-0.101,0-0.2-0.1-0.2-0.2C34.5,6.5,28,2,20.5,2S6.6,6.5,3.7,12.9c0,0.1-0.1,0.1-0.2,0.2c-1.7,0.6-2.8,1-2.9,1L0,14.4v12.1l0.6,0.2c0.1,0,1.1,0.4,2.7,0.9c0.1,0,0.2,0.1,0.2,0.199C6.3,34.4,12.9,39,20.5,39c7.601,0,14.101-4.6,16.9-11.1c0-0.101,0.1-0.101,0.2-0.2c1.699-0.6,2.699-1,2.8-1l0.6-0.3V14.3L40.5,14.1zM20.5,4c5.8,0,10.9,3,13.8,7.5c0.2,0.3-0.1,0.6-0.399,0.5c-3.8-1-8.8-2-13.6-2c-4.7,0-9.5,1-13.2,2c-0.3,0.1-0.5-0.2-0.4-0.5C9.7,7,14.8,4,20.5,4z M20.5,37c-5.9,0-11.1-3.1-14-7.899c-0.2-0.301,0.1-0.601,0.4-0.5c3.9,1,8.9,2.1,13.6,2.1c5,0,9.9-1,13.601-2c0.3-0.1,0.5,0.2,0.399,0.5C31.601,33.9,26.4,37,20.5,37z M39.101,24.9c0,0.1-0.101,0.3-0.2,0.3c-2.5,0.9-10.4,3.6-18.4,3.6c-7.1,0-15.6-2.699-18.3-3.6C2.1,25.2,2,25,2,24.9V16c0-0.1,0.1-0.3,0.2-0.3c2.6-0.9,10.6-3.6,18.2-3.6c7.5,0,15.899,2.7,18.5,3.6c0.1,0,0.2,0.2,0.2,0.3V24.9z"/><path d="M18.7,24l6.4-3.7c0.3-0.2,0.3-0.7,0-0.8l-6.4-3.8c-0.3-0.2-0.7,0-0.7,0.4v7.4C18,24,18.4,24.2,18.7,24z"/><!--Created by Nick Bluth from the Noun Project--></svg>';

PhotoSphereViewer.ICONS['zoom-in.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 20 20" enable-background="new 0 0 20 20" xml:space="preserve"><path d="M14.043,12.22c2.476-3.483,1.659-8.313-1.823-10.789C8.736-1.044,3.907-0.228,1.431,3.255c-2.475,3.482-1.66,8.312,1.824,10.787c2.684,1.908,6.281,1.908,8.965,0l4.985,4.985c0.503,0.504,1.32,0.504,1.822,0c0.505-0.503,0.505-1.319,0-1.822L14.043,12.22z M7.738,13.263c-3.053,0-5.527-2.475-5.527-5.525c0-3.053,2.475-5.527,5.527-5.527c3.05,0,5.524,2.474,5.524,5.527C13.262,10.789,10.788,13.263,7.738,13.263z"/><polygon points="8.728,4.009 6.744,4.009 6.744,6.746 4.006,6.746 4.006,8.73 6.744,8.73 6.744,11.466 8.728,11.466 8.728,8.73 11.465,8.73 11.465,6.746 8.728,6.746"/><!--Created by Ryan Canning from the Noun Project--></svg>';

PhotoSphereViewer.ICONS['zoom-out.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 20 20" enable-background="new 0 0 20 20" xml:space="preserve"><path d="M14.043,12.22c2.476-3.483,1.659-8.313-1.823-10.789C8.736-1.044,3.907-0.228,1.431,3.255c-2.475,3.482-1.66,8.312,1.824,10.787c2.684,1.908,6.281,1.908,8.965,0l4.985,4.985c0.503,0.504,1.32,0.504,1.822,0c0.505-0.503,0.505-1.319,0-1.822L14.043,12.22z M7.738,13.263c-3.053,0-5.527-2.475-5.527-5.525c0-3.053,2.475-5.527,5.527-5.527c3.05,0,5.524,2.474,5.524,5.527C13.262,10.789,10.788,13.263,7.738,13.263z"/><rect x="4.006" y="6.746" width="7.459" height="1.984"/><!--Created by Ryan Canning from the Noun Project--></svg>';

return PhotoSphereViewer;
}));
