L.DistortableCollection = L.FeatureGroup.extend({
  options: {
  },

  initialize: function(options) {

    this.actions = options.actions;

    L.setOptions(this, options);

    L.FeatureGroup.prototype.initialize.call(this, options);

  },

  onAdd: function(map) {
    L.FeatureGroup.prototype.onAdd.call(this, map);

    this._map = map;

    this.on("layeradd", function (e) {
      this._turnOnEditing(e.layer);
    }, this);

    this.on("layerremove", function (e) {
      this._turnOffEditing(e.layer);
    }, this);

    L.DomEvent.on(document, "keydown", this._onKeyDown, this);
    L.DomEvent.on(map, "click", this._deselectAll, this);

    this._lastInitialSelected();

    /**
     * the box zoom override works, but there is a bug involving click event propogation.
     * keeping uncommented for now so that it isn't used as a multi-select mechanism
     */
    // L.DomEvent.on(map, "boxzoomend", this._addSelections, this);
  },

  onRemove: function() {
    var map = this._map;

    this.off("layeradd", function (e) {
      this._turnOnEditing(e.layer);
    }, this);

    this.off("layerremove", function (e) {
      this._turnOffEditing(e.layer);
    }, this);

    L.DomEvent.off(document, "keydown", this._onKeyDown, this);
    L.DomEvent.off(map, "click", this._deselectAll, this);
    // L.DomEvent.off(map, "boxzoomend", this._addSelections, this);
  },

  _turnOnEditing: function(layer) {
    layer.editing.enable();

    L.DomEvent.on(layer._image, "mousedown", this._deselectOthers, this);
    L.DomEvent.on(layer, "dragstart", this._dragStartMultiple, this);
    L.DomEvent.on(layer, "drag", this._dragMultiple, this);
  },

  _turnOffEditing: function(layer) {
    layer.editing.disable();

    L.DomEvent.off(layer._image, "mousedown", this._deselectOthers, this);
    L.DomEvent.off(layer, "dragstart", this._dragStartMultiple, this);
    L.DomEvent.off(layer, "drag", this._dragMultiple, this);
  },

  _addToolbar: function() {
    try {
      if (!this.toolbar) {
        this.toolbar = new L.DistortableImage.EditToolbar2({
          actions: this.actions,
          position: "topleft"
        }).addTo(this._map, this);
        this.fire("toolbar:created");
      }
    } catch (e) { }
  },

  _removeToolbar: function() {
    var map = this._map;

    if (this.toolbar) {
      map.removeLayer(this.toolbar);
      this.toolbar = false;
    }
  },

  _lastInitialSelected: function() {
    var layerArr = this.getLayers();

    var initialSelected = layerArr.filter(function(layer) {
      return layer.options.selected;
    });
    
    if (initialSelected.length !== 0) {
      this.eachLayer(function(layer) {
        if (!initialSelected[-1]) {
          layer._deselect();
        }
      });
    }
  },

  isSelected: function (overlay) {
    return L.DomUtil.hasClass(overlay.getElement(), "selected");
  },

  anySelected: function() {
    var layerArr = this.getLayers();

    return layerArr.some(this.isSelected.bind(this));
  },

  _toggleMultiSelect: function(event, edit) {
    if (edit._mode === "lock") { return; }

    if (event.metaKey || event.ctrlKey) {
      L.DomUtil.toggleClass(event.target, "selected");
    }

    if (this.anySelected()) {
      edit._deselect();
    } else {
      this._removeToolbar();
    }
  },

  _deselectOthers: function(event) {
    this.eachLayer(function(layer) {

      var edit = layer.editing;
      if (layer.getElement() !== event.target) {
        edit._deselect();
      } else {
        this._toggleMultiSelect(event, edit);
      }
    }, this);

    L.DomEvent.stopPropagation(event);
  },

  _addSelections: function(e) {
    var box = e.boxZoomBounds,
      i = 0;

    this.eachLayer(function(layer) {
      var edit = layer.editing;

      if (edit.toolbar) { edit._hideToolbar(); }

      for (i = 0; i < 4; i++) {
        if (box.contains(layer.getCorner(i)) && edit._mode !== "lock") {
          L.DomUtil.addClass(layer.getElement(), "selected");
          break;
        }
      }
    });
  },

  _onKeyDown: function(e) {
    if (e.key === "Escape") {
      this._deselectAll(e);
    }
    if (e.key === "Backspace") {
      this._removeFromGroup(e);
    }
  },

  _dragStartMultiple: function(event) {
    var overlay = event.target,
      i;

    if (!this.isSelected(overlay)) { return; }

    this.eachLayer(function(layer) {
      var edit = layer.editing;
      edit._deselect();

      for (i = 0; i < 4; i++) {
        layer._dragStartPoints[i] = layer._map.latLngToLayerPoint(
          layer.getCorner(i)
        );
      }
    });
  },

  _dragMultiple: function(event) {
    var overlay = event.target,
      map = this._map,
      i;

    if (!this.isSelected(overlay)) { return; }

    overlay._dragPoints = {};

    for (i = 0; i < 4; i++) {
      overlay._dragPoints[i] = map.latLngToLayerPoint(overlay.getCorner(i));
    }

    var cpd = overlay._calcCornerPointDelta();

    this._updateCollectionFromPoints(cpd, overlay);
  },

  _deselectAll: function(event) {
    this.eachLayer(function(layer) {
      var edit = layer.editing;
      L.DomUtil.removeClass(layer.getElement(), "selected");
      edit._deselect();
    });

    this._removeToolbar();

    L.DomEvent.stopPropagation(event);
  },

  _removeFromGroup: function(event) {
    var layersToRemove = this._toRemove();

    if (layersToRemove.length === 0) { return; }
    var choice = layersToRemove[0].editing.confirmDelete();

    if (choice) {
      layersToRemove.forEach(function(layer) {
        this.removeLayer(layer);
      }, this);

      this._removeToolbar();
    }

    if (event) { L.DomEvent.stopPropagation(event); }
  },

  _toRemove: function() {
    var layerArr = this.getLayers();

    return layerArr.filter(function(layer) {
      var edit = layer.editing;
      return (this.isSelected(layer) && edit._mode !== "lock");
    }, this);
  },

  /**
   * images in 'lock' mode are included in this feature group collection for functionalities
   * such as export, but are filtered out for editing / dragging here
   */
  _calcCollectionFromPoints: function(cpd, overlay) {
    var layersToMove = [],
      p = new L.Transformation(1, -cpd.x, 1, -cpd.y);

    this.eachLayer(function(layer) {
      if (
        layer !== overlay &&
        layer.editing._mode !== "lock" &&
        this.isSelected(layer)
      ) {
        layer._cpd = {};

        layer._cpd.val0 = p.transform(layer._dragStartPoints[0]);
        layer._cpd.val1 = p.transform(layer._dragStartPoints[1]);
        layer._cpd.val2 = p.transform(layer._dragStartPoints[2]);
        layer._cpd.val3 = p.transform(layer._dragStartPoints[3]);

        layersToMove.push(layer);
      }
    }, this);

    return layersToMove;
  },

  /**
   * cpd === cornerPointDelta
   */
  _updateCollectionFromPoints: function(cpd, overlay) {
    var layersToMove = this._calcCollectionFromPoints(cpd, overlay);

    layersToMove.forEach(function(layer) {
      layer._updateCornersFromPoints(layer._cpd);
      layer.fire("update");
    }, this);
  },

  _getAvgCmPerPixel: function(imgs) {
    var reduce = imgs.reduce(function(sum, img) {
      return sum + img.cm_per_pixel;
    }, 0);
    return reduce / imgs.length;
  },

  generateExportJson: function() {
    var json = {};
    json.images = [];

    this.eachLayer(function(layer) {
      if (this.isSelected(layer)) {
        json.images.push({
          id: this.getLayerId(layer),
          src: layer._image.src,
          nodes: layer.getCorners(),
          cm_per_pixel: L.ImageUtil.getCmPerPixel(layer)
        });
      }
    }, this);

    json.avg_cm_per_pixel = this._getAvgCmPerPixel(json.images);

    return json;
  },

  startExport: function(opts) {
    opts = opts || {};
    opts.collection = opts.collection || this.generateExportJson();
    opts.frequency = opts.frequency || 3000;
    opts.scale = opts.scale || 30;
    var statusUrl, updateInterval;

      // this may be overridden to update the UI to show export progress or completion
    function _defaultUpdater(data) {
      if (data.status === "complete") { clearInterval(updateInterval); }
      // TODO: update to clearInterval when status == "failed" if we update that in this file:
      // https://github.com/publiclab/mapknitter-exporter/blob/main/lib/mapknitterExporter.rb
      console.log(data);
    }

    // this may be overridden to update the UI to show export progress or completion
    function _defaultHandleStatusUrl(data) {
      console.log(data);
      statusUrl = "http://export.mapknitter.org" + data;
      opts.updater = opts.updater || _defaultUpdater;

      $.ajax(statusUrl, {
        type: "GET",
        crossDomain: true
      }).done(function(data) {
          updateInterval = setInterval(function intervalUpdater() {
            opts.updater(data);
          }, opts.frequency);
      });
    }

    function _fetchStatusUrl(collection, scale) {
      opts.handleStatusUrl = opts.handleStatusUrl || _defaultHandleStatusUrl;

      $.ajax({
        url: "http://export.mapknitter.org/export",
        crossDomain: true,
        type: "POST",
        data: {
          collection: JSON.stringify(collection.images),
          scale: scale
        },
        success: opts.handleStatusUrl // this handles the initial response
      });
    }

    _fetchStatusUrl(opts.collection, opts.scale);

  }
});

L.distortableCollection = function(id, options) {
  return new L.DistortableCollection(id, options);
};
