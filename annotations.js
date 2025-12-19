import { AnnotationsPlugin } from "https://cdn.jsdelivr.net/npm/@xeokit/xeokit-sdk@latest/dist/xeokit-sdk.min.es.js";

const CLI_ANNOTATION_ID = "CLI-1";
const CLI_ANNOTATION_POSITION = [-5.241, 10.305, 0.380];
const CLI_MARKER_VISIBILITY_DISTANCE = 10;
const CLI_ASSOCIATED_OBJECT_ID = "0VJuYCFvPDsAZYaEc4uDrZ";

const E1_ANNOTATION_ID = "E1";
const E1_ANNOTATION_POSITION = [17.351, -1.025, -20.397];
const E1_ASSOCIATED_OBJECT_ID = "0dHnBkUG4Hy9840DTjNSMz";

function setAnnotationMarkerShown(annotation, shown) {
    if (typeof annotation.setMarkerShown === "function") {
        annotation.setMarkerShown(shown);
    } else {
        annotation.markerShown = shown;
    }
}

function getAnnotationMarkerShown(annotation) {
    if (typeof annotation.getMarkerShown === "function") {
        return annotation.getMarkerShown();
    }

    return Boolean(annotation.markerShown);
}

function setAnnotationLabelShown(annotation, shown) {
    if (typeof annotation.setLabelShown === "function") {
        annotation.setLabelShown(shown);
    } else {
        annotation.labelShown = shown;
    }
}

function getAnnotationLabelShown(annotation) {
    if (typeof annotation.getLabelShown === "function") {
        return annotation.getLabelShown();
    }

    return Boolean(annotation.labelShown);
}

function setupAnnotationVisibilityControl(annotation, viewer, requestRenderFrame, targetPosition, visibilityDistance = CLI_MARKER_VISIBILITY_DISTANCE) {
    const updateVisibility = () => {
        const eye = viewer.camera?.eye;
        const target = annotation.worldPos || targetPosition;

        if (!eye || !target) {
            return;
        }

        const dx = eye[0] - target[0];
        const dy = eye[1] - target[1];
        const dz = eye[2] - target[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const shouldShowMarker = distance <= visibilityDistance;
        const isMarkerShown = getAnnotationMarkerShown(annotation);
        const isLabelShown = getAnnotationLabelShown(annotation);

        if (isMarkerShown !== shouldShowMarker) {
            setAnnotationMarkerShown(annotation, shouldShowMarker);
            requestRenderFrame();
        }

        if (!shouldShowMarker && isLabelShown) {
            setAnnotationLabelShown(annotation, false);
            requestRenderFrame();
        }
    };

    if (viewer.camera?.on) {
        viewer.camera.on("matrix", updateVisibility);
    }

    updateVisibility();
}

function setupAnnotationLabelToggle(annotation, annotationsPlugin, requestRenderFrame) {
    const showCliLabel = (annotationEvent) => {
        if (annotationEvent?.id === annotation.id || annotationEvent?.annotation?.id === annotation.id) {
            setAnnotationLabelShown(annotation, true);
            requestRenderFrame();
        }
    };

    const hideCliLabel = (annotationEvent) => {
        if (annotationEvent?.id === annotation.id || annotationEvent?.annotation?.id === annotation.id) {
            setAnnotationLabelShown(annotation, false);
            requestRenderFrame();
        }
    };

    if (typeof annotationsPlugin.on === "function") {
        annotationsPlugin.on("markerMouseEnter", showCliLabel);
        annotationsPlugin.on("markerMouseLeave", hideCliLabel);
    }
}

function setupAnnotationClickFocus(annotation, annotationsPlugin, focusObjectById, associatedObjectId) {
    const focusCliObject = (annotationEvent) => {
        if (annotationEvent?.id === annotation.id || annotationEvent?.annotation?.id === annotation.id) {
            setAnnotationLabelShown(annotation, true);
            if (associatedObjectId) {
                focusObjectById(associatedObjectId, { animate: true, xrayOthers: false });
            }
        }
    };

    if (typeof annotationsPlugin.on === "function") {
        annotationsPlugin.on("markerClicked", focusCliObject);
        annotationsPlugin.on("labelClicked", focusCliObject);
    }
}

function setupAnnotationInteractions(annotationsPlugin, annotation, { viewer, requestRenderFrame, targetPosition, visibilityDistance = CLI_MARKER_VISIBILITY_DISTANCE, associatedObjectId, focusObjectById }) {
    setupAnnotationVisibilityControl(annotation, viewer, requestRenderFrame, targetPosition, visibilityDistance);
    setupAnnotationLabelToggle(annotation, annotationsPlugin, requestRenderFrame);
    setupAnnotationClickFocus(annotation, annotationsPlugin, focusObjectById, associatedObjectId);
}

function createFixedAnnotations(annotationsPlugin) {
    const cliAnnotation = annotationsPlugin.createAnnotation({
        id: CLI_ANNOTATION_ID,
        worldPos: CLI_ANNOTATION_POSITION,
        occludable: false,
        markerShown: true,
        labelShown: true,
        values: {
            glyph: "C1",
            title: "C1",
            description: "O tubo está colidindo com o elétrico",
            markerBGColor: "#e53935"
        }
    });

    const e1Annotation = annotationsPlugin.createAnnotation({
        id: E1_ANNOTATION_ID,
        worldPos: E1_ANNOTATION_POSITION,
        occludable: false,
        markerShown: true,
        labelShown: true,
        values: {
            glyph: "E1",
            title: "E1",
            description: "O Bloco do pilar 5 está batendo com o muro de contenção.",
            markerBGColor: "#9e9e9e"
        }
    });

    return { cliAnnotation, e1Annotation };
}

export function setupAnnotations(viewer, { requestRenderFrame, focusObjectById }) {
    const annotationsPlugin = new AnnotationsPlugin(viewer, {
        markerHTML: "<div class='annotation-marker' style='background-color: {{markerBGColor}}'>{{glyph}}</div>",
        labelHTML: "<div class='annotation-label'><div class='annotation-title'>{{title}}</div><div class='annotation-desc'>{{description}}</div></div>",
        values: {
            markerBGColor: "#0057ff",
            glyph: "●",
            title: "Anotação",
            description: "Sem descrição",
        }
    });

    const { cliAnnotation, e1Annotation } = createFixedAnnotations(annotationsPlugin);

    setAnnotationMarkerShown(cliAnnotation, false);
    setAnnotationLabelShown(cliAnnotation, false);
    setAnnotationMarkerShown(e1Annotation, false);
    setAnnotationLabelShown(e1Annotation, false);

    setupAnnotationInteractions(annotationsPlugin, cliAnnotation, {
        viewer,
        requestRenderFrame,
        targetPosition: CLI_ANNOTATION_POSITION,
        visibilityDistance: CLI_MARKER_VISIBILITY_DISTANCE,
        associatedObjectId: CLI_ASSOCIATED_OBJECT_ID,
        focusObjectById
    });

    setupAnnotationInteractions(annotationsPlugin, e1Annotation, {
        viewer,
        requestRenderFrame,
        targetPosition: E1_ANNOTATION_POSITION,
        visibilityDistance: CLI_MARKER_VISIBILITY_DISTANCE,
        associatedObjectId: E1_ASSOCIATED_OBJECT_ID,
        focusObjectById
    });

    return { annotationsPlugin, annotations: { cliAnnotation, e1Annotation } };
}
