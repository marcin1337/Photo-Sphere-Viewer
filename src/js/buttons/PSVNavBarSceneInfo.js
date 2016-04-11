/**
 * Navigation bar scenes button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarSceneInfoButton(navbar) {
    PSVNavBarButton.call(this, navbar);

    this.prop = {
        panelOpened: false,
        panelOpening: false
    };
    this.create();
}

PSVNavBarSceneInfoButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarSceneInfoButton.prototype.constructor = PSVNavBarSceneInfoButton;

PSVNavBarSceneInfoButton.className = 'psv-button markers-button';

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarSceneInfoButton.prototype.create = function () {
    PSVNavBarButton.prototype.create.call(this);

    this.container.title = 'Sceny';
    this.container.innerHTML = '<i class="material-icons"  aria-hidden="true">info</i>';

    this.container.addEventListener('click', this.toggleScenes.bind(this));

    this.psv.on('open-panel', this);
    this.psv.on('close-panel', this);
};

/**
 * Destroys the button
 */
PSVNavBarSceneInfoButton.prototype.destroy = function () {
    this.psv.off('open-panel', this);
    this.psv.off('close-panel', this);

    PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarSceneInfoButton.prototype.handleEvent = function (e) {
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
PSVNavBarSceneInfoButton.prototype.toggleScenes = function () {
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
PSVNavBarSceneInfoButton.prototype.showScenes = function () {
	
	
    var html = '<div class="psv-markers-list">' +
      '<h1>' + 'Informacje' + '</h1>' ;   
	  
	var description = 'Brak';
	if(this.psv.config.description)
		description = this.psv.config.description;
	  
        html += '<p class="marker-name">' + description  + '</p>';	
		html += '</div>';

    this.prop.panelOpening = true;
    this.psv.panel.showPanel(html, true);

    this.psv.panel.container.querySelector('.psv-markers-list').addEventListener('click', this._onClickItem.bind(this));
};

/**
 * Close side panel
 * @return (void)
 */
PSVNavBarSceneInfoButton.prototype.hideScenes = function () {
    this.psv.panel.hidePanel();
};

/**
 * Click on an item
 * @param e (Event)
 * @return (void)
 */
PSVNavBarSceneInfoButton.prototype._onClickItem = function (e) {
    var li;
    if (e.target && (li = PSVUtils.getClosest(e.target, 'li')) && li.dataset.psvMarker) {
        this.psv.trigger('sceneTransition', li.dataset.psvMarker);
    }
};

/**
 * Update status when the panel is updated
 * @return (void)
 */
PSVNavBarSceneInfoButton.prototype._onPanelOpened = function () {
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
PSVNavBarSceneInfoButton.prototype._onPanelClosed = function () {
    this.prop.panelOpened = false;
    this.prop.panelOpening = false;

    this.toggleActive(this.prop.panelOpened);
};
