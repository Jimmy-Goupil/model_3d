function initMeasureTools(viewer) {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    let activeMode = null;
    let positions = [];
    let activeEntities = [];
    let measureEntities = [];
    let floatingLabel = null;

    // Création des boutons si absents
    if (!document.getElementById('btn-distance')) {
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;top:10px;left:10px;z-index:1000;';
        container.innerHTML = `
            <button id="btn-distance" style="display:block;margin:5px;padding:8px 15px;cursor:pointer;">📏 Distance</button>
            <button id="btn-surface" style="display:block;margin:5px;padding:8px 15px;cursor:pointer;">📐 Surface</button>
            <button id="btn-clear" style="display:block;margin:5px;padding:8px 15px;cursor:pointer;">🗑️ Effacer</button>
        `;
        document.body.appendChild(container);
    }

    function createLabel(text) {
        return viewer.entities.add({
            position: positions[positions.length - 1],
            label: {
                text: text,
                font: '14px sans-serif',
                fillColor: Cesium.Color.WHITE,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -10),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });
    }

    function pickPositionFromScreen(screenPos) {
        // 1. Essai sur le tileset (nécessite depthTestAgainstTerrain = true)
        let cartesian = viewer.scene.pickPosition(screenPos);
        // 2. Fallback : ellipsoïde
        if (!Cesium.defined(cartesian)) {
            const ray = viewer.camera.getPickRay(screenPos);
            cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        }
        return cartesian;
    }

    handler.setInputAction(function (event) {
        if (!activeMode) return;
        const cartesian = pickPositionFromScreen(event.position);
        console.log('CLIC - position trouvée :', cartesian); // DEBUG

        if (Cesium.defined(cartesian)) {
            positions.push(cartesian);

            // Point visible
            activeEntities.push(viewer.entities.add({
                position: cartesian,
                point: {
                    pixelSize: 8,
                    color: Cesium.Color.YELLOW,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            }));

            // Ligne entre les points (mode distance)
            if (positions.length > 1) {
                activeEntities.push(viewer.entities.add({
                    polyline: {
                        positions: positions.slice(),
                        width: 3,
                        material: Cesium.Color.YELLOW,
                        clampToGround: false
                    }
                }));
            }
        } else {
            console.warn('CLIC - aucune position trouvée !');
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(function (event) {
        if (!activeMode || positions.length < 2) return;

        if (activeMode === 'distance') {
            let total = 0;
            for (let i = 0; i < positions.length - 1; i++) {
                total += Cesium.Cartesian3.distance(positions[i], positions[i + 1]);
            }
            measureEntities.push(createLabel(total.toFixed(2) + ' m'));
            console.log('DISTANCE =', total.toFixed(2), 'm');
        }

        if (activeMode === 'surface' && positions.length >= 3) {
            // Surface projetée (plan local)
            const area = computeArea(positions);
            measureEntities.push(createLabel(area.toFixed(2) + ' m²'));
            activeEntities.push(viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy(positions),
                    material: Cesium.Color.YELLOW.withAlpha(0.4)
                }
            }));
            console.log('SURFACE =', area.toFixed(2), 'm²');
        }

        // On archive les entités de la mesure et on reset
        measureEntities = measureEntities.concat(activeEntities);
        activeEntities = [];
        positions = [];
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    function computeArea(pos) {
        // Triangulation simple en éventail depuis le 1er point
        let area = 0;
        for (let i = 1; i < pos.length - 1; i++) {
            const v1 = Cesium.Cartesian3.subtract(pos[i], pos[0], new Cesium.Cartesian3());
            const v2 = Cesium.Cartesian3.subtract(pos[i + 1], pos[0], new Cesium.Cartesian3());
            const cross = Cesium.Cartesian3.cross(v1, v2, new Cesium.Cartesian3());
            area += Cesium.Cartesian3.magnitude(cross) / 2;
        }
        return area;
    }

    // --- Boutons ---
    document.getElementById('btn-distance').addEventListener('click', function () {
        activeMode = 'distance';
        positions = [];
        console.log('Mode DISTANCE activé');
    });

    document.getElementById('btn-surface').addEventListener('click', function () {
        activeMode = 'surface';
        positions = [];
        console.log('Mode SURFACE activé');
    });

    document.getElementById('btn-clear').addEventListener('click', function () {
        activeMode = null;
        positions = [];
        activeEntities.forEach(e => viewer.entities.remove(e));
        measureEntities.forEach(e => viewer.entities.remove(e));
        activeEntities = [];
        measureEntities = [];
        console.log('Mesures effacées');
    });
}