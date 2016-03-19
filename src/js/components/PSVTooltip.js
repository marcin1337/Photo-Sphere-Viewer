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
    case 'render': this.hideTooltip(); break;
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
      PSVUtils.addClasses(t, config.className);
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
