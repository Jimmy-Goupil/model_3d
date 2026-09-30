// ============================================
// OUTILS DE MESURE
// ============================================

let measureMode = null; // 'distance', 'surface' ou null
let measurePoints = [];
let measureEntities = [];
let handler = null;

// Points flottants dynamiques (ligne qui suit la souris)
let floatingPoint = null;

function initMeasureTools(viewer) {

    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // --- CLIC GAUCHE : ajouter un point ---
    handler.setInputAction(function (click) {
        if (!measureMode) return;
        const position = pickPosition(click.position);
        if (!position) return;

        measurePoints.push(position);
        addPointEntity(position);

        // Distance : 2 points max
        if (measureMode === 'distance' && measurePoints.length === 2) {
            finishDistance();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // --- DOUBLE CLIC : terminer une surface ---
    handler.setInputAction(function () {
        if (measureMode === 'surface' && measurePoints.length >= 3) {
            finishSurface();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // --- CLIC DROIT : annuler la mesure en cours ---
    handler.setInputAction(function () {
        cancelCurrentMeasure();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
}

function pickPosition(screenPosition) {
    // Priorité au picking précis sur le tileset 3D
    const picked = viewer.scene.pickPosition(screenPosition);
    if (Cesium.defined(picked)) return picked;
    // Sinon sur l'ellipsoïde
    const ray = viewer.camera.getPickRay(screenPosition);
    return viewer.scene.globe.pick(ray, viewer.scene);
}

function addPointEntity(position) {
    const entity = viewer.entities.add({
        position: position,
        point: {
            pixelSize: 8,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    measureEntities.push(entity);
    return entity;
}

// ============ DISTANCE ============

function startDistance() {
    cancelCurrentMeasure();
    measureMode = 'distance';
    viewer.canvas.style.cursor = 'crosshair';
    showMessage('📏 Cliquez sur 2 points (clic droit pour annuler)');
}

function finishDistance() {
    const p1 = Cesium.Cartographic.fromCartesian(measurePoints[0]);
    const p2 = Cesium.Cartographic.fromCartesian(measurePoints[1]);

    // Distance directe (3D)
    const direct = Cesium.Cartesian3.distance(measurePoints[0], measurePoints[1]);

    // Distance horizontale (géodésique)
    const geo = new Cesium.EllipsoidGeodesic(p1, p2);
    const horizontal = geo.surfaceDistance;

    // Distance verticale
    const vertical = Math.abs(p2.height - p1.height);

    // Ligne entre les 2 points
    const line = viewer.entities.add({
        polyline: {
            positions: measurePoints.slice(),
            width: 4,
            material: Cesium.Color.YELLOW,
            clampToGround: false,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    measureEntities.push(line);

    // Label au milieu
    const mid = Cesium.Cartesian3.midpoint(measurePoints[0], measurePoints[1], new Cesium.Cartesian3());
    const label = viewer.entities.add({
        position: mid,
        label: {
            text:
                '📏 Directe : ' + formatDistance(direct) +
                '\n↔️ Horiz. : ' + formatDistance(horizontal) +
                '\n↕️ Vert. : ' + formatDistance(vertical),
            font: '13px sans-serif',
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -15),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    measureEntities.push(label);

    resetMeasureState();
    showMessage('');
}

// ============ SURFACE ============

function startSurface() {
    cancelCurrentMeasure();
    measureMode = 'surface';
    viewer.canvas.style.cursor = 'crosshair';
    showMessage('📐 Cliquez au moins 3 points, puis double-cliquez pour terminer');
}

function finishSurface() {
    // Polygone
    const polygon = viewer.entities.add({
        polygon: {
            hierarchy: new Cesium.PolygonHierarchy(measurePoints.slice()),
            material: Cesium.Color.CYAN.withAlpha(0.4),
            perPositionHeight: true
        },
        polyline: {
            positions: measurePoints.concat([measurePoints[0]]),
            width: 3,
            material: Cesium.Color.CYAN,
            clampToGround: false,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    measureEntities.push(polygon);

    // Calcul de la surface (triangulation simple depuis le 1er point)
    let area = 0;
    const pts = measurePoints;
    for (let i = 1; i < pts.length - 1; i++) {
        const a = Cesium.Cartesian3.distance(pts[0], pts[i]);
        const b = Cesium.Cartesian3.distance(pts[i], pts[i + 1]);
        const c = Cesium.Cartesian3.distance(pts[i + 1], pts[0]);
        const s = (a + b + c) / 2; // formule de Héron
        area += Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
    }

    // Label au centre
    let center = new Cesium.Cartesian3();
    measurePoints.forEach(p => Cesium.Cartesian3.add(center, p, center));
    center = Cesium.Cartesian3.divideByScalar(center, measurePoints.length, new Cesium.Cartesian3());

    const label = viewer.entities.add({
        position: center,
        label: {
            text: '📐 Surface : ' + formatArea(area),
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    measureEntities.push(label);

    resetMeasureState();
    showMessage('');
}

// ============ UTILITAIRES ============

function clearAllMeasures() {
    measureEntities.forEach(e => viewer.entities.remove(e));
    measureEntities = [];
    resetMeasureState();
    showMessage('');
}

function cancelCurrentMeasure() {
    // Supprime les points de la mesure en cours (sans label)
    measurePoints.forEach(() => {
        const e = measureEntities.pop();
        if (e) viewer.entities.remove(e);
    });
    resetMeasureState();
    showMessage('');
}

function resetMeasureState() {
    measureMode = null;
    measurePoints = [];
    viewer.canvas.style.cursor = 'default';
}

function formatDistance(m) {
    if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
    return m.toFixed(2) + ' m';
}

function formatArea(m2) {
    if (m2 >= 10000) return (m2 / 10000).toFixed(2) + ' ha';
    return m2.toFixed(1) + ' m²';
}

function showMessage(text) {
    const el = document.getElementById('measure-message');
    if (el) {
        el.textContent = text;
        el.style.display = text ? 'block' : 'none';
    }
}