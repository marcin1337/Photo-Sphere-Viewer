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
    case 'fullscreen-updated': this.toggleActive(e.args[0]); break;
    // @formatter:on
  }
};
