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
    case 'autorotate': this.toggleActive(e.args[0]); break;
    // @formatter:on
  }
};
