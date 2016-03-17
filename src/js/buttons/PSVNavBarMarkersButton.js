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
    case 'open-panel': this._onPanelOpened(); break;
    case 'close-panel': this._onPanelClosed(); break;
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
