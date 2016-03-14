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
  PSVUtils.toggleClass(this.container, 'active', active);

  if (this.constructor.iconActive) {
    this.container.innerHTML = PhotoSphereViewer.ICONS[active ? this.constructor.iconActive : this.constructor.icon];
  }
};
