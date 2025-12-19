// app.js

import {
    Viewer,
    LocaleService,
    XKTLoaderPlugin,
    AngleMeasurementsPlugin,
    AngleMeasurementsMouseControl,
    DistanceMeasurementsPlugin,
    DistanceMeasurementsMouseControl,
    ContextMenu,
    PointerLens,
    NavCubePlugin,
    TreeViewPlugin,
    SectionPlanesPlugin,
    LineSet,
    buildGridGeometry,
    AnnotationsPlugin
} from "https://cdn.jsdelivr.net/npm/@xeokit/xeokit-sdk@latest/dist/xeokit-sdk.min.es.js";

const { jsPDF } = window.jspdf;

let treeView;
let modelIsolateController;
let sectionPlanesPlugin;
let horizontalSectionPlane;
let sectionPlaneEnabled = false;
let horizontalPlaneControl;
let lastPickedEntity = null; // NOVO: Variável para rastrear a entidade selecionada
let lastSelectedEntity = null; // NOVO: Guarda a entidade selecionada pelo duplo clique
let lastCollisionResults = [];
let lastCollisionModelId = null;

// -----------------------------------------------------------------------------
// 1. Configuração do Viewer e Redimensionamento (100% da tela)
// -----------------------------------------------------------------------------

const viewer = new Viewer({

    canvasId: "meuCanvas",
    transparent: false, 
    saoEnabled: true,
    edgesEnabled: true,
    backgroundColor: [0.8, 0.8, 0.8],
    
    // CONFIGURAÇÃO DE LOCALIZAÇÃO (NavCube em Português)
    localeService: new LocaleService({
        messages: {
            "pt": { // Português
                "NavCube": {
                    "front": "Frente",
                    "back": "Trás",
                    "top": "Topo",
                    "bottom": "Baixo",
                    "left": "Esquerda",
                    "right": "Direita"
                }
            }
        },
        locale: "pt" // Define o idioma padrão como Português
    })
});

// Ajusta a cor do destaque (highlight) para azul
const { highlightMaterial } = viewer.scene;
highlightMaterial.color = [0, 0, 0];
highlightMaterial.edgeColor = [0, 0, 0];

function createGroundGrid() {
    const gridGeometry = buildGridGeometry({
        size: 100,
        divisions: 100
    });

    new LineSet(viewer.scene, {
        id: "groundGrid",
        positions: gridGeometry.positions,
        indices: gridGeometry.indices,
        color: [0.6, 0.6, 0.6],
        opacity: 0.35,
        clippable: false,
        collidable: false
    });
}

createGroundGrid();

// -----------------------------------------------------------------------------
// 1.1 Anotações fixas
// -----------------------------------------------------------------------------

const annotationsPlugin = new AnnotationsPlugin(viewer, {
    markerHTML: "<div class='annotation-marker' style='background-color: {{markerBGColor}}'>{{glyph}}</div>",
    labelHTML: "<div class='annotation-label'><div class='annotation-title'>{{title}}</div><div class='annotation-desc'>{{description}}</div></div>",
    values: {
        markerBGColor: "#0057ff",
        glyph: "●",
        title: "Anotação",
        description: "Sem descrição"
    }
});

const CLI_ANNOTATION_ID = "CLI-1";
const CLI_ANNOTATION_POSITION = [-5.241, 10.305, 0.380];
const CLI_MARKER_VISIBILITY_DISTANCE = 5;
const CLI_ASSOCIATED_OBJECT_ID = "0VJuYCFvPDsAZYaEc4uDrZ";

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

setAnnotationMarkerShown(cliAnnotation, false);
setAnnotationLabelShown(cliAnnotation, false);

function setupCliAnnotationVisibilityControl(annotation) {
    const updateVisibility = () => {
        const eye = viewer.camera?.eye;
        const target = annotation.worldPos || CLI_ANNOTATION_POSITION;

        if (!eye || !target) {
            return;
        }

        const dx = eye[0] - target[0];
        const dy = eye[1] - target[1];
        const dz = eye[2] - target[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const shouldShowMarker = distance <= CLI_MARKER_VISIBILITY_DISTANCE;
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

function setupCliAnnotationLabelToggle(annotation) {
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

function setupCliAnnotationClickFocus(annotation) {
    const focusCliObject = (annotationEvent) => {
        if (annotationEvent?.id === annotation.id || annotationEvent?.annotation?.id === annotation.id) {
            setAnnotationLabelShown(annotation, true);
            focusObjectById(CLI_ASSOCIATED_OBJECT_ID, { animate: true, xrayOthers: false });
        }
    };

    if (typeof annotationsPlugin.on === "function") {
        annotationsPlugin.on("markerClicked", focusCliObject);
        annotationsPlugin.on("labelClicked", focusCliObject);
    }
}

function setupCliAnnotationInteractions() {
    setupCliAnnotationVisibilityControl(cliAnnotation);
    setupCliAnnotationLabelToggle(cliAnnotation);
    setupCliAnnotationClickFocus(cliAnnotation);
}
/**
 * Configura o painel de ajuda e atalhos de teclado.
 */
function setupHelpPanel() {
    if (!helpPanel || !helpPanelToggleButton || !closeHelpPanelButton) {
        return;
    }

    const togglePanel = (forceState) => {
        const shouldOpen = typeof forceState === "boolean" ? forceState : helpPanel.hidden;
        helpPanel.hidden = !shouldOpen;
        helpPanelToggleButton.classList.toggle("active", shouldOpen);
        helpPanelToggleButton.setAttribute("aria-pressed", shouldOpen ? "true" : "false");
    };

    helpPanelToggleButton.addEventListener("click", () => togglePanel());
    closeHelpPanelButton.addEventListener("click", () => togglePanel(false));

    document.addEventListener("click", (event) => {
        const isClickInsidePanel = helpPanel.contains(event.target);
        const isToggle = helpPanelToggleButton.contains(event.target);
        if (!helpPanel.hidden && !isClickInsidePanel && !isToggle) {
            togglePanel(false);
        }
    });
}
function setupTransformPanelControls() {
    if (!transformPanel || !transformPanelToggleButton || !closeTransformPanelButton) {
        return;
    }

    const togglePanel = (forceState) => {
        const shouldOpen = typeof forceState === "boolean" ? forceState : transformPanel.hidden;
        transformPanel.hidden = !shouldOpen;
        transformPanelToggleButton.classList.toggle("active", shouldOpen);
        transformPanelToggleButton.setAttribute("aria-pressed", shouldOpen ? "true" : "false");

        if (shouldOpen && transformModelSelect) {
            const currentModelId = transformModelSelect.value || transformModelSelect.options[0]?.value;
            if (currentModelId) {
                syncTransformInputs(currentModelId);
            }
        }
    };

    transformPanelToggleButton.addEventListener("click", () => togglePanel());
    closeTransformPanelButton.addEventListener("click", () => togglePanel(false));

    document.addEventListener("click", (event) => {
        const isClickInsidePanel = transformPanel.contains(event.target);
        const isToggle = transformPanelToggleButton.contains(event.target);
        if (!transformPanel.hidden && !isClickInsidePanel && !isToggle) {
            togglePanel(false);
        }
    });

    togglePanel(false);
}


function onWindowResize() {
    const canvas = viewer.scene.canvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', onWindowResize);
onWindowResize();

// -----------------------------------------------------------------------------
// 2. Carregamento dos Modelos e Ajuste da Câmera
// -----------------------------------------------------------------------------

const xktLoader = new XKTLoaderPlugin(viewer);
let modelsLoadedCount = 0;
let expectedModels = 0;
let defaultModelChecksDone = 0;
const loadedModels = new Map();
const originalTransforms = new Map();
const DEFAULT_MODEL_TRANSFORMS = {
    //IFC_ILUX: { position: [-14.08, 0, 0] },
    IFC_EST: { position: [-8.789, 0.4, 22.48] },
    IFC_SPDA: { position: [0.1, 0, 13.8], rotation: [0, 90, 0] },
    IFC_LOG_TEF: { position: [0.16, 0, -0.19], rotation: [0, 90, 0] },
    IFC_ELE: { position: [0.16, 0, -0.19] },
    //IFC_ECX: { position: [-14.08, 0, 0] },
    IFC_SAN: { position: [0.2, 0, 13.9], rotation: [0, 90, 0] },
    IFC_INC: { position: [0.15, 0, -0.15], rotation: [0, 90, 0] },
    IFC_HID: { position: [0.2, 0, 13.9], rotation: [0, 90, 0] },
    IFC_PLU: { position: [0.2, 0, 13.9], rotation: [0, 90, 0] },
    IFC_FOT: { position: [0, 0, 14], rotation: [0, 90, 0] },
    //IFC_ARQ: { position: [0.16, 0, 13.9], rotation: [0, 90, 0]  },
    //IFC_EST_SUB: { position: [-41.57, 0.4, 15.5], rotation: [0, 90, 0]  },
    //IFC_CLI_DUT: { position: [13, 0, 0], rotation: [0, 90, 0]  },
    //IFC_EXA: { position: [13.03, 0, -14.05] },
    IFC_CLI: { position: [0.16, 0, 13.9], rotation: [0, 90, 0]  },
    //IFC_EST_CT: { position: [-54, 0, -5.3] },
    IFC_ALI: { position: [0.15, 0, -0.17] },
    IFC_EST_SQD: { position: [18.1, 0, -13.92] },
    IFC_EST_SUB: { position: [27.66, 0, -22.35], rotation: [0, -84, 0] },
    IFC_EST_CT: { position: [-14.4, 0, -16.27], rotation: [0, 90, 0]  },
    IFC_EST_MR: { position: [35.25, 0.4, 20.2], rotation: [0, 90, 0]  },
    IFC_EST_MRC: { position: [-22.95, -0.65, 28.88] },
    IFC_EMT_ESC: { position: [0.14, 0.35, -0.15], rotation: [0, 90, 0]  },
    IFC_EMT_COB: { position: [0.14, 0, -0.15], rotation: [0, 90, 0]  },
};

const helpPanel = document.getElementById("helpPanel");
const helpPanelToggleButton = document.getElementById("btnHelp");
const closeHelpPanelButton = document.getElementById("closeHelpPanel");
const treeViewContainer = document.getElementById("treeViewContainer");
const transformPanel = document.getElementById("transformPanel");
const transformPanelToggleButton = document.getElementById("btnTransformPanel");
const closeTransformPanelButton = document.getElementById("closeTransformPanel");
const transformModelSelect = document.getElementById("transformModelSelect");
const offsetXInput = document.getElementById("offsetX");
const offsetYInput = document.getElementById("offsetY");
const offsetZInput = document.getElementById("offsetZ");
const rotationYInput = document.getElementById("rotationY");
const applyTransformButton = document.getElementById("applyTransformButton");
const resetTransformButton = document.getElementById("resetTransformButton");
const collisionPanel = document.getElementById("collisionPanel");
const collisionPanelToggleButton = document.getElementById("btnCollisionPanel");
const closeCollisionPanelButton = document.getElementById("closeCollisionPanel");
const collisionModelASelect = document.getElementById("collisionModelA");
const runCollisionCheckButton = document.getElementById("runCollisionCheck");
const downloadCollisionPdfButton = document.getElementById("downloadCollisionPdf");
const collisionSummary = document.getElementById("collisionSummary");
const collisionResultsList = document.getElementById("collisionResults");
const searchBar = document.getElementById("searchBar");
const searchInput = document.getElementById("searchIdInput");
const searchButton = document.getElementById("btnSearchId");
const searchToggleButton = document.getElementById("btnSearchToggle");
const searchFeedback = document.getElementById("searchFeedback");

setupHelpPanel();
setupTransformPanelControls();
setupCollisionPanelControls();
setupSearchControls();
setupCliAnnotationInteractions();
/**
 * Reseta a visibilidade de todos os objetos e remove qualquer destaque ou raio-x.
 */
function resetModelVisibility() {
    if (modelIsolateController) {
        // Volta a exibir todos os objetos
        modelIsolateController.setObjectsVisible(getAllObjectIds(), true);
        // Remove X-ray
        modelIsolateController.setObjectsXRayed(getAllObjectIds(), false);
        // Remove destaque
        modelIsolateController.setObjectsHighlighted(getAllObjectIds(), false);
        // Centraliza a câmera no modelo inteiro
        viewer.cameraFlight.jumpTo(viewer.scene);
    }
    lastPickedEntity = null; // Garante que a referência de seleção também seja limpa.
    clearSelection(false); // Limpa o estado visual do botão "Limpar Seleção"
}

function requestRenderFrame() {
    if (viewer.scene.requestRender) {
        viewer.scene.requestRender();
    } else if (viewer.scene.setDirty) {
        viewer.scene.setDirty();
    }
}

function parseNumber(value, fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getAllObjectIds() {
    if (!modelIsolateController) {
        return [];
    }

    if (typeof modelIsolateController.getObjectsIds === "function") {
        return modelIsolateController.getObjectsIds();
    }

    if (typeof modelIsolateController.getObjectIds === "function") {
        return modelIsolateController.getObjectIds();
    }

    if (Array.isArray(modelIsolateController.objectIds)) {
        return modelIsolateController.objectIds;
    }

    if (modelIsolateController.objects && typeof modelIsolateController.objects === "object") {
        return Object.keys(modelIsolateController.objects);
    }

    return [];
}

function ensureModelOption(modelId) {
    if (!transformModelSelect) {
        return;
    }

    const alreadyExists = Array.from(transformModelSelect.options).some((option) => option.value === modelId);
    if (!alreadyExists) {
        const option = document.createElement("option");
        option.value = modelId;
        option.textContent = modelId;
        transformModelSelect.appendChild(option);
    }
}

function syncTransformInputs(modelId) {
    if (!transformModelSelect) {
        return;
    }

    const model = loadedModels.get(modelId);
    if (!model) {
        return;
    }

    const position = model.position || [0, 0, 0];
    const rotation = model.rotation || [0, 0, 0];

    if (offsetXInput) offsetXInput.value = position[0];
    if (offsetYInput) offsetYInput.value = position[1];
    if (offsetZInput) offsetZInput.value = position[2];
    if (rotationYInput) rotationYInput.value = rotation[1];
}

function registerModelTransform(model) {
    loadedModels.set(model.id, model);

    if (!originalTransforms.has(model.id)) {
        originalTransforms.set(model.id, {
            position: model.position ? [...model.position] : [0, 0, 0],
            rotation: model.rotation ? [...model.rotation] : [0, 0, 0]
        });
    }

    ensureModelOption(model.id);
    ensureCollisionOptions(model.id);

    if (transformModelSelect && !transformModelSelect.value) {
        transformModelSelect.value = model.id;
    }

    setDefaultCollisionSelection();

    if (transformModelSelect) {
        syncTransformInputs(transformModelSelect.value);
    }
}
function applyTransformFromUI() {
    if (!transformModelSelect) {
        return;
    }

    const modelId = transformModelSelect.value;
    const model = loadedModels.get(modelId);

    if (!model) {
        alert("Nenhum modelo carregado para ajustar.");
        return;
    }

    const newPosition = [
        parseNumber(offsetXInput?.value),
        parseNumber(offsetYInput?.value),
        parseNumber(offsetZInput?.value)
    ];

    const newRotation = model.rotation ? [...model.rotation] : [0, 0, 0];
    newRotation[1] = parseNumber(rotationYInput?.value);

    model.position = newPosition;
    model.rotation = newRotation;

    requestRenderFrame();
}

function resetTransformFromUI() {
    if (!transformModelSelect) {
        return;
    }

    const modelId = transformModelSelect.value;
    const model = loadedModels.get(modelId);
    const original = originalTransforms.get(modelId);

    if (!model || !original) {
        return;
    }

    model.position = [...original.position];
    model.rotation = [...original.rotation];

    syncTransformInputs(modelId);
    requestRenderFrame();
}

function ensureCollisionOptions(modelId) {
    if (!collisionModelASelect) {
        return;
    }

    const exists = Array.from(collisionModelASelect.options).some((option) => option.value === modelId);
    if (!exists) {
        const option = document.createElement("option");
        option.value = modelId;
        option.textContent = modelId;
        collisionModelASelect.appendChild(option);
    }
}

function setDefaultCollisionSelection() {
    if (!collisionModelASelect) {
        return;
    }

    if (!collisionModelASelect.value && collisionModelASelect.options.length > 0) {
        collisionModelASelect.value = collisionModelASelect.options[0].value;
    }
}

function setupCollisionPanelControls() {
    if (!collisionPanel || !collisionSummary || !collisionResultsList) {
        return;
    }

    const togglePanel = (forceState) => {
        const shouldOpen = typeof forceState === "boolean" ? forceState : collisionPanel.hidden;
        collisionPanel.hidden = !shouldOpen;
        collisionPanelToggleButton?.classList.toggle("active", shouldOpen);
    };

    collisionPanelToggleButton?.addEventListener("click", () => togglePanel());
    closeCollisionPanelButton?.addEventListener("click", () => togglePanel(false));

    document.addEventListener("click", (event) => {
        if (!collisionPanel.hidden && !collisionPanel.contains(event.target) && !collisionPanelToggleButton?.contains(event.target)) {
            togglePanel(false);
        }
    });

    runCollisionCheckButton?.addEventListener("click", () => {
        const modelId = collisionModelASelect?.value;
        findAndRenderCollisions(modelId);
    });

    downloadCollisionPdfButton?.addEventListener("click", async () => {
        const originalLabel = downloadCollisionPdfButton.textContent;
        downloadCollisionPdfButton.disabled = true;
        downloadCollisionPdfButton.textContent = "Gerando relatório...";

        try {
            await downloadCollisionsAsPdf();
        } finally {
            downloadCollisionPdfButton.textContent = originalLabel;
            updateCollisionDownloadButton();
        }
    });

    updateCollisionDownloadButton();
}

function hidePanelElement(panelElement, toggleButton) {
    if (!panelElement) {
        return;
    }

    if (typeof panelElement.hidden === "boolean") {
        panelElement.hidden = true;
    }

    toggleButton?.classList.remove("active");
    toggleButton?.setAttribute("aria-pressed", "false");
}

function hideHelpPanel() {
    hidePanelElement(helpPanel, helpPanelToggleButton);
}

function hideTransformPanel() {
    hidePanelElement(transformPanel, transformPanelToggleButton);
}

function hideCollisionPanel() {
    hidePanelElement(collisionPanel, collisionPanelToggleButton);
}

function hideTreeViewPanel() {
    if (!treeViewContainer || treeViewContainer.style.display === "none") {
        return;
    }

    treeViewContainer.style.display = "none";
    resetModelVisibility();
}

function closePanelsOnEscape() {
    hideHelpPanel();
    hideTransformPanel();
    hideCollisionPanel();
    hideTreeViewPanel();
    closeSearchBar();
}

function setSearchStatus(message, isError = false) {
    if (!searchFeedback) {
        return;
    }

    searchFeedback.textContent = message;
    searchFeedback.dataset.state = isError ? "error" : "success";
}

function openSearchBar() {
    if (!searchBar) {
        return;
    }

    searchBar.hidden = false;

    if (searchToggleButton) {
        searchToggleButton.classList.add("active");
        searchToggleButton.setAttribute("aria-pressed", "true");
    }

    if (searchInput) {
        searchInput.focus();
        searchInput.select?.();
    }
}

function closeSearchBar() {
    if (!searchBar) {
        return;
    }

    searchBar.hidden = true;

    if (searchToggleButton) {
        searchToggleButton.classList.remove("active");
        searchToggleButton.setAttribute("aria-pressed", "false");
    }
}

function toggleSearchBar(forceOpen) {
    if (!searchBar) {
        return;
    }

    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : searchBar.hidden;

    if (shouldOpen) {
        openSearchBar();
        return;
    }

    closeSearchBar();
}

function focusObjectById(objectId, { animate = true, xrayOthers = true } = {}) {
    if (!modelIsolateController || !objectId) {
        return false;
    }

    const targetId = String(objectId).trim();
    const allIds = getAllObjectIds();

    if (!allIds.includes(targetId)) {
        return false;
    }

    modelIsolateController.setObjectsVisible(allIds, true);
    modelIsolateController.setObjectsHighlighted(allIds, false);

    if (xrayOthers && allIds.length) {
        modelIsolateController.setObjectsXRayed(allIds, true);
    } else {
        modelIsolateController.setObjectsXRayed(allIds, false);
    }

    modelIsolateController.setObjectsXRayed([targetId], false);
    modelIsolateController.setObjectsHighlighted([targetId], true);

    const entity = viewer.scene.objects?.[targetId];
    if (entity) {
        lastSelectedEntity = entity;
    }

    const aabb = viewer.scene.getAABB(targetId);
    if (aabb) {
        if (animate) {
            viewer.cameraFlight.flyTo({ aabb, duration: 0.6 });
        } else {
            viewer.cameraFlight.jumpTo({ aabb });
        }
    }

    requestRenderFrame();
    return true;
}

function setupSearchControls() {
    if (!searchInput || !searchButton) {
        return;
    }

    if (searchToggleButton && searchBar) {
        searchToggleButton.addEventListener("click", () => toggleSearchBar());
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && searchBar && !searchBar.hidden) {
            toggleSearchBar(false);
        }
    });

    const runSearch = () => {
        const rawId = searchInput.value.trim();

        if (!rawId) {
            setSearchStatus("Digite um ID de peça para buscar.", true);
            return;
        }

        if (!modelIsolateController || !getAllObjectIds().length) {
            setSearchStatus("Carregue um modelo antes de buscar uma peça.", true);
            return;
        }

        const found = focusObjectById(rawId);

        if (found) {
            setSearchStatus(`Peça ${rawId} isolada com destaque.`);
        } else {
            setSearchStatus(`Peça ${rawId} não encontrada nos modelos carregados.`, true);
        }
    };

    searchButton.addEventListener("click", runSearch);
    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            runSearch();
        }
    });
}

function finalizeInitialSetup() {
    setTimeout(() => {
        viewer.cameraFlight.jumpTo(viewer.scene);
        console.log("Todos os modelos carregados e câmera ajustada para o zoom correto.");
        setMeasurementMode('none');
        setupModelIsolateController();
    }, 300);
}

function maybeFinalizeInitialization() {
    if (defaultModelChecksDone === defaultModels.length && modelsLoadedCount >= expectedModels) {
        finalizeInitialSetup();
    }
}

function adjustCameraOnLoad() {
    modelsLoadedCount++;
    maybeFinalizeInitialization();
}

async function loadDefaultModel({ id, src }) {
    try {
        const response = await fetch(src, { method: "HEAD" });
        defaultModelChecksDone++;

        if (!response.ok) {
            console.warn(`⚠️ Modelo padrão ignorado: ${src} não está disponível (status ${response.status}).`);
            maybeFinalizeInitialization();
            return;
        }

        expectedModels++;

        const model = xktLoader.load({
            id,
            src,
            edges: true
        });

        model.on("loaded", () => {
            const transform = DEFAULT_MODEL_TRANSFORMS[id];

            if (transform?.position) {
                model.position = [...transform.position];
            }

            if (transform?.rotation) {
                model.rotation = [...transform.rotation];
            }

            //if (id === "IFC_ARQ") {
                //model.xrayed = true;
            //}

            adjustCameraOnLoad();
            registerModelTransform(model);
        });
        model.on("error", (err) => {
            console.error(`Erro ao carregar ${src}:`, err);
            adjustCameraOnLoad();
        });
    } catch (error) {
        defaultModelChecksDone++;
        console.warn(`⚠️ Não foi possível verificar o modelo ${src}:`, error);
        maybeFinalizeInitialization();
    }
}

const defaultModels = [
    { id: "IFC_LOG_TEF", src: "assets/modelo-02.xkt" },
    { id: "IFC_ELE", src: "assets/modelo-01.xkt" },
    { id: "IFC_SPDA", src: "assets/modelo-19.xkt" },
    //{ id: "IFC_ECX", src: "assets/modelo-04.xkt" },
    //{ id: "IFC_ILUX", src: "assets/modelo-05.xkt" },
    { id: "IFC_EST", src: "assets/modelo-05.xkt" },
    { id: "IFC_SAN", src: "assets/modelo-08.xkt" },
    { id: "IFC_INC", src: "assets/modelo-09.xkt" },
    { id: "IFC_HID", src: "assets/modelo-03.xkt" },
    { id: "IFC_PLU", src: "assets/modelo-07.xkt" },
    //{ id: "IFC_GLP", src: "assets/modelo-11.xkt" },
    //{ id: "IFC_ARQ", src: "assets/modelo-06.xkt" },
    //{ id: "IFC_CLI_DUT", src: "assets/modelo-14.xkt" },
    //{ id: "IFC_EXA", src: "assets/modelo-15.xkt" },
    { id: "IFC_CLI", src: "assets/modelo-18.xkt" },
    { id: "IFC_ALI", src: "assets/modelo-04.xkt" },
    { id: "IFC_EST_SQD", src: "assets/modelo-10.xkt" },
    { id: "IFC_EST_SUB", src: "assets/modelo-11.xkt" },
    { id: "IFC_EST_CT", src: "assets/modelo-12.xkt" },
    { id: "IFC_EST_MR", src: "assets/modelo-13.xkt" },
    { id: "IFC_EST_MRC", src: "assets/modelo-14.xkt" },
    { id: "IFC_FOT", src: "assets/modelo-15.xkt" },
    { id: "IFC_EMT_ESC", src: "assets/modelo-16.xkt" },
    { id: "IFC_EMT_COB", src: "assets/modelo-17.xkt" },
];
defaultModels.forEach(loadDefaultModel);

if (transformModelSelect) {
    transformModelSelect.addEventListener("change", (event) => syncTransformInputs(event.target.value));
}

if (applyTransformButton) {
    applyTransformButton.addEventListener("click", applyTransformFromUI);
}

if (resetTransformButton) {
    resetTransformButton.addEventListener("click", resetTransformFromUI);
}

// -----------------------------------------------------------------------------
// 3. Plugins de Medição e Função de Troca (MANTIDO)
// -----------------------------------------------------------------------------

const angleMeasurementsPlugin = new AngleMeasurementsPlugin(viewer, { zIndex: 100000 });
const angleMeasurementsMouseControl = new AngleMeasurementsMouseControl(angleMeasurementsPlugin, {
    pointerLens: new PointerLens(viewer), 
    snapping: true 
});
angleMeasurementsMouseControl.deactivate(); 

const distanceMeasurementsPlugin = new DistanceMeasurementsPlugin(viewer, { zIndex: 100000 });
const distanceMeasurementsMouseControl = new DistanceMeasurementsMouseControl(distanceMeasurementsPlugin, {
    pointerLens: new PointerLens(viewer),
    snapping: true
});
distanceMeasurementsMouseControl.deactivate();

// -----------------------------------------------------------------------------
// Suporte a toque para medições (ângulo e distância)
// -----------------------------------------------------------------------------
// Os controles de medição originais funcionam apenas com eventos de mouse.
// Para tablets e celulares, convertemos eventos de toque em eventos de mouse
// equivalentes, garantindo que as ferramentas de medir funcionem via toque.
(function enableTouchForMeasurements() {
    const canvasElement = viewer.scene.canvas.canvas;
    let touchActive = false;

    const dispatchMouseEvent = (type, touch) => {
        const eventInit = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            screenX: touch.screenX,
            screenY: touch.screenY,
            bubbles: true,
            cancelable: true
        };
        canvasElement.dispatchEvent(new MouseEvent(type, eventInit));
    };

    canvasElement.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1) {
            return;
        }

        touchActive = true;
        const touch = event.touches[0];
        dispatchMouseEvent('mousemove', touch);
        dispatchMouseEvent('mousedown', touch);
        event.preventDefault();
    }, { passive: false });

    canvasElement.addEventListener('touchmove', (event) => {
        if (!touchActive || event.touches.length !== 1) {
            return;
        }

        dispatchMouseEvent('mousemove', event.touches[0]);
        event.preventDefault();
    }, { passive: false });

    canvasElement.addEventListener('touchend', (event) => {
        if (!touchActive) {
            return;
        }

        const touch = event.changedTouches[0];
        dispatchMouseEvent('mouseup', touch);
        dispatchMouseEvent('click', touch);
        touchActive = false;
        event.preventDefault();
    }, { passive: false });

    canvasElement.addEventListener('touchcancel', () => {
        if (!touchActive) {
            return;
        }

        dispatchMouseEvent('mouseup', { clientX: 0, clientY: 0, screenX: 0, screenY: 0 });
        touchActive = false;
    });
})();
// -----------------------------------------------------------------------------
// Função utilitária: Limpa qualquer seleção, destaque ou estado de botão ativo
// -----------------------------------------------------------------------------
function clearSelection(removeButtonHighlight = true) {
    try {
        // Remove seleção de qualquer entidade
        if (viewer.scene && viewer.scene.selectedObjectIds) {
            viewer.scene.setObjectsSelected(viewer.scene.selectedObjectIds, false);
        }

        // Limpa a referência da última seleção
        lastSelectedEntity = null;

        // Remove destaque visual (highlight)
        if (viewer.scene && viewer.scene.highlightedObjectIds) {
            viewer.scene.setObjectsHighlighted(viewer.scene.highlightedObjectIds, false);
        }

        // Opcionalmente remove destaque do botão ativo
        if (removeButtonHighlight) {
            document.querySelectorAll('.tool-button').forEach(btn => btn.classList.remove('active'));
        }
    } catch (e) {
        console.warn("⚠️ clearSelection(): falhou ao limpar seleção:", e);
    }
}

function selectEntity(entity) {
    if (!entity || !entity.isObject) {
        return;
    }

    // Remove seleções anteriores e marca a nova entidade
    clearSelection(false);
    entity.selected = true;
    lastSelectedEntity = entity;
}
function setMeasurementMode(mode, clickedButton) {
    angleMeasurementsMouseControl.deactivate();
    distanceMeasurementsMouseControl.deactivate();
    document.querySelectorAll('.tool-button').forEach(btn => btn.classList.remove('active'));

    if (mode === 'angle') {
        angleMeasurementsMouseControl.activate();
    } else if (mode === 'distance') {
        distanceMeasurementsMouseControl.activate();
    }
    
    if (clickedButton) {
         clickedButton.classList.add('active');
    }

    angleMeasurementsMouseControl.reset(); 
    distanceMeasurementsMouseControl.reset(); 
    

    // Garante que o modo de seleção seja desativado ao iniciar uma medição
    clearSelection();
}

window.setMeasurementMode = setMeasurementMode;

function getModelObjectIds(modelId) {
    const ids = [];

    // Tenta usar a lista de objetos do modelo (quando disponível)
    const model = loadedModels.get(modelId);
    if (model?.objectIds?.length) {
        return [...model.objectIds];
    }

    // Fallback: filtra metaObjects pelo metaModel associado
    const metaObjects = viewer.metaScene?.metaObjects || {};
    for (const [objectId, metaObject] of Object.entries(metaObjects)) {
        if (metaObject?.metaModel?.id === modelId) {
            ids.push(objectId);
        }
    }
    return ids;
}

function getObjectMetaModelId(objectId) {
    const metaObjects = viewer.metaScene?.metaObjects || {};
    const metaObject = metaObjects[objectId];

    return metaObject?.metaModel?.id || null;
}

function intersectsAABB(aabbA, aabbB) {
    if (!aabbA || !aabbB) {
        return false;
    }

    return !(
        aabbA[0] > aabbB[3] ||
        aabbA[3] < aabbB[0] ||
        aabbA[1] > aabbB[4] ||
        aabbA[4] < aabbB[1] ||
        aabbA[2] > aabbB[5] ||
        aabbA[5] < aabbB[2]
    );
}

function mergeAABBs(aabbs) {
    const valid = aabbs.filter(Boolean);

    if (!valid.length) {
        return null;
    }

    const minX = Math.min(...valid.map((aabb) => aabb[0]));
    const minY = Math.min(...valid.map((aabb) => aabb[1]));
    const minZ = Math.min(...valid.map((aabb) => aabb[2]));
    const maxX = Math.max(...valid.map((aabb) => aabb[3]));
    const maxY = Math.max(...valid.map((aabb) => aabb[4]));
    const maxZ = Math.max(...valid.map((aabb) => aabb[5]));
    
    return [minX, minY, minZ, maxX, maxY, maxZ];
}

function getCameraPose() {
    const { eye, look, up } = viewer.camera || {};

    if (!eye || !look || !up) {
        return null;
    }

    return {
        eye: [...eye],
        look: [...look],
        up: [...up]
    };
}

function restoreCameraPose(pose) {
    if (!pose) {
        return;
    }

    viewer.cameraFlight.jumpTo({
        eye: pose.eye,
        look: pose.look,
        up: pose.up
    });
}

function waitForRender(ms = 180) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toArraySafe(list) {
    if (!list) {
        return [];
    }

    if (Array.isArray(list)) {
        return [...list];
    }

    if (typeof list[Symbol.iterator] === "function") {
        return [...list];
    }

    return [];
}

function captureSceneRenderState() {
    const scene = viewer?.scene;

    if (!scene) {
        return null;
    }

    return {
        visible: toArraySafe(scene.visibleObjectIds),
        xrayed: toArraySafe(scene.xrayedObjectIds),
        highlighted: toArraySafe(scene.highlightedObjectIds)
    };
}

function restoreSceneRenderState(state) {
    const scene = viewer?.scene;

    if (!scene || !state) {
        return;
    }

    const applyState = (current, target, setter) => {
        if (!setter) {
            return;
        }

        const currentIds = toArraySafe(current);
        const targetIds = toArraySafe(target);
        const unionIds = [...new Set([...currentIds, ...targetIds])];

        if (unionIds.length) {
            setter(unionIds, false);
        }

        if (targetIds.length) {
            setter(targetIds, true);
        }
    };

    applyState(scene.visibleObjectIds, state.visible, scene.setObjectsVisible?.bind(scene));
    applyState(scene.xrayedObjectIds, state.xrayed, scene.setObjectsXRayed?.bind(scene));
    applyState(scene.highlightedObjectIds, state.highlighted, scene.setObjectsHighlighted?.bind(scene));
}

/**
 * Snapshot LEVE:
 * - Faz downscale para reduzir pixels
 * - Exporta como JPEG com qualidade ajustável
 * - Mantém a imagem grande no PDF (em mm), mas leve (em px)
 */
function getCanvasSnapshot({
    maxWidthPx = 900,          // ↓ quanto menor, mais leve (700~1200 bom)
    mimeType = "image/jpeg",   // JPEG é muito mais leve que PNG
    quality = 0.55             // 0.35~0.70 (quanto menor, mais leve)
} = {}) {
    const canvas = document.getElementById("meuCanvas");
    if (!canvas) return null;

    const srcCanvas = canvas;
    const srcW = srcCanvas.width;
    const srcH = srcCanvas.height;

    if (!srcW || !srcH) return null;

    // Escala para reduzir resolução
    const scale = Math.min(1, maxWidthPx / srcW);
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    // Canvas temporário reduzido
    const tmp = document.createElement("canvas");
    tmp.width = dstW;
    tmp.height = dstH;

    const ctx = tmp.getContext("2d", { alpha: false });

    // Melhora a aparência ao reduzir
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(srcCanvas, 0, 0, dstW, dstH);

    // Exporta como JPEG comprimido
    return tmp.toDataURL(mimeType, quality);
}

async function captureSnapshotsForCollisions(collisions) {
    const originalPose = getCameraPose();
    const originalRenderState = captureSceneRenderState();
    const canvas = document.getElementById("meuCanvas");
    const canvasAspect =
        canvas?.width && canvas?.height ? canvas.width / canvas.height : 1.6;

    const snapshots = [];

    for (const { objectId, collidingWith } of collisions) {
        const isolationApplied = applyCollisionIsolation(objectId, collidingWith, { animate: false });

        if (!isolationApplied) {
            snapshots.push({ dataUrl: null, aspect: canvasAspect });
            continue;
        }

        requestRenderFrame();
        await waitForRender(220); // um pouco maior pra garantir render antes do print

        snapshots.push({
            dataUrl: getCanvasSnapshot({
                maxWidthPx: 900,          // ajuste aqui (700 = mais leve, 1200 = mais qualidade)
                mimeType: "image/jpeg",
                quality: 0.55             // ajuste aqui (0.45 = mais leve, 0.65 = melhor)
            }),
            aspect: canvasAspect
        });
    }

    if (originalRenderState) {
        restoreSceneRenderState(originalRenderState);
        requestRenderFrame();
    }

    if (originalPose) {
        restoreCameraPose(originalPose);
        requestRenderFrame();
    }

    return snapshots;
}

function applyCollisionIsolation(objectAId, collidingIds, { animate = true } = {}) {
    if (!modelIsolateController) {
        return false;
    }

    const idsToFocus = [objectAId, ...collidingIds];
    const allIds = getAllObjectIds();
    const otherIds = allIds.filter((id) => !idsToFocus.includes(id));
    // Limpa estados anteriores e mostra tudo em X-ray para manter o contexto
    modelIsolateController.setObjectsVisible(allIds, true);
    modelIsolateController.setObjectsXRayed(allIds, true);
    modelIsolateController.setObjectsHighlighted(allIds, false);

    // Realça a colisão e remove o X-ray apenas dos elementos em conflito
modelIsolateController.setObjectsVisible(idsToFocus, true);
    modelIsolateController.setObjectsXRayed(idsToFocus, false);
    viewer.scene.setObjectsHighlighted(idsToFocus, true);

    if (otherIds.length) {
        modelIsolateController.setObjectsHighlighted(otherIds, false);
    }

    const combinedAABB = mergeAABBs(idsToFocus.map((id) => viewer.scene.getAABB(id)));

    if (combinedAABB) {
        if (animate) {
            viewer.cameraFlight.flyTo({ aabb: combinedAABB, duration: 0.6 });
        } else {
            viewer.cameraFlight.jumpTo({ aabb: combinedAABB });
        }
    }

    requestRenderFrame();

    return Boolean(combinedAABB);
}

function isolateCollisionGroup(objectAId, collidingIds) {
    applyCollisionIsolation(objectAId, collidingIds, { animate: true });
}

function updateCollisionDownloadButton() {
    if (!downloadCollisionPdfButton) {
        return;
    }

    const hasCollisions = lastCollisionResults.length > 0;
    downloadCollisionPdfButton.disabled = !hasCollisions;
    downloadCollisionPdfButton.title = hasCollisions
        ? "Baixar relatório em PDF"
        : "Nenhuma colisão encontrada para exportar";
}

function setCollisionState(collisions, modelId) {
    lastCollisionResults = collisions;
    lastCollisionModelId = collisions.length ? modelId : null;
    updateCollisionDownloadButton();
}

function formatIfcPropertyValue(value) {
    if (value === null || value === undefined) {
        return "(vazio)";
    }

    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }

    return String(value);
}

function buildIfcPropertiesLines(doc, objectId, maxWidth) {
    const metaObject = viewer.metaScene?.metaObjects?.[objectId];
    if (!metaObject) {
        return ["Propriedades IFC: metadados não encontrados para este objeto."];
    }

    const { propertySets } = metaObject;
    if (!propertySets?.length) {
        return ["Propriedades IFC: nenhum conjunto de propriedades disponível."];
    }

    const lines = ["Propriedades IFC:"];

    propertySets.forEach((pset) => {
        const setName = pset.name || pset.id || "Conjunto sem nome";
        lines.push(`- ${setName}`);

        if (pset.properties?.length) {
            pset.properties.forEach((prop) => {
                const key = prop.name || prop.id || "Propriedade";
                const value = formatIfcPropertyValue(prop.value);
                const propertyText = `  • ${key}: ${value}`;
                const wrappedLines = doc.splitTextToSize(propertyText, maxWidth);
                lines.push(...wrappedLines);
            });
        } else {
            lines.push("  • Nenhuma propriedade listada.");
        }
    });

    return lines;
}

async function downloadCollisionsAsPdf() {
    
    if (!lastCollisionResults.length) {
        return;
    }

    // ✅ compressão do PDF
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

    const snapshots = await captureSnapshotsForCollisions(lastCollisionResults);

    doc.setFontSize(16);
    doc.text("Relatório de colisões", 14, 20);

    doc.setFontSize(12);
    doc.text(`Modelo analisado: ${lastCollisionModelId ?? "-"}`, 14, 30);
    doc.text(`Total de colisões: ${lastCollisionResults.length}`, 14, 38);

    let cursorY = 50;

    const leftMargin = 14;
    const topMargin = 20;
    const maxWidth = 180;
    const lineHeight = 5;
    const spacingAfterItem = 6;

    // Altura útil aproximada no A4 (em mm)
    const pageHeightLimit = 280;

    // ✅ imagem MAIOR no PDF (mm) sem aumentar o peso (px)
    const defaultImageWidth = 140; // 120~160 fica ótimo

    lastCollisionResults.forEach(({ objectId, collidingWith }, index) => {
        const titleText = `${index + 1}. Objeto ${objectId}`;
        const description = `Colide com: ${collidingWith.join(", ")}`;
        const snapshot = snapshots[index];

        const imageAspect = snapshot?.aspect || 1.6;
        const imageHeight = snapshot?.dataUrl ? defaultImageWidth / imageAspect : 0;

        const descriptionLines = doc.splitTextToSize(description, maxWidth);
        const propertyLines = buildIfcPropertiesLines(doc, objectId, maxWidth);

        const itemHeight =
            lineHeight +
            descriptionLines.length * lineHeight +
            propertyLines.length * lineHeight +
            (snapshot?.dataUrl && propertyLines.length ? spacingAfterItem : 0) +
            (snapshot?.dataUrl ? imageHeight : 0) +
            spacingAfterItem;

        // Quebra de página
        if (cursorY + itemHeight > pageHeightLimit) {
            doc.addPage();
            cursorY = topMargin;

            // opcional: repetir cabeçalho (se quiser, descomente)
            // doc.setFontSize(10);
            // doc.text(`Relatório de colisões - Modelo: ${lastCollisionModelId ?? "-"}`, leftMargin, 12);
        }
        doc.setFontSize(12);
        doc.text(titleText, leftMargin, cursorY);
        cursorY += lineHeight;

        doc.setFontSize(10);
        doc.text(descriptionLines, leftMargin, cursorY, { maxWidth });
        cursorY += descriptionLines.length * lineHeight;

        if (propertyLines.length) {
            doc.text(propertyLines, leftMargin, cursorY, { maxWidth });
            cursorY += propertyLines.length * lineHeight;

            if (snapshot?.dataUrl) {
                cursorY += spacingAfterItem;
            }
        }

        if (snapshot?.dataUrl) {
            // ✅ JPEG + FAST (mais leve e rápido)
            doc.addImage(
                snapshot.dataUrl,
                "JPEG",
                leftMargin,
                cursorY,
                defaultImageWidth,
                imageHeight,
                undefined,
                "FAST"
            );
            cursorY += imageHeight;
        }

        cursorY += spacingAfterItem;
    });

    doc.save("colisoes.pdf");
}

function renderCollisionResults(collisions) {
    collisionResultsList.innerHTML = "";

    if (!collisions.length) {
        const emptyItem = document.createElement("li");
        emptyItem.textContent = "Nenhuma colisão encontrada.";
        emptyItem.classList.add("collision-summary");
        collisionResultsList.appendChild(emptyItem);
        return;
    }

    collisions.forEach(({ objectId, collidingWith }, index) => {
        const item = document.createElement("li");
        item.classList.add("collision-result-item");

        const title = document.createElement("div");
        title.classList.add("collision-result-title");
        title.textContent = `#${index + 1}: Objeto ${objectId}`;

        const list = document.createElement("div");
        list.classList.add("collision-result-list");
        list.textContent = "Colisão detectada com outro modelo.";

        const actions = document.createElement("div");
        actions.classList.add("collision-result-actions");

        const focusBtn = document.createElement("button");
        focusBtn.type = "button";
        focusBtn.textContent = "Isolar colisão";
        focusBtn.classList.add("collision-focus-btn");
        focusBtn.addEventListener("click", () => isolateCollisionGroup(objectId, collidingWith));

        actions.appendChild(focusBtn);
        item.append(title, list, actions);
        collisionResultsList.appendChild(item);
    });
}

function findAndRenderCollisions(modelId) {
    if (!modelId) {
        collisionSummary.textContent = "Selecione um modelo para iniciar a análise.";
        collisionResultsList.innerHTML = "";
        setCollisionState([], null);
        return;
    }

    const objects = getModelObjectIds(modelId);
    const targetIds = new Set(objects);
    const externalObjects = getAllObjectIds().filter((id) => !targetIds.has(id) && getObjectMetaModelId(id) !== modelId);

    if (!objects.length) {
        collisionSummary.textContent = "Nenhum objeto encontrado no modelo selecionado.";
        collisionResultsList.innerHTML = "";
        setCollisionState([], null);
        return;
    }

    if (!externalObjects.length) {
        collisionSummary.textContent = "Nenhum outro modelo carregado para comparar colisões.";
        collisionResultsList.innerHTML = "";
        setCollisionState([], null);
        return;
    }

    const collisionsMap = new Map();

    const addCollision = (base, target) => {
        if (!collisionsMap.has(base)) {
            collisionsMap.set(base, new Set());
        }
        collisionsMap.get(base).add(target);
    };
    
    for (let i = 0; i < objects.length; i++) {
        const objectA = objects[i];
        const aabbA = viewer.scene.getAABB(objectA);

        if (!aabbA) {
            continue;
        }

        for (let j = 0; j < externalObjects.length; j++) {
            const objectB = externalObjects[j];
            const aabbB = viewer.scene.getAABB(objectB);

            if (aabbB && intersectsAABB(aabbA, aabbB)) {
                addCollision(objectA, objectB);
            }
        }
    }

    const collisions = Array.from(collisionsMap.entries()).map(([objectId, set]) => ({
        objectId,
        collidingWith: Array.from(set)
    }));

    collisionSummary.textContent = `${collisions.length} objeto(s) do modelo ${modelId} com colisão em outros modelos.`;
    setCollisionState(collisions, modelId);
    renderCollisionResults(collisions);
}

document.addEventListener("keydown", (event) => {
    const key = event.key?.toLowerCase();

    // Evita atalhos quando o usuário está digitando em inputs ou textareas
    const isTyping = ["INPUT", "TEXTAREA"].includes(event.target?.nodeName) || event.target?.isContentEditable;
    if (isTyping && key !== "escape") {
        return;
    }

    if (key === "escape") {
        setMeasurementMode("none");
        closePropertyPanel();
        closePanelsOnEscape();
        return;
    }

    if (key === "r") {
        resetXRay();
        return;
    }

    if (key === "m") {
        showAllEntities();
        return;
    }

    // Atalhos de entidade: requerem uma seleção prévia (duplo clique)
    if (!lastSelectedEntity) {
        return;
    }

    if (key === "i") {
        isolateEntity(lastSelectedEntity);
    } else if (key === "p") {
        showMaterialProperties(lastSelectedEntity);
    } else if (key === "o") {
        hideEntity(lastSelectedEntity);
    }
});

// -----------------------------------------------------------------------------
// 4. Menu de Contexto (Deletar Medição) (MANTIDO)
// -----------------------------------------------------------------------------

const contextMenu = new ContextMenu({
    items: [
        [
            {
                title: "Deletar Medição",
                doAction: function (context) {
                    context.measurement.destroy();
                }
            }
        ]
    ]
});

function setupMeasurementEvents(plugin) {
    plugin.on("contextMenu", (e) => {
        const measurement = e.angleMeasurement || e.distanceMeasurement;
        contextMenu.context = { measurement: measurement };
        contextMenu.show(e.event.clientX, e.event.clientY);
        e.event.preventDefault();
    });

    plugin.on("mouseOver", (e) => {
        (e.angleMeasurement || e.distanceMeasurement).setHighlighted(true);
    });

    plugin.on("mouseLeave", (e) => {
        const measurement = e.angleMeasurement || e.distanceMeasurement;
        if (!contextMenu.shown || contextMenu.context.measurement.id !== measurement.id) {
            measurement.setHighlighted(false);
        }
    });
}

setupMeasurementEvents(angleMeasurementsPlugin);
setupMeasurementEvents(distanceMeasurementsPlugin);

// -----------------------------------------------------------------------------
// 5. Cubo de Navegação (NavCube) (MANTIDO)
// -----------------------------------------------------------------------------

new NavCubePlugin(viewer, {
    canvasId: "myNavCubeCanvas", 
    visible: true,
    size: 150, 
    alignment: "bottomRight", 
    bottomMargin: 20, 
    rightMargin: 20 
});

// -----------------------------------------------------------------------------
// 6. TreeViewPlugin e Lógica de Isolamento (MANTIDO)
// -----------------------------------------------------------------------------

function setupModelIsolateController() {

    if (!treeViewContainer) {
        return;
    }

    treeView = new TreeViewPlugin(viewer, {
        containerElement: treeViewContainer,
        hierarchy: "containment",
        autoExpandDepth: 2
    });

    setupTreeViewFilter();

    modelIsolateController = viewer.scene;

    // Ouve o evento de "seleção" no TreeView
    treeView.on("nodeClicked", (event) => {
        const entityId = event.entityId;
        
        // Verifica se há alguma entidade associada ao nó
        if (entityId && viewer.scene.getObjectsInSubtree(entityId).length > 0) {
            
            const subtreeIds = viewer.scene.getObjectsInSubtree(entityId);

            // Isola (mostra apenas) a parte do modelo (pavimento, por exemplo) clicada
            modelIsolateController.setObjectsXRayed(getAllObjectIds(), true); // X-ray em TUDO
            modelIsolateController.setObjectsXRayed(subtreeIds, false); // Tira o X-ray do subconjunto isolado

            modelIsolateController.isolate(subtreeIds); // Isola o subconjunto
            
            viewer.cameraFlight.flyTo({
                aabb: viewer.scene.getAABB(entityId),
                duration: 0.5
            });
            
            clearSelection(); // Limpa a seleção específica quando se usa a TreeView

        } else {
            // Se o usuário clicar em um nó que não contém objetos (como o nó raiz do projeto ou um item folha)
            // Apenas reseta a visibilidade.
            resetModelVisibility(); 
        }
    });
}

function setupTreeViewFilter() {
    const container = treeViewContainer;

    if (!container) {
        return;
    }

    const getRootTitle = (item) => {
        let current = item;
        let parent = current.parentElement?.closest(".xeokit-tree-view-item");

        while (parent) {
            current = parent;
            parent = current.parentElement?.closest(".xeokit-tree-view-item");
        }

        return current
            ?.querySelector(".xeokit-tree-view-item-title")
            ?.textContent?.trim();
    };

    const applyFilter = () => {
        const items = Array.from(container.querySelectorAll(".xeokit-tree-view-item"));
        if (items.length === 0) {
            return;
        }
        const buildingItems = items.filter((item) => {
            const titleEl = item.querySelector(".xeokit-tree-view-item-title");
            return titleEl?.textContent?.trim() === "IfcBuilding";
        });

        if (buildingItems.length === 0) {
            return;
        }

        const allowedItems = new Set();

        const allowWithAncestorsAndDescendants = (item) => {
            let current = item;
            while (current && current.classList?.contains("xeokit-tree-view-item")) {
                allowedItems.add(current);
                current = current.parentElement?.closest(".xeokit-tree-view-item");
            }

            item.querySelectorAll(".xeokit-tree-view-item").forEach((child) => {
                allowedItems.add(child);
            });
        };

        buildingItems.forEach((item) => {
            allowWithAncestorsAndDescendants(item);

            const buildingTitleEl = item.querySelector(".xeokit-tree-view-item-title");
            const rootTitle = getRootTitle(item);

            if (buildingTitleEl && rootTitle) {
                buildingTitleEl.textContent = rootTitle;
            }
        });

        items.forEach((item) => {
            const shouldShow = allowedItems.has(item);
            const titleText = item
                .querySelector(".xeokit-tree-view-item-title")
                ?.textContent?.trim();
            const rootTitle = getRootTitle(item);

            const hideIFCARQStorey =
                rootTitle === "IFC_ARQ" && titleText === "IfcBuildingStorey";

            item.style.display = shouldShow && !hideIFCARQStorey ? "" : "none";
        });
    };
    const observer = new MutationObserver(applyFilter);
    observer.observe(container, { childList: true, subtree: true });

    applyFilter();

    container.dataset.treeFilterAttached = "true";
}
/**
 * Alterna a visibilidade do contêiner do TreeView e reseta a visibilidade do modelo se estiver fechando.
 */
function toggleTreeView() {
    if (!treeViewContainer) {
        return;
    }

    if (treeViewContainer.style.display === 'block') {
        treeViewContainer.style.display = 'none';
        // Ação de "Mostrar Tudo" ao fechar o painel
        resetModelVisibility(); 
    } else {
        treeViewContainer.style.display = 'block';
    }
}

// EXPOR AO ESCOPO GLOBAL para ser chamado pelo 'onclick' do HTML
window.toggleTreeView = toggleTreeView;
window.resetModelVisibility = resetModelVisibility;

// -----------------------------------------------------------------------------
// 7. Plano de Corte (Section Plane) - VERSÃO ESTÁVEL (MANTIDO)
// -----------------------------------------------------------------------------
// ... setupSectionPlane (função que não é mais usada, mas mantida por segurança) ...

function toggleSectionPlane(button) {
    const scene = viewer.scene;

    if (!sectionPlanesPlugin) {
        sectionPlanesPlugin = new SectionPlanesPlugin(viewer);
    }

    // --- DESATIVAR ---
    if (sectionPlaneEnabled) {
        sectionPlaneEnabled = false;

        if (horizontalSectionPlane) {
            horizontalSectionPlane.active = false;

            if (horizontalSectionPlane.control) {
                try {
                    viewer.input.removeCanvasElement(horizontalSectionPlane.control.canvas);
                } catch (e) {}

                horizontalSectionPlane.control.destroy();
                horizontalSectionPlane.control = null;
            }

            // Remove o plano para que o gizmo e a geometria desapareçam
            horizontalSectionPlane.destroy();
            horizontalSectionPlane = null;
        }

        scene.sectionPlanes.active = false;
        
        // alguns builds deixam o gizmo em viewer.input._activeCanvasElements
        if (viewer.input && viewer.input._activeCanvasElements) {
            viewer.input._activeCanvasElements.clear?.();
        }

        viewer.scene.render(); // força re-render
        button.classList.remove("active");
        viewer.cameraFlight.flyTo(scene);
        return;
    }

    // --- ATIVAR ---
    const aabb = scene.getAABB();
    const modelCenterY = (aabb[1] + aabb[4]) / 2;

    if (!horizontalSectionPlane) {
        horizontalSectionPlane = sectionPlanesPlugin.createSectionPlane({
            id: "horizontalPlane",
            pos: [0, modelCenterY, 0],
            dir: [0, -1, 0],
            active: true
        });
    } else {
        horizontalSectionPlane.pos = [0, modelCenterY, 0];
        horizontalSectionPlane.dir = [0, -1, 0];
        horizontalSectionPlane.active = true;
    }

    scene.sectionPlanes.active = true;
    sectionPlaneEnabled = true;

    if (horizontalSectionPlane.control) {
        try {
            viewer.input.removeCanvasElement(horizontalSectionPlane.control.canvas);
        } catch (e) {}

        horizontalSectionPlane.control.destroy();
        horizontalSectionPlane.control = null;
    }

    horizontalSectionPlane.control = sectionPlanesPlugin.showControl(horizontalSectionPlane.id);

    button.classList.add("active");

    viewer.cameraFlight.flyTo({
        aabb: scene.aabb,
        duration: 0.5
    });
}

window.toggleSectionPlane = toggleSectionPlane;

// -----------------------------------------------------------------------------
// 8. Destaque de Entidades ao Passar o Mouse (Hover Highlight)
// -----------------------------------------------------------------------------

let lastEntity = null;

// Monitora o movimento do mouse sobre o canvas
viewer.scene.input.on("mousemove", function (coords) {
    
    const hit = viewer.scene.pick({
        canvasPos: coords
    });

    if (hit && hit.entity && hit.entity.isObject) {

        // Se for um novo objeto, troca o destaque
        if (!lastEntity || hit.entity.id !== lastEntity.id) {

            if (lastEntity) {
                lastEntity.highlighted = false;
            }

            lastEntity = hit.entity;
            hit.entity.highlighted = true;
        }

    } else {
        // Saiu de qualquer entidade: remove o highlight
        if (lastEntity) {
            lastEntity.highlighted = false;
            lastEntity = null;
        }
    }
});

// -----------------------------------------------------------------------------
// 8.1 Seleção por Duplo Clique
// -----------------------------------------------------------------------------

viewer.cameraControl.on("doublePicked", (pickResult) => {
    const entity = pickResult?.entity;

    if (entity && entity.isObject) {
        selectEntity(entity);
    }
});

viewer.cameraControl.on("doublePickedNothing", () => {
    clearSelection();
});

// -----------------------------------------------------------------------------
// 9. Menu de Contexto (Propriedades + Visibilidade + X-Ray) - VERSÃO FINAL
// -----------------------------------------------------------------------------

// Desabilita o pan com o botão direito (para permitir o menu)
viewer.cameraControl.panRightClick = false;

function resetXRay() {
    const scene = viewer.scene;

    if (!scene || scene.numXRayedObjects === 0) {
        return;
    }

    scene.setObjectsXRayed(scene.xrayedObjectIds, false);
}

function hideEntity(entity) {
    if (!entity?.isObject) {
        return;
    }

    entity.visible = false;
}

function isolateEntity(entity) {
    const scene = viewer.scene;
    const metaObject = viewer.metaScene.metaObjects[entity?.id];

    if (!scene || !entity?.isObject || !metaObject) {
        return;
    }

    scene.setObjectsVisible(scene.visibleObjectIds, false);
    scene.setObjectsXRayed(scene.xrayedObjectIds, false);
    scene.setObjectsSelected(scene.selectedObjectIds, false);

    metaObject.withMetaObjectsInSubtree((mo) => {
        const currentEntity = scene.objects[mo.id];
        if (currentEntity) {
            currentEntity.visible = true;
        }
    });
}

function showAllEntities() {
    const scene = viewer.scene;

    if (!scene) {
        return;
    }

    scene.setObjectsVisible(scene.objectIds, true);
    scene.setObjectsXRayed(scene.xrayedObjectIds, false);
    scene.setObjectsSelected(scene.selectedObjectIds, false);
}

function closePropertyPanel() {
    const painel = document.getElementById("propertyPanel");
    if (painel) {
        painel.remove();
    }
}

function showMaterialProperties(entity) {
    if (!entity?.id) {
        alert("Nenhuma entidade selecionada.");
        return;
    }
    const metaObject = viewer.metaScene.metaObjects[entity.id];

    if (!metaObject) {
        alert("Não há informações de metadados disponíveis para este objeto.");
        return;
    }

    let propriedades = `<strong style='color:#4CAF50;'>ID:</strong> ${metaObject.id}<br>`;
    propriedades += `<strong style='color:#4CAF50;'>Tipo:</strong> ${metaObject.type || "N/A"}<br>`;
    if (metaObject.name) propriedades += `<strong style='color:#4CAF50;'>Nome:</strong> ${metaObject.name}<br><br>`;

    const aabb = viewer.scene.getAABB(entity.id);
    if (aabb) {
        const centerX = ((aabb[0] + aabb[3]) / 2).toFixed(3);
        const centerY = ((aabb[1] + aabb[4]) / 2).toFixed(3);
        const centerZ = ((aabb[2] + aabb[5]) / 2).toFixed(3);
        propriedades += `<strong style='color:#4CAF50;'>Coordenadas (centro):</strong><br>`;
        propriedades += `<span style='color:#fff;'>X: ${centerX} &nbsp; Y: ${centerY} &nbsp; Z: ${centerZ}</span><br><br>`;
    }

    // --- Varre todos os conjuntos de propriedades IFC ---
    if (metaObject.propertySets && metaObject.propertySets.length > 0) {
        for (const pset of metaObject.propertySets) {
            propriedades += `<div style="margin-top:10px;border-top:1px solid #444;padding-top:5px;">`;
            propriedades += `<strong style='color:#4CAF50;'>${pset.name}</strong><br>`;
            if (pset.properties && pset.properties.length > 0) {
                propriedades += "<table style='width:100%;font-size:12px;margin-top:5px;'>";
                for (const prop of pset.properties) {
                    const key = prop.name || prop.id;
                    const val = prop.value !== undefined ? prop.value : "(vazio)";
                    propriedades += `<tr><td style='width:40%;color:#ccc;'>${key}</td><td style='color:#fff;'>${val}</td></tr>`;
                }
                propriedades += "</table>";
            }
            propriedades += `</div>`;
        }
    } else {
        propriedades += `<i style='color:gray;'>Nenhum conjunto de propriedades encontrado.</i>`;
    }

    // --- Cria ou atualiza o painel flutuante ---
    let painel = document.getElementById("propertyPanel");
    if (!painel) {
        painel = document.createElement("div");
        painel.id = "propertyPanel";
        painel.style.position = "fixed";
        painel.style.right = "20px";
        painel.style.top = "80px";
        painel.style.width = "350px";
        painel.style.maxHeight = "65vh";
        painel.style.overflowY = "auto";
        // Esses estilos podem ser sobrescritos via styles.css
        painel.style.background = "rgba(0,0,0,0.9)";
        painel.style.color = "white";
        painel.style.padding = "15px";
        painel.style.borderRadius = "10px";
        painel.style.zIndex = 300000;
        painel.style.fontFamily = "Arial, sans-serif";
        painel.style.fontSize = "13px";
        painel.style.boxShadow = "0 4px 10px rgba(0,0,0,0.4)";
        document.body.appendChild(painel);
    }

    // 🟢 Adiciona botão X para fechar
    painel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <h3 style='margin:0;'>Propriedades IFC</h3>
            <button id="closePropertyPanel"
                style="
                    background:transparent;
                    border:none;
                    color:#f44336;
                    font-size:18px;
                    font-weight:bold;
                    cursor:pointer;
                    line-height:1;
                "
                title="Fechar painel">
                ✖
            </button>
        </div>
        ${propriedades}
    `;

    // 🟢 Evento do botão X
    document.getElementById("closePropertyPanel").onclick = closePropertyPanel;
}

// Cria o menu de contexto
const materialContextMenu = new ContextMenu({
    enabled: true,
    items: [
        [
            {
                title: "Propriedades do Material",
                doAction: function (context) {
                    showMaterialProperties(context.entity);
                }
            }
        ],
        [
            {
                title: "Ocultar",
                getEnabled: (context) => context.entity.visible,
                doAction: (context) => {
                    hideEntity(context.entity);
                }
            },
            {
                title: "Isolar",
                doAction: (context) => {
                    isolateEntity(context.entity);
                }
            },
            {
                title: "Ocultar Todos",
                getEnabled: (context) => context.viewer.scene.numVisibleObjects > 0,
                doAction: (context) => {
                    context.viewer.scene.setObjectsVisible(context.viewer.scene.visibleObjectIds, false);
                }
            },
            {
                title: "Mostrar Todos",
                getEnabled: (context) => {
                    const scene = context.viewer.scene;
                    return scene.numVisibleObjects < scene.numObjects;
                },
                doAction: showAllEntities
            }
        ],
        [
            {
                title: "Aplicar X-Ray",
                getEnabled: (context) => !context.entity.xrayed,
                doAction: (context) => {
                    context.entity.xrayed = true;
                }
            },
            {
                title: "Remover X-Ray",
                getEnabled: (context) => context.entity.xrayed,
                doAction: (context) => {
                    context.entity.xrayed = false;
                }
            },
            {
                title: "X-Ray em Outros",
                doAction: (context) => {
                    const scene = context.viewer.scene;
                    const entity = context.entity;
                    const metaObject = viewer.metaScene.metaObjects[entity.id];
                    if (!metaObject) return;
                    scene.setObjectsVisible(scene.objectIds, true);
                    scene.setObjectsXRayed(scene.objectIds, true);
                    metaObject.withMetaObjectsInSubtree((mo) => {
                        const e = scene.objects[mo.id];
                        if (e) e.xrayed = false;
                    });
                }
            },
            {
                title: "Redefinir X-Ray",
                getEnabled: (context) => context.viewer.scene.numXRayedObjects > 0,
                doAction: (context) => {
                    context.viewer.scene.setObjectsXRayed(context.viewer.scene.xrayedObjectIds, false);
                }
            }
        ]
    ]
});

function showEntityContextMenu(pageX, pageY) {
    const canvasPos = [pageX, pageY];
    const hit = viewer.scene.pick({ canvasPos });

    if (hit && hit.entity && hit.entity.isObject) {
        materialContextMenu.context = { viewer, entity: hit.entity };
        materialContextMenu.show(pageX, pageY);
    }
}

// Captura o evento de clique direito no canvas
viewer.scene.canvas.canvas.addEventListener('contextmenu', (event) => {
    showEntityContextMenu(event.pageX, event.pageY);
    event.preventDefault();
});

// Suporte a toque: abre o menu ao manter o dedo pressionado sobre o objeto
(() => {
    const canvasElement = viewer.scene.canvas.canvas;
    const longPressDuration = 600;
    const moveThreshold = 10;
    let touchTimeout = null;
    let touchStartPos = null;
    let menuOpened = false;

    const clearTouch = () => {
        if (touchTimeout) {
            clearTimeout(touchTimeout);
            touchTimeout = null;
        }
        touchStartPos = null;
        menuOpened = false;
    };

    canvasElement.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1) {
            clearTouch();
            return;
        }

        const touch = event.touches[0];
        touchStartPos = { x: touch.pageX, y: touch.pageY };
        menuOpened = false;

        touchTimeout = setTimeout(() => {
            menuOpened = true;
            showEntityContextMenu(touchStartPos.x, touchStartPos.y);
        }, longPressDuration);
    }, { passive: true });

    canvasElement.addEventListener('touchmove', (event) => {
        if (!touchStartPos || event.touches.length !== 1) {
            clearTouch();
            return;
        }

        const touch = event.touches[0];
        const dx = touch.pageX - touchStartPos.x;
        const dy = touch.pageY - touchStartPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
            clearTouch();
        }
    }, { passive: true });

    const endTouch = (event) => {
        if (menuOpened) {
            event.preventDefault();
        }
        clearTouch();
    };

    canvasElement.addEventListener('touchend', endTouch, { passive: false });
    canvasElement.addEventListener('touchcancel', clearTouch, { passive: true });
})();


