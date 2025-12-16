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
    LineSet,         // <--- NOVO: Importa LineSet
    buildGridGeometry // <--- NOVO: Importa buildGridGeometry
} from "https://cdn.jsdelivr.net/npm/@xeokit/xeokit-sdk@latest/dist/xeokit-sdk.min.es.js"; 

let treeView;
let modelIsolateController;
let sectionPlanesPlugin;
let horizontalSectionPlane;
let horizontalPlaneControl;
let lastPickedEntity = null; // NOVO: Variável para rastrear a entidade selecionada
let lastSelectedEntity = null; // NOVO: Guarda a entidade selecionada pelo duplo clique

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

/**
 * Configura o painel de ajustes do Scalable Ambient Obscurance (SAO).
 */
function setupSAOControls() {
    const saoPanel = document.getElementById("saoPanel");
    const toggleButton = document.getElementById("btnSAO");
    const closeButton = document.getElementById("closeSaoPanel");

    if (!saoPanel || !toggleButton || !closeButton) {
        return;
    }

    const sao = viewer.scene.sao;

    if (!sao) {
        return;
    }

    const requestSaoRender = () => {
        if (viewer.scene.requestRender) {
            viewer.scene.requestRender();
        } else if (viewer.scene.setDirty) {
            viewer.scene.setDirty();
        }
    };
    const controls = {
        enabled: document.getElementById("saoEnabled"),
        blur: document.getElementById("saoBlur"),
        intensity: document.getElementById("saoIntensity"),
        kernelRadius: document.getElementById("saoKernelRadius"),
        bias: document.getElementById("saoBias"),
        scale: document.getElementById("saoScale"),
        minResolution: document.getElementById("saoMinResolution"),
        numSamples: document.getElementById("saoNumSamples"),
        blendCutoff: document.getElementById("saoBlendCutoff"),
        blendFactor: document.getElementById("saoBlendFactor")
    };

    const valueLabels = {
        intensity: document.getElementById("saoIntensityValue"),
        kernelRadius: document.getElementById("saoKernelRadiusValue"),
        bias: document.getElementById("saoBiasValue"),
        scale: document.getElementById("saoScaleValue"),
        minResolution: document.getElementById("saoMinResolutionValue"),
        numSamples: document.getElementById("saoNumSamplesValue"),
        blendCutoff: document.getElementById("saoBlendCutoffValue"),
        blendFactor: document.getElementById("saoBlendFactorValue")
    };

    const setLabel = (label, value, decimals = 2) => {
        if (!label) return;
        label.textContent = decimals === null ? value : Number(value).toFixed(decimals);
    };

    const syncFromSao = () => {
        controls.enabled.checked = !!sao.enabled;
        controls.blur.checked = !!sao.blur;

        controls.intensity.value = sao.intensity;
        controls.kernelRadius.value = sao.kernelRadius;
        controls.bias.value = sao.bias;
        controls.scale.value = sao.scale;
        controls.minResolution.value = sao.minResolution;
        controls.numSamples.value = sao.numSamples;
        controls.blendCutoff.value = sao.blendCutoff;
        controls.blendFactor.value = sao.blendFactor;

        setLabel(valueLabels.intensity, sao.intensity);
        setLabel(valueLabels.kernelRadius, sao.kernelRadius, 0);
        setLabel(valueLabels.bias, sao.bias);
        setLabel(valueLabels.scale, sao.scale);
        setLabel(valueLabels.minResolution, sao.minResolution);
        setLabel(valueLabels.numSamples, sao.numSamples, null);
        setLabel(valueLabels.blendCutoff, sao.blendCutoff);
        setLabel(valueLabels.blendFactor, sao.blendFactor);
    };

    const bindRange = (input, prop, decimals = 2, round = false) => {
        if (!input) return;
        input.addEventListener("input", () => {
            let value = parseFloat(input.value);
            if (round) {
                value = Math.round(value);
            }
            sao[prop] = value;
            const label = valueLabels[prop];
            setLabel(label, value, round ? null : decimals);
            requestSaoRender();
        });
    };

    if (controls.enabled) {
        controls.enabled.addEventListener("change", () => {
            sao.enabled = controls.enabled.checked;
            requestSaoRender();
        });
    }

    if (controls.blur) {
        controls.blur.addEventListener("change", () => {
            sao.blur = controls.blur.checked;
            requestSaoRender();
        });
    }
    
    bindRange(controls.intensity, "intensity");
    bindRange(controls.kernelRadius, "kernelRadius", 0, true);
    bindRange(controls.bias, "bias");
    bindRange(controls.scale, "scale");
    bindRange(controls.minResolution, "minResolution");
    bindRange(controls.numSamples, "numSamples", null, true);
    bindRange(controls.blendCutoff, "blendCutoff");
    bindRange(controls.blendFactor, "blendFactor");

    const togglePanel = (forceState) => {
        const shouldOpen = typeof forceState === "boolean" ? forceState : saoPanel.hidden;
        saoPanel.hidden = !shouldOpen;
        toggleButton.classList.toggle("active", shouldOpen);
        if (shouldOpen) {
            syncFromSao();
        }
    };

    toggleButton.addEventListener("click", () => togglePanel());
    closeButton.addEventListener("click", () => togglePanel(false));

    document.addEventListener("click", (event) => {
        const isClickInsidePanel = saoPanel.contains(event.target);
        const isToggle = toggleButton.contains(event.target);
        if (!saoPanel.hidden && !isClickInsidePanel && !isToggle) {
            togglePanel(false);
        }
    });

    syncFromSao();
    window.toggleSAOSettings = togglePanel;
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
    IFC_EST: { position: [-8.8, 0.4, 22.5] },
    //IFC_LOG_TEF: { position: [0.15, 0, -0.17], rotation: [0, 90, 0] },
    //IFC_ELE: { position: [0.15, 0, -0.17] },
    //IFC_ECX: { position: [-14.08, 0, 0] },
    //IFC_SAN: { position: [0.2, 0, 13.9], rotation: [0, 90, 0] },
    //IFC_INC: { position: [0.15, 0, -0.15], rotation: [0, 90, 0] },
    //IFC_HID: { position: [0.2, 0, 13.9], rotation: [0, 90, 0] },
    //IFC_PLU: { position: [0.2, 0, 13.9], rotation: [0, 90, 0] },
    //IFC_GLP: { position: [13.03, 0, -14.05] },
    IFC_ARQ: { position: [0.16, 0, 13.9], rotation: [0, 90, 0]  },
    //IFC_EST_SUB: { position: [-41.57, 0.4, 15.5], rotation: [0, 90, 0]  },
    //IFC_CLI_DUT: { position: [13, 0, 0], rotation: [0, 90, 0]  },
    //IFC_EXA: { position: [13.03, 0, -14.05] },
    //IFC_CLI: { position: [-0.5, 0, -14.05] },
    //IFC_EST_CT: { position: [-54, 0, -5.3] },
    //IFC_ALI: { position: [0.15, 0, -0.17] },
    IFC_EST_SQD: { position: [18.1, -0.4, -13.92] },
    IFC_EST_SUB: { position: [27.66, -0.4, -22.35], rotation: [0, -84, 0] },
    IFC_EST_CT: { position: [-14.4, -0.4, -16.27], rotation: [0, 90, 0]  },
    IFC_EST_MR: { position: [35.25, 0, 20.2], rotation: [0, 90, 0]  },
    IFC_EST_MRC: { position: [-22.95, -0.65, 28.88] },
};

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

setupSAOControls();
setupTransformPanelControls();
/**
 * Reseta a visibilidade de todos os objetos e remove qualquer destaque ou raio-x.
 */
function resetModelVisibility() {
    if (modelIsolateController) {
        // Volta a exibir todos os objetos
        modelIsolateController.setObjectsVisible(modelIsolateController.getObjectsIds(), true);
        // Remove X-ray
        modelIsolateController.setObjectsXRayed(modelIsolateController.getObjectsIds(), false);
        // Remove destaque
        modelIsolateController.setObjectsHighlighted(modelIsolateController.getObjectsIds(), false);
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

    if (transformModelSelect && !transformModelSelect.value) {
        transformModelSelect.value = model.id;
    }

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

/**
 * Função NOVO: Cria uma grade no plano do solo (elevação mínima Y).
 */
function createGroundGrid() {
    // Pega o Bounding Box de toda a cena para centralizar e posicionar no solo
    const aabb = viewer.scene.getAABB(); 
    
    // Determina a elevação do solo (o valor Y mínimo do AABB)
    // O xeokit usa a convenção [minX, minY, minZ, maxX, maxY, maxZ]
    const groundY = aabb[1]; 

    // Cria a geometria da grade
    const geometryArrays = buildGridGeometry({
        size: 100, // Tamanho da grade (100x100 metros)
        divisions: 50 // 50 divisões (linhas)
    });

    // Cria o LineSet para renderizar a grade
    new LineSet(viewer.scene, {
        positions: geometryArrays.positions,
        indices: geometryArrays.indices,
        color: [0.5, 0.5, 0.5], // Cor cinza suave
        opacity: 0.8,
        // Move a grade para o centro XZ do modelo e para a elevação correta.
        position: [
            (aabb[0] + aabb[3]) / 2, // Centro X
            groundY,                 // Elevação Y
            (aabb[2] + aabb[5]) / 2  // Centro Z
        ]
    });
    
    console.log("Grade do solo criada.");
}

function finalizeInitialSetup() {
    setTimeout(() => {
        viewer.cameraFlight.jumpTo(viewer.scene);
        console.log("Todos os modelos carregados e câmera ajustada para o zoom correto.");
        setMeasurementMode('none', document.getElementById('btnDeactivate'));
        setupModelIsolateController();
        createGroundGrid();
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
    //{ id: "IFC_LOG_TEF", src: "assets/modelo-02.xkt" },
    //{ id: "IFC_ELE", src: "assets/modelo-01.xkt" },
    //{ id: "IFC_SPDA", src: "assets/modelo-03.xkt" },
    //{ id: "IFC_ECX", src: "assets/modelo-04.xkt" },
    //{ id: "IFC_ILUX", src: "assets/modelo-05.xkt" },
    { id: "IFC_EST", src: "assets/modelo-05.xkt" },
    //{ id: "IFC_SAN", src: "assets/modelo-08.xkt" },
    //{ id: "IFC_INC", src: "assets/modelo-09.xkt" },
    //{ id: "IFC_HID", src: "assets/modelo-03.xkt" },
    //{ id: "IFC_PLU", src: "assets/modelo-07.xkt" },
    //{ id: "IFC_GLP", src: "assets/modelo-11.xkt" },
    { id: "IFC_ARQ", src: "assets/modelo-06.xkt" },
    //{ id: "IFC_EST_SUB", src: "assets/modelo-13.xkt" },
    //{ id: "IFC_CLI_DUT", src: "assets/modelo-14.xkt" },
    //{ id: "IFC_EXA", src: "assets/modelo-15.xkt" },
    //{ id: "IFC_CLI", src: "assets/modelo-16.xkt" },
    //{ id: "IFC_EST_CT", src: "assets/modelo-17.xkt" },
    //{ id: "IFC_ALI", src: "assets/modelo-04.xkt" },
    { id: "IFC_EST_SQD", src: "assets/modelo-10.xkt" },
    { id: "IFC_EST_SUB", src: "assets/modelo-11.xkt" },
    { id: "IFC_EST_CT", src: "assets/modelo-12.xkt" },
    { id: "IFC_EST_MR", src: "assets/modelo-13.xkt" },
    { id: "IFC_EST_MRC", src: "assets/modelo-14.xkt" },
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

function desativarMedicao() {
    const deactivateButton = document.getElementById("btnDeactivate");
    setMeasurementMode("none", deactivateButton);
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        desativarMedicao();
    }
});

window.desativar = desativarMedicao;

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

    treeView = new TreeViewPlugin(viewer, {
        containerElement: document.getElementById("treeViewContainer"),
        hierarchy: "containment",
        autoExpandDepth: 2
    });

    setupTreeViewFilter();

    modelIsolateController = viewer.scene.objects;

    // Ouve o evento de "seleção" no TreeView
    treeView.on("nodeClicked", (event) => {
        const entityId = event.entityId;
        
        // Verifica se há alguma entidade associada ao nó
        if (entityId && viewer.scene.getObjectsInSubtree(entityId).length > 0) {
            
            const subtreeIds = viewer.scene.getObjectsInSubtree(entityId);
            
            // Isola (mostra apenas) a parte do modelo (pavimento, por exemplo) clicada
            modelIsolateController.setObjectsXRayed(modelIsolateController.getObjectsIds(), true); // X-ray em TUDO
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
    const container = document.getElementById("treeViewContainer");

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
    const container = document.getElementById('treeViewContainer');
    
    if (container.style.display === 'block') {
        container.style.display = 'none';
        // Ação de "Mostrar Tudo" ao fechar o painel
        resetModelVisibility(); 
    } else {
        container.style.display = 'block';
    }
}

// EXPOR AO ESCOPO GLOBAL para ser chamado pelo 'onclick' do HTML
window.toggleTreeView = toggleTreeView;
window.resetModelVisibility = resetModelVisibility;

// -----------------------------------------------------------------------------
// 6.2 Função de Grade (Grid do Solo com Ligar/Desligar)
// -----------------------------------------------------------------------------
let gradeAtiva = null;

/**
 * Cria uma grade se não existir, ou alterna sua visibilidade.
 */
function toggleGrid() {
    const aabb = viewer.scene.getAABB();

    if (!gradeAtiva) {
        const groundY = aabb[1];
        const geometryArrays = buildGridGeometry({
            size: 200,
            divisions: 50
        });

        gradeAtiva = new LineSet(viewer.scene, {
            positions: geometryArrays.positions,
            indices: geometryArrays.indices,
            color: [0.5, 0.5, 0.5],
            opacity: 0.8,
            position: [
                (aabb[0] + aabb[3]) / 2,
                groundY,
                (aabb[2] + aabb[5]) / 2
            ],
            visible: true
        });

        console.log("🟩 Grade criada e ativada.");
    } else {
        gradeAtiva.visible = !gradeAtiva.visible;
        console.log(gradeAtiva.visible ? "🟩 Grade ativada" : "⬜ Grade desativada");
    }
}

// Exportar para escopo global (para o botão no HTML)
window.toggleGrid = toggleGrid;

// -----------------------------------------------------------------------------
// 7. Plano de Corte (Section Plane) - VERSÃO ESTÁVEL (MANTIDO)
// -----------------------------------------------------------------------------
// ... setupSectionPlane (função que não é mais usada, mas mantida por segurança) ...

function toggleSectionPlane(button) {
    const scene = viewer.scene;

    // cria o plugin e o plano na primeira vez
    if (!horizontalSectionPlane) {
        sectionPlanesPlugin = new SectionPlanesPlugin(viewer);

        const aabb = scene.getAABB();
        const modelCenterY = (aabb[1] + aabb[4]) / 2;

        horizontalSectionPlane = sectionPlanesPlugin.createSectionPlane({
            id: "horizontalPlane",
            pos: [0, modelCenterY, 0],
            dir: [0, -1, 0],
            active: false
        });

        console.log("Plano de corte criado sob demanda.");
    }

    // --- DESATIVAR ---
    if (horizontalSectionPlane.active) {
        horizontalSectionPlane.active = false;
        scene.sectionPlanes.active = false;

        // destrói o controle, remove listeners e força redraw
        if (horizontalSectionPlane.control) {
            try {
                viewer.input.removeCanvasElement(horizontalSectionPlane.control.canvas);
            } catch (e) {}
            horizontalSectionPlane.control.destroy();
            horizontalSectionPlane.control = null;
        }

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

    horizontalSectionPlane.pos = [0, modelCenterY, 0];
    horizontalSectionPlane.dir = [0, -1, 0];
    horizontalSectionPlane.active = true;
    scene.sectionPlanes.active = true;

    // cria novamente o controle
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

// Cria o menu de contexto
const materialContextMenu = new ContextMenu({
    enabled: true,
    items: [
        [
            {
                title: "Propriedades do Material",
                doAction: function (context) {
                    const entity = context.entity;
                    if (!entity || !entity.id) {
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
                    document.getElementById("closePropertyPanel").onclick = () => {
                        painel.remove();
                    };
                }
            }
        ],
        [
            {
                title: "Ocultar",
                getEnabled: (context) => context.entity.visible,
                doAction: (context) => {
                    context.entity.visible = false;
                }
            },
            {
                title: "Isolar",
                doAction: (context) => {
                    const scene = context.viewer.scene;
                    const entity = context.entity;
                    const metaObject = viewer.metaScene.metaObjects[entity.id];
                    if (!metaObject) return;
                    scene.setObjectsVisible(scene.visibleObjectIds, false);
                    scene.setObjectsXRayed(scene.xrayedObjectIds, false);
                    scene.setObjectsSelected(scene.selectedObjectIds, false);
                    metaObject.withMetaObjectsInSubtree((mo) => {
                        const e = scene.objects[mo.id];
                        if (e) e.visible = true;
                    });
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
                doAction: (context) => {
                    const scene = context.viewer.scene;
                    scene.setObjectsVisible(scene.objectIds, true);
                    scene.setObjectsXRayed(scene.xrayedObjectIds, false);
                    scene.setObjectsSelected(scene.selectedObjectIds, false);
                }
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


