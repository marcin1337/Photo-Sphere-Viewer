/**
 * Static utilities for PSV
 */
var PSVUtils = {};

PSVUtils.TwoPI = Math.PI * 2.0;
PSVUtils.HalfPI = Math.PI / 2.0;

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
 * Gets max texture width in WebGL context
 * @return (int)
 */
PSVUtils.getMaxTextureWidth = function() {
  var ctx = PSVUtils.getWebGLCtx();
  return ctx.getParameter(ctx.MAX_TEXTURE_SIZE);
};

/**
 * Toggles a CSS class
 * @param element (HTMLElement)
 * @param className (String)
 * @param active (boolean,optional) forced state
 */
PSVUtils.toggleClass = function(element, className, active) {
  if (active === undefined) {
    element.classList.toggle(className);
  }
  else if (active && !element.classList.contains(className)) {
    element.classList.add(className);
  }
  else if (!active) {
    element.classList.remove(className);
  }
};

/**
 * Adds one or several CSS classes to an element
 * @param element (HTMLElement)
 * @param className (String)
 */
PSVUtils.addClasses = function(element, className) {
  if (!className) {
    return;
  }
  className.split(' ').forEach(function(name) {
    element.classList.add(name);
  });
};

/**
 * Removes one or several CSS classes to an element
 * @param element (HTMLElement)
 * @param className (String)
 */
PSVUtils.removeClasses = function(element, className) {
  if (!className) {
    return;
  }
  className.split(' ').forEach(function(name) {
    element.classList.remove(name);
  });
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
 * @param elt (HTMLElement)
 * @return (boolean) true if fullscreen is enabled, false otherwise
 */
PSVUtils.isFullscreenEnabled = function(elt) {
  return (document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement) === elt;
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
 * Parse the animation speed
 * @param speed (string) The speed, in radians/degrees/revolutions per second/minute
 * @return (double) radians per second
 */
PSVUtils.parseSpeed = function(speed) {
  if (typeof speed == 'string') {
    speed = speed.toString().trim();

    // Speed extraction
    var speed_value = parseFloat(speed.replace(/^(-?[0-9]+(?:\.[0-9]*)?).*$/, '$1'));
    var speed_unit = speed.replace(/^-?[0-9]+(?:\.[0-9]*)?(.*)$/, '$1').trim();

    // "per minute" -> "per second"
    if (speed_unit.match(/(pm|per minute)$/)) {
      speed_value /= 60;
    }

    // Which unit?
    switch (speed_unit) {
      // Degrees per minute / second
      case 'dpm':
      case 'degrees per minute':
      case 'dps':
      case 'degrees per second':
        speed = speed_value * Math.PI / 180;
        break;

      // Radians per minute / second
      case 'radians per minute':
      case 'radians per second':
        speed = speed_value;
        break;

      // Revolutions per minute / second
      case 'rpm':
      case 'revolutions per minute':
      case 'rps':
      case 'revolutions per second':
        speed = speed_value * PSVUtils.TwoPI;
        break;

      // Unknown unit
      default:
        throw new PSVError('unknown speed unit "' + speed_unit + '"');
    }
  }

  return speed;
};

/**
 * Parses an angle value in radians or degrees and return a normalized value in radians
 * @param angle (String|int|double) - 3.14, 3.14rad, 180deg
 * @param reference (boolean) base value for normalization, false to disable - default: 0
 * @returns (double)
 */
PSVUtils.parseAngle = function(angle, reference) {
  if (typeof angle == 'string') {
    var match = angle.toLowerCase().trim().match(/^(-?[0-9]+(?:\.[0-9]*)?)(.*)$/);

    if (!match) {
      throw new PSVError('unknown angle "' + angle + '"');
    }

    var value = parseFloat(match[1]);
    var unit = match[2];

    if (unit) {
      switch (unit) {
        case 'deg':
        case 'degs':
          angle = value / 180 * Math.PI;
          break;
        case 'rad':
        case 'rads':
          angle = value;
          break;
        default:
          throw new PSVError('unknown angle unit "' + unit + '"');
      }
    }
  }

  if (reference !== false) {
    if (reference === undefined) {
      reference = 0;
    }

    angle = (angle - reference) % PSVUtils.TwoPI;

    if (angle < 0) {
      angle = PSVUtils.TwoPI + angle;
    }

    angle += reference;
  }

  return angle;
};

/**
 * Utility for animations
 * @param options (Object)
 *    - properties ({name: {end: number, start: number}})
 *    - duration (int)
 *    - delay (int, optional)
 *    - easing (string|function, optional)
 *    - onTick (function(properties))
 *    - onCancel (function)
 *    - onDone (function)
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

      if (options.onDone) {
        options.onDone();
      }

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
    }
    defer.reject();
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
  linear: function(t) { return t; },

  inQuad: function(t) { return t*t; },
  outQuad: function(t) { return t*(2-t); },
  inOutQuad: function(t) { return t<.5 ? 2*t*t : -1+(4-2*t)*t; },

  inCubic: function(t) { return t*t*t; },
  outCubic: function(t) { return (--t)*t*t+1; },
  inOutCubic: function(t) { return t<.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1; },

  inQuart: function(t) { return t*t*t*t; },
  outQuart: function(t) { return 1-(--t)*t*t*t; },
  inOutQuart: function(t) { return t<.5 ? 8*t*t*t*t : 1-8*(--t)*t*t*t; },

  inQuint: function(t) { return t*t*t*t*t; },
  outQuint: function(t) { return 1+(--t)*t*t*t*t; },
  inOutQuint: function(t) { return t<.5 ? 16*t*t*t*t*t : 1+16*(--t)*t*t*t*t; },

  inSine: function(t) { return 1-Math.cos(t*(Math.PI/2)); },
  outSine: function(t) { return Math.sin(t*(Math.PI/2)); },
  inOutSine: function(t) { return .5-.5*Math.cos(Math.PI*t); },

  inExpo: function(t) { return Math.pow(2, 10*(t-1)); },
  outExpo: function(t) { return 1-Math.pow(2, -10*t); },
  inOutExpo: function(t) { t=t*2-1; return t<0 ? .5*Math.pow(2, 10*t) : 1-.5*Math.pow(2, -10*t); },

  inCirc: function(t) { return 1-Math.sqrt(1-t*t); },
  outCirc: function(t) { t--; return Math.sqrt(1-t*t); },
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
 * Modified to alter the target object.
 * @copyright Nicholas Fisher <nfisher110@gmail.com>"
 * @license MIT
 * @param target (Object)
 * @param src (Object)
 * @return target (Object)
 */
PSVUtils.deepmerge = function(target, src) {
  var first = src;

  return (function merge(target, src) {
    if (Array.isArray(src)) {
      if (!target || !Array.isArray(target)) {
        target = [];
      }
      else {
        target.length = 0;
      }
      src.forEach(function(e, i) {
        target[i] = merge(null, e);
      });
    }
    else if (typeof src == 'object') {
      if (!target || Array.isArray(target)) {
        target = {};
      }
      Object.keys(src).forEach(function(key) {
        if (typeof src[key] != 'object' || !src[key]) {
          target[key] = src[key];
        }
        else if (src[key] != first) {
          if (!target[key]) {
            target[key] = merge(null, src[key]);
          }
          else {
            merge(target[key], src[key]);
          }
        }
      });
    }
    else {
      target = src;
    }

    return target;
  }(target, src));
};

/**
 * Clone an object
 * @param src (Object)
 * @return (Object)
 */
PSVUtils.clone = function(src) {
  return PSVUtils.deepmerge(null, src);
};
