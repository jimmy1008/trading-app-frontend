import {
    apiGet,
    apiPost,
    apiPut,
    apiDelete
} from "../../js/api.js";

const RECORDS_KEY = "tradeRecords";
const CUSTOM_TAGS_KEY = "customRecordTags";
const SIDE_LABELS = {
    long: "\u505a\u591a",
    short: "\u505a\u7a7a"
};
const RESULT_LABELS = {
    win: "\u6b62\u76c8",
    loss: "\u6b62\u640d",
    exit: "\u63d0\u524d\u51fa\u5834",
    open: "\u6301\u5009\u4e2d"
};

const DEFAULT_TAGS = ["\u69d3\u687f", "\u6536\u76ca\u7387", "\u624b\u7e8c\u8cbb", "\u5009\u4f4d\u5927\u5c0f", "\u98a8\u96aa\u6bd4"];
const EXTRA_KEY_MAP = {
    leverage: ["\u69d3\u687f", "\u69d3\u687f\u500d\u6578", "\u500d\u6578"],
    summary: ["\u6458\u8981", "\u5099\u8a3b"],
    exit: ["\u7d50\u679c", "\u6b62\u76c8", "\u6b62\u640d", "\u63d0\u524d\u51fa\u5834"],
    timeline: ["\u6458\u8981", "\u7b56\u7565"]
};

function getExtraValue(record, keys = [], fallbackToFirst = false) {
    if (!record?.extra) return "";
    for (const key of keys) {
        if (record.extra[key]) return record.extra[key];
    }
    if (fallbackToFirst) {
        const firstKey = Object.keys(record.extra)[0];
        return firstKey ? record.extra[firstKey] : "";
    }
    return "";
}

function normalizeSide(value) {
    if (!value) return "";
    if (SIDE_LABELS[value]) return value;
    const entry = Object.entries(SIDE_LABELS).find(([, label]) => label === value);
    return entry ? entry[0] : value;
}

function normalizeResult(value) {
    if (!value) return "";
    if (RESULT_LABELS[value]) return value;
    const entry = Object.entries(RESULT_LABELS).find(([, label]) => label === value);
    return entry ? entry[0] : value;
}

function formatDateOnly(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
    }
    return typeof value === "string" ? value.slice(0, 10) : "";
}

function formatDateTimeDisplay(value) {
    if (!value) return "";
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    const pad = num => String(num).padStart(2, "0");
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateToMs(value) {
    const date = value ? new Date(value) : null;
    return date && !isNaN(date.getTime()) ? date.getTime() : 0;
}

function normalizeRecord(record = {}) {
    const normalizedSide = normalizeSide(record.side || "");
    const normalizedResult = normalizeResult(record.result || "");
    const tradedAtValue = record.traded_at || record.date || null;
    return {
        ...record,
        id: Number(record.id ?? record.recordId ?? Date.now()),
        side: normalizedSide || record.side || "",
        result: normalizedResult || record.result || "",
        pnl: record.pnl_usdt ?? record.pnl ?? 0,
        pnl_pct: record.pnl_pct ?? null,
        margin_usdt: record.margin_usdt ?? null,
        summary: record.summary || "",
        tags: record.tags || [],
        image: record.image_url || record.image || "",
        extra: record.extra_fields || record.extra || {},
        traded_at: tradedAtValue,
        date: tradedAtValue ? formatDateOnly(tradedAtValue) : (record.date || "")
    };
}

function renderRecordCards(list = []) {
    tradeRecords = list
        .map(normalizeRecord)
        .sort((a, b) => dateToMs(b.traded_at) - dateToMs(a.traded_at));
    renderRecords();
}

function upsertRecord(record) {
    if (!record) return;
    const normalized = normalizeRecord(record);
    const idx = tradeRecords.findIndex(item => item.id === normalized.id);
    if (idx >= 0) {
        tradeRecords[idx] = normalized;
    } else {
        tradeRecords.unshift(normalized);
    }
    tradeRecords.sort((a, b) => dateToMs(b.traded_at) - dateToMs(a.traded_at));
    renderRecords();
}

function removeRecordById(id) {
    tradeRecords = tradeRecords.filter(record => record.id !== id);
    renderRecords();
}

async function refreshRecordsFromApi() {
    try {
        const list = await apiGet("/records");
        renderRecordCards(list);
    } catch (err) {
        console.error(err);
        alert("無法載入紀錄，請重新登入");
        tradeRecords = [];
        renderRecords();
    }
}

let tradeRecords = [];
let customTags = [];
let activeTagInputs = {};
let currentImageDataUrl = "";
let editingId = null;
let detailDirty = false;
let detailInitial = null;

const $id = id => document.getElementById(id);

function loadRecords() {
    tradeRecords = [];
}
function saveRecords() {
    // backend handles persistence
}
function loadCustomTags() {
    try {
        customTags = JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY) || "[]");
        if (!Array.isArray(customTags)) customTags = [];
    } catch {
        customTags = [];
    }
}
function saveCustomTags() {
    localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(customTags));
}

function createTagChip(label) {
    const chip = document.createElement("button");
    chip.className = "tag-chip";
    chip.textContent = label;
    chip.dataset.tag = label;

    chip.addEventListener("click", () => {
        if (chip.classList.contains("active")) {
            chip.classList.remove("active");
            removeExtraField(label);
        } else {
            chip.classList.add("active");
            addExtraField(label);
        }
    });

    return chip;
}

function renderTagChips() {
    const box = $id("record-tag-chips");
    if (!box) return;

    box.innerHTML = "";

    const allTags = DEFAULT_TAGS.concat(customTags);

    allTags.forEach(tag => box.appendChild(createTagChip(tag)));

    renderTagEditList();
}

function addExtraField(tag) {
    if (activeTagInputs[tag]) return;

    const container = $id("record-extra-fields") || $id("record-bottom");
    if (!container) return;

    const line = document.createElement("div");
    line.className = "extra-field-line";
    line.dataset.tag = tag;

    const label = document.createElement("div");
    label.className = "extra-field-label";
    label.textContent = tag;

    const input = document.createElement("input");
    input.className = "extra-field-input";
    input.placeholder = `\u8f38\u5165 ${tag}`;

    const del = document.createElement("span");
    del.className = "extra-field-remove";
    del.textContent = "x";

    del.addEventListener("click", () => {
        delete activeTagInputs[tag];
        line.remove();
        const chip = document.querySelector(`.tag-chip[data-tag='${tag}']`);
        if (chip) chip.classList.remove("active");
    });

    line.appendChild(label);
    line.appendChild(input);
    line.appendChild(del);

    container.appendChild(line);

    activeTagInputs[tag] = input;
}

function removeExtraField(tag) {
    const line = document.querySelector(`#record-extra-fields .extra-field-line[data-tag='${tag}']`) 
              || document.querySelector(`#record-bottom .extra-field-line[data-tag='${tag}']`);
    if (line) line.remove();

    if (activeTagInputs[tag]) delete activeTagInputs[tag];

    const chip = document.querySelector(`.tag-chip[data-tag='${tag}']`);
    if (chip) chip.classList.remove("active");
}

function resetRecordModal() {
    activeTagInputs = {};
    currentImageDataUrl = "";
    editingId = null;

    const today = new Date().toISOString().slice(0, 10);

    const preset = {
        "record-symbol": "",
        "record-date": today,
        "record-side": "",
        "record-result": "",
        "record-pnl": "",
        "record-summary": ""
    };

    for (let id in preset) {
        const el = $id(id);
        if (el) el.value = preset[id];
    }

    const area = $id("record-bottom");
    if (area) {
        [...area.querySelectorAll(".extra-field-line")].forEach(n => n.remove());
    }

    document.querySelectorAll("#record-tag-chips .tag-chip.active")
        .forEach(c => c.classList.remove("active"));

    const preview = $id("record-image-preview");
    const placeholder = $id("record-image-placeholder");

    if (preview) {
        preview.src = "";
        preview.classList.add("hidden");
    }
    if (placeholder) placeholder.classList.remove("hidden");
}

function openRecordModal() {
    resetRecordModal();
    const bg = $id("record-modal-bg");
    if (bg) {
        bg.classList.remove("hidden");
        bg.style.display = "flex";
    }
}

async function refreshBalancesBeforeModal() {
    const service = window.__appServices?.refreshBalances;
    if (typeof service === "function") {
        await service();
    }
}

function closeRecordModal() {
    const bg = $id("record-modal-bg");
    if (bg) {
        bg.classList.add("hidden");
        bg.style.display = "none";
    }
}

async function handleRecordSubmit() {
    const data = {
        id: Date.now(),
        symbol: $id("record-symbol")?.value.trim() || "",
        date: $id("record-date")?.value || "",
        side: normalizeSide($id("record-side")?.value || ""),
        result: normalizeResult($id("record-result")?.value || ""),
        pnl: $id("record-pnl")?.value.trim() || "",
        summary: $id("record-summary")?.value.trim() || "",
        image: currentImageDataUrl,
        extra: {}
    };

    if (!data.symbol || !data.date) {
        alert("\u8acb\u8f38\u5165\u5e63\u7a2e\u8207\u6642\u9593");
        return;
    }

    for (const tag in activeTagInputs) {
        const input = activeTagInputs[tag];
        if (input.value.trim()) data.extra[tag] = input.value.trim();
    }

    try {
        const created = await apiPost("/records", buildRecordPayload(data));
        upsertRecord(created);
        alert("新增成功");
        resetRecordModal();
        closeRecordModal();
    } catch (err) {
        console.error(err);
        alert("建立紀錄失敗，請稍後再試");
    }
}

function buildRecordPayload(record) {
    const extra = record.extra && Object.keys(record.extra).length ? record.extra : null;
    const tradedAt = record.traded_at || record.date || null;
    const parseOrNull = value => {
        if (value === undefined || value === null || value === "") return null;
        const num = Number(value);
        return isNaN(num) ? null : num;
    };
    return {
        symbol: record.symbol || "",
        side: record.side || null,
        result: record.result || null,
        leverage: parseOrNull(record.leverage),
        margin_usdt: parseOrNull(record.margin_usdt),
        pnl_usdt: parseOrNull(record.pnl ?? record.pnl_usdt),
        pnl_pct: parseOrNull(record.pnl_pct),
        summary: record.summary || null,
        tags: record.tags || (extra ? Object.keys(extra) : []),
        traded_at: tradedAt ? new Date(tradedAt).toISOString() : null,
        image_url: record.image || record.image_url || null,
        extra_fields: extra
    };
}

function renderRecords() {
    const box = $id("records-container");
    if (!box) return;

    box.innerHTML = "";

    const list = tradeRecords.slice();

    if (list.length === 0) {
        box.innerHTML = `<div class="no-record">\u5c1a\u7121\u7d00\u9304</div>`;
        renderDashboardInsights();
        return;
    }

    list.forEach(r => {
        const card = document.createElement("div");
        card.className = "record-card";
        card.dataset.id = r.id;
        card.draggable = false;

        const media = r.image
            ? `<img src="${r.image}" class="record-card-img" alt="\u7d00\u9304\u622a\u5716" />`
            : `<div class="record-card-placeholder"><span class="placeholder-icon"></span></div>`;
        const sideLabel = SIDE_LABELS[r.side] || (r.side || "-");

        const summary = r.summary ? r.summary : "無摘要資訊";
        const tagList = Object.keys(r.extra || {});
        const hoverTags = tagList.length
            ? `<div class="record-hover-tags">${tagList.slice(0,3).map(tag => `<span class="record-hover-tag">${tag}</span>`).join("")}</div>`
            : "";
        card.innerHTML = `
            <div class="record-card-media">
                ${media}
            </div>
            <div class="record-card-body">
                <div class="record-card-symbol">${r.symbol || "-"}</div>
                <div class="record-card-date">${r.date || ""}</div>
                <div class="record-card-meta">
                    <span>${sideLabel}</span>
                    <span>${r.pnl || "-"}</span>
                </div>
                <div class="record-card-hover">
                    <div>${summary}</div>
                    ${hoverTags}
                </div>
            </div>
        `;

        card.addEventListener("pointerdown", handleCardPointerDown);
        card.addEventListener("click", handleCardClick);

        box.appendChild(card);
    });

    renderDashboardInsights();
}

let draggingId = null;
let dragActive = false;
let justDragged = false;
let dragState = {
    card: null,
    placeholder: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    container: null,
    prevTransition: ""
};
const DRAG_THRESHOLD = 6;

function handleCardPointerDown(e) {
    const card = e.currentTarget;
    draggingId = card.dataset.id;
    dragState.card = card;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.container = $id("records-container");
    dragActive = false;

    window.addEventListener("pointermove", handleCardPointerMove, { capture: true });
    window.addEventListener("pointerup", handleCardPointerUp, { capture: true });
    window.addEventListener("pointercancel", handleCardPointerUp, { capture: true });
    if (e.pointerId !== undefined && card.setPointerCapture) {
        try { card.setPointerCapture(e.pointerId); } catch {}
    }
}

function startVisualDrag(e) {
    const card = dragState.card;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragState.offsetX = e.clientX - rect.left;
    dragState.offsetY = e.clientY - rect.top;

    const placeholder = document.createElement("div");
    placeholder.className = "record-card placeholder";
    placeholder.style.width = rect.width + "px";
    placeholder.style.height = rect.height + "px";
    card.parentNode.insertBefore(placeholder, card.nextSibling);
    dragState.placeholder = placeholder;

    dragState.prevTransition = card.style.transition;
    card.style.width = rect.width + "px";
    card.style.height = rect.height + "px";
    card.style.position = "fixed";
    card.style.left = rect.left + "px";
    card.style.top = rect.top + "px";
    card.style.zIndex = "999";
    card.style.pointerEvents = "none";
    card.style.transition = "none";
    card.classList.add("dragging");
    dragActive = true;
}

function handleCardPointerMove(e) {
    if (!dragState.card) return;
    const moveDist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    if (!dragActive && moveDist > DRAG_THRESHOLD) {
        startVisualDrag(e);
    }
    if (!dragActive) return;

    const card = dragState.card;
    card.style.left = e.clientX - dragState.offsetX + "px";
    card.style.top = e.clientY - dragState.offsetY + "px";

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dropCard = target?.closest(".record-card:not(.dragging):not(.placeholder)");
    if (dropCard && dropCard.parentNode === dragState.container && dragState.placeholder) {
        const rect = dropCard.getBoundingClientRect();
        const isHorizontal = dragState.container?.classList?.contains("records-scroll");
        const before = isHorizontal
            ? e.clientX - rect.left < rect.width / 2
            : e.clientY - rect.top < rect.height / 2;
        if (before) {
            dragState.container.insertBefore(dragState.placeholder, dropCard);
        } else {
            dragState.container.insertBefore(dragState.placeholder, dropCard.nextSibling);
        }
    }
}

function handleCardPointerUp(e) {
    const card = dragState.card;
    const placeholder = dragState.placeholder;
    const container = dragState.container;

    if (dragActive && card && placeholder && container) {
        container.insertBefore(card, placeholder);
        placeholder.remove();

        card.style.position = "";
        card.style.left = "";
        card.style.top = "";
        card.style.width = "";
        card.style.height = "";
        card.style.zIndex = "";
        card.style.pointerEvents = "";
        card.style.transition = dragState.prevTransition;
        card.classList.remove("dragging");

        const order = [...container.children].map(c => c.dataset.id);
        tradeRecords.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
        saveRecords();
    } else if (card && !dragActive) {
        openDetail(card.dataset.id);
    }

    window.removeEventListener("pointermove", handleCardPointerMove, true);
    window.removeEventListener("pointerup", handleCardPointerUp, true);
    window.removeEventListener("pointercancel", handleCardPointerUp, true);
    if (e.pointerId !== undefined && card?.releasePointerCapture) {
        try { card.releasePointerCapture(e.pointerId); } catch {}
    }

    dragState = { card: null, placeholder: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0, container: null, prevTransition: "" };
    draggingId = null;
    if (dragActive) {
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 0);
    }
    dragActive = false;
}

function handleCardClick(e) {
    if (dragActive || justDragged) return;
    const card = e.currentTarget;
    if (!card) return;
    openDetail(card.dataset.id);
}


function openDetail(id) {
    const r = tradeRecords.find(x => x.id == id);
    if (!r) return;

    editingId = id;
    detailDirty = false;
    detailInitial = JSON.stringify(r);

    const preview = $id("detail-image-preview");
    const placeholder = $id("detail-image-placeholder");

    if (r.image) {
        preview.src = r.image;
        preview.classList.remove("hidden");
        placeholder.classList.add("hidden");
    } else {
        preview.src = "";
        preview.classList.add("hidden");
        placeholder.classList.remove("hidden");
    }

    $id("detail-symbol").value = r.symbol;
    $id("detail-date").value = r.date;
    const normalizedSide = normalizeSide(r.side);
    const normalizedResult = normalizeResult(r.result);
    r.side = normalizedSide;
    r.result = normalizedResult;
    $id("detail-side").value = normalizedSide;
    $id("detail-result").value = normalizedResult;
    $id("detail-pnl").value = r.pnl;
    $id("detail-summary").value = r.summary;

    const extraBox = $id("detail-extra-fields");
    extraBox.innerHTML = "";

    for (let tag in r.extra) {
        const line = document.createElement("div");
        line.className = "extra-field-line";

        line.innerHTML = `
            <div class="extra-field-label">${tag}</div>
            <input class="extra-field-input detail-extra-input" data-tag="${tag}" value="${r.extra[tag]}">
            <span class="extra-field-remove detail-extra-remove">x</span>
        `;

        line.querySelector(".detail-extra-remove").addEventListener("click", () => {
            line.remove();
        });

        extraBox.appendChild(line);
    }

    const detailBg = $id("detail-bg");
    const drawer = $id("detail-drawer");
    if (detailBg) {
        detailBg.classList.remove("hidden");
        detailBg.style.display = "flex";
    }
    if (drawer) {
        drawer.classList.remove("translate-x-full");
    }
    toggleDetailEdit(false);
    document.querySelectorAll(".detail-extra-input").forEach(inp => {
        inp.addEventListener("input", detailFieldChanged);
        inp.addEventListener("change", detailFieldChanged);
    });
}

function toggleDetailEdit(enable) {
    const fields = [
        "detail-symbol",
        "detail-date",
        "detail-side",
        "detail-result",
        "detail-pnl",
        "detail-summary"
    ];

    fields.forEach(id => {
        const el = $id(id);
        enable ? el.removeAttribute("disabled") : el.setAttribute("disabled", "disabled");
    });

    document.querySelectorAll(".detail-extra-input").forEach(inp => {
        enable ? inp.removeAttribute("disabled") : inp.setAttribute("disabled", "disabled");
    });

    const toggle = (el, show) => {
        if (!el) return;
        el.classList.toggle("hidden", !show);
    };
    toggle($id("detail-edit"), !enable);
    toggle($id("detail-delete"), !enable);
    toggle($id("detail-save"), enable);
    toggle($id("detail-cancel"), enable);
    updateCancelText();
}

async function saveDetail() {
    if (editingId == null) return;
    const updated = collectDetailRecord();
    try {
        const response = await apiPut(`/records/${editingId}`, buildRecordPayload(updated));
        upsertRecord(response);
        detailDirty = false;
        detailInitial = JSON.stringify(normalizeRecord(response));
        alert("已更新");
        closeDetail();
    } catch (err) {
        console.error(err);
        alert("更新失敗，請稍後再試");
    }
}

function collectDetailRecord() {
    const record = {
        id: editingId,
        symbol: $id("detail-symbol")?.value.trim() || "",
        date: $id("detail-date")?.value || "",
        side: normalizeSide($id("detail-side")?.value || ""),
        result: normalizeResult($id("detail-result")?.value || ""),
        pnl: $id("detail-pnl")?.value.trim() || "",
        summary: $id("detail-summary")?.value.trim() || "",
        extra: {}
    };

    const preview = $id("detail-image-preview");
    if (preview && !preview.classList.contains("hidden") && preview.src) {
        record.image = preview.src;
    }

    document.querySelectorAll(".detail-extra-input").forEach(input => {
        const tag = input.dataset.tag;
        if (tag && input.value.trim()) record.extra[tag] = input.value.trim();
    });

    return record;
}

function detailFieldChanged() {
    detailDirty = true;
    updateCancelText();
}

function updateCancelText() {
    const cancelBtn = $id("detail-cancel");
    if (!cancelBtn) return;
    cancelBtn.textContent = detailDirty ? "\u53d6\u6d88\u8b8a\u66f4" : "\u95dc\u9589";
}

function deleteDetail() {
    $id("delete-dialog-bg").style.display = "flex";
}

async function confirmDeleteYes() {
    if (editingId == null) return;
    try {
        await apiDelete(`/records/${editingId}`);
        removeRecordById(editingId);
        alert("已刪除");
        closeDetail();
    } catch (err) {
        console.error(err);
        alert("刪除失敗，請稍後再試");
    } finally {
        const dialog = $id("delete-dialog-bg");
        if (dialog) dialog.style.display = "none";
    }
}

function confirmDeleteNo() {
    $id("delete-dialog-bg").style.display = "none";
}

function closeDetail() {
    const detailBg = $id("detail-bg");
    const drawer = $id("detail-drawer");
    if (drawer) drawer.classList.add("translate-x-full");
    if (detailBg) {
        const hide = () => {
            detailBg.classList.add("hidden");
            detailBg.style.display = "none";
        };
        if (drawer) {
            setTimeout(hide, 250);
        } else {
            hide();
        }
    }
    editingId = null;
    detailDirty = false;
    detailInitial = null;
}

function setupImageUpload() {
    const quickArea = $id("record-image-area");
    const quickInput = $id("record-image-input");

    if (quickArea && quickInput) {
        quickArea.addEventListener("click", () => quickInput.click());

        quickInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = ev => {
                currentImageDataUrl = ev.target.result;

                const preview = $id("record-image-preview");
                const placeholder = $id("record-image-placeholder");

                preview.src = currentImageDataUrl;
                preview.classList.remove("hidden");
                placeholder.classList.add("hidden");
            };
            reader.readAsDataURL(file);
        });
    }

    const detailArea = $id("detail-image-area");
    const detailInput = $id("detail-image-input");

    if (detailArea && detailInput) {
        detailArea.addEventListener("click", () => detailInput.click());

        detailInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = ev => {
                const preview = $id("detail-image-preview");
                const placeholder = $id("detail-image-placeholder");

                preview.src = ev.target.result;
                preview.classList.remove("hidden");
                placeholder.classList.add("hidden");
            };
            reader.readAsDataURL(file);
        });
    }
}

async function initRecords() {
    loadCustomTags();
    renderTagChips();

    await refreshRecordsFromApi();
    setupCardClickDelegate();

    setupImageUpload();

    $id("quick-add-btn")?.addEventListener("click", async () => {
        await refreshBalancesBeforeModal();
        openRecordModal();
    });
    $id("record-submit")?.addEventListener("click", handleRecordSubmit);
    $id("record-close")?.addEventListener("click", closeRecordModal);
    $id("record-cancel")?.addEventListener("click", closeRecordModal);

    $id("record-modal-bg")?.addEventListener("click", e => {
        if (e.target.id === "record-modal-bg") closeRecordModal();
    });

    $id("detail-edit")?.addEventListener("click", () => toggleDetailEdit(true));
    $id("detail-cancel")?.addEventListener("click", () => {
        if (detailDirty) {
            saveDetail();
        } else {
            if (editingId != null) {
                openDetail(editingId);
            } else {
                closeDetail();
            }
        }
    });
    $id("detail-save")?.addEventListener("click", saveDetail);
    $id("detail-delete")?.addEventListener("click", deleteDetail);
    $id("detail-close")?.addEventListener("click", closeDetail);

    $id("delete-confirm")?.addEventListener("click", confirmDeleteYes);
    $id("delete-cancel")?.addEventListener("click", confirmDeleteNo);

    setupDetailBackgroundClose();
}

function setupDetailBackgroundClose() {
    const bg = $id("detail-bg");
    if (!bg) return;

    bg.addEventListener("click", e => {
        if (e.target.id === "detail-bg") closeDetail();
    });
}

function renderTagEditList() {
    const list = $id("tag-edit-list");
    if (!list) return;
    list.innerHTML = "";

    customTags.forEach(tag => {
        const chip = document.createElement("div");
        chip.className = "tag-edit-item";
        chip.innerHTML = `<span>${tag}</span><span class="tag-edit-remove" data-tag="${tag}">×</span>`;
        list.appendChild(chip);
    });

    list.querySelectorAll(".tag-edit-remove").forEach(btn => {
        btn.addEventListener("click", () => {
            const tag = btn.dataset.tag;
            customTags = customTags.filter(t => t !== tag);
            saveCustomTags();
            renderTagChips();
        });
    });
}

function setupTagEditor() {
    const addBtn = $id("tag-edit-add");
    const input = $id("tag-edit-input");
    if (addBtn && input) {
        addBtn.addEventListener("click", () => {
            const name = input.value.trim();
            if (!name) return;
            const all = DEFAULT_TAGS.concat(customTags);
            if (all.includes(name)) {
                alert("\u5df2\u5b58\u5728\u76f8\u540c\u6a19\u7c64");
                return;
            }
            customTags.push(name);
            saveCustomTags();
            input.value = "";
            renderTagChips();
        });
    }
}

window.addEventListener("load", () => {
    initRecords();
    setupTagEditor();
    renderTagEditList();

    [
        "detail-symbol",
        "detail-date",
        "detail-side",
        "detail-result",
        "detail-pnl",
        "detail-summary"
    ].forEach(id => {
        const el = $id(id);
        el?.addEventListener("input", detailFieldChanged);
        el?.addEventListener("change", detailFieldChanged);
    });
});

function setupCardClickDelegate() {
    const box = $id("records-container");
    if (!box) return;
    box.addEventListener("click", e => {
        const card = e.target.closest(".record-card");
        if (!card) return;
        openDetail(card.dataset.id);
    });
}

function parseNumber(value) {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
}

function formatChange(value) {
    const num = parseNumber(value);
    const sign = num > 0 ? "+" : "";
    return `${sign}${num} USDT`;
}

function renderDashboardInsights() {
    renderTodayOverview();
    renderSpotlight();
    renderTimeline();
    renderBehaviorInsights();
    renderBestWorst();
}

function renderTodayOverview() {
    const today = new Date().toISOString().slice(0, 10);
    const todayRecords = tradeRecords.filter(r => r.date === today);
    const countEl = $id("today-count");
    if (countEl) countEl.textContent = `${todayRecords.length} 筆`;

    const wins = todayRecords.filter(r => normalizeResult(r.result) === "win").length;
    const winRate = todayRecords.length ? Math.round((wins / todayRecords.length) * 100) : 0;
    const winEl = $id("today-winrate");
    if (winEl) {
        winEl.textContent = `${winRate}%`;
        winEl.classList.remove("text-positive", "text-negative");
        winEl.classList.add(winRate >= 50 ? "text-positive" : "text-negative");
    }

    const svgLine = document.getElementById("today-sparkline-line");
    if (!svgLine) return;
    const ordered = todayRecords.slice().sort((a, b) => a.id - b.id);
    const points = [];
    let cumulative = 0;
    ordered.forEach(record => {
        cumulative += parseNumber(record.pnl);
        points.push(cumulative);
    });
    if (points.length === 0) points.push(0, 0, 0, 0, 0);
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const step = points.length > 1 ? 120 / (points.length - 1) : 120;
    const spark = points
        .map((val, idx) => {
            const x = (idx * step).toFixed(1);
            const y = (40 - ((val - min) / range) * 40).toFixed(1);
            return `${x},${y}`;
        })
        .join(" ");
    svgLine.setAttribute("points", spark);
}

function renderSpotlight() {
    const card = $id("spotlight-card");
    if (!card) return;
    if (!tradeRecords.length) {
        card.classList.add("empty");
        card.innerHTML = '<div class="spotlight-empty">暫無紀錄</div>';
        card.onclick = null;
        card.removeAttribute("data-id");
        return;
    }
    card.classList.remove("empty");
    const latest = tradeRecords.slice().sort((a, b) => b.id - a.id)[0];
    const image = latest.image
        ? `<img src="${latest.image}" alt="${latest.symbol}">`
        : '<div class="spotlight-empty">無圖片</div>';
    const pnlValue = parseNumber(latest.pnl);
    const pnlClass = pnlValue >= 0 ? "pnl-positive" : "pnl-negative";
    const sideLabel = SIDE_LABELS[normalizeSide(latest.side)] || latest.side || "-";
    card.innerHTML = `
      <div class="spotlight-image">${image}</div>
      <div class="spotlight-info">
        <div class="spotlight-meta">
          <div>${[latest.symbol || "-", sideLabel, getExtraValue(latest, EXTRA_KEY_MAP.leverage)]
              .filter(Boolean)
              .join(" · ")}</div>
          <div class="${pnlClass}">${formatChange(latest.pnl)}</div>
        </div>
        <div class="spotlight-meta">
          <div>${latest.date || ""}</div>
          <div>${RESULT_LABELS[normalizeResult(latest.result)] || latest.result || ""}</div>
        </div>
      </div>
    `;
    card.dataset.id = latest.id;
    card.onclick = () => openDetail(latest.id);
}

function renderTimeline() {
    const dots = $id("activity-dots");
    const details = $id("activity-details");
    if (!dots || !details) return;
    const today = new Date();
    const items = [];
    for (let offset = 6; offset >= 0; offset--) {
        const day = new Date(today);
        day.setDate(today.getDate() - offset);
        const key = day.toISOString().slice(0, 10);
        const list = tradeRecords.filter(r => r.date === key);
        const pnl = list.reduce((sum, record) => sum + parseNumber(record.pnl), 0);
        const state = !list.length ? "empty" : pnl >= 0 ? "filled" : "loss";
        items.push({ date: key, list, pnl, state });
    }
    dots.innerHTML = "";
    items.forEach(item => {
        const dot = document.createElement("div");
        dot.className = "timeline-dot";
        dot.dataset.state = item.state;
        dot.dataset.label = item.date.slice(5).replace("-", "/");
        dot.dataset.tooltip = formatChange(item.pnl);
        dot.addEventListener("mouseenter", () => showTimelineDetails(item));
        dot.addEventListener("click", () => showTimelineDetails(item));
        dots.appendChild(dot);
    });
    showTimelineDetails(items[items.length - 1]);
}

function showTimelineDetails(item) {
    const details = $id("activity-details");
    if (!details) return;
    details.classList.remove("hidden");
    if (!item || !item.list.length) {
        details.innerHTML = '<div class="activity-card">當日無交易</div>';
        return;
    }
    details.innerHTML = "";
    item.list.forEach(record => {
        const row = document.createElement("div");
        row.className = "activity-card";
        const side = SIDE_LABELS[normalizeSide(record.side)] || record.side || "";
        row.textContent = `${record.symbol || "-"} ${side} ${formatChange(record.pnl)}`;
        row.addEventListener("click", () => openDetail(record.id));
        details.appendChild(row);
    });
}

function renderBehaviorInsights() {
    const longCount = tradeRecords.filter(r => normalizeSide(r.side) === "long").length;
    const shortCount = tradeRecords.filter(r => normalizeSide(r.side) === "short").length;
    const total = tradeRecords.length || 1;
    const longEl = $id("behavior-long");
    if (longEl) longEl.textContent = `${Math.round((longCount / total) * 100)}%`;
    const shortEl = $id("behavior-short");
    if (shortEl) shortEl.textContent = `${Math.round((shortCount / total) * 100)}%`;

    const leverageValues = tradeRecords
        .map(r => parseFloat(getExtraValue(r, EXTRA_KEY_MAP.leverage)))
        .filter(v => !isNaN(v));
    const avgLeverage =
        leverageValues.length > 0
            ? (leverageValues.reduce((sum, val) => sum + val, 0) / leverageValues.length).toFixed(1)
            : "0";
    const leverageEl = $id("behavior-leverage");
    if (leverageEl) leverageEl.textContent = `${avgLeverage}x`;

    const symbolMap = {};
    tradeRecords.forEach(record => {
        if (!record.symbol) return;
        symbolMap[record.symbol] = (symbolMap[record.symbol] || 0) + 1;
    });
    const favorite = Object.entries(symbolMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
    const favEl = $id("behavior-favorite");
    if (favEl) favEl.textContent = favorite;
}
function renderBestWorst() {
    const bestContainer = $id("best-trades");
    const worstContainer = $id("worst-trades");
    if (!bestContainer || !worstContainer) return;

    const enriched = tradeRecords.map(record => ({
        ...record,
        pnlValue: parseNumber(record.pnl)
    }));
    const best = enriched.slice().sort((a, b) => b.pnlValue - a.pnlValue).filter(r => r.pnlValue > 0).slice(0, 3);
    const worst = enriched.slice().sort((a, b) => a.pnlValue - b.pnlValue).filter(r => r.pnlValue < 0).slice(0, 3);

    const renderList = (container, list) => {
        container.innerHTML = "";
        if (!list.length) {
            container.innerHTML = '<div class="result-item text-gray-400 cursor-default">暫無資料</div>';
            return;
        }
        list.forEach(record => {
            const side = SIDE_LABELS[normalizeSide(record.side)] || record.side || "";
            const pnlClass = record.pnlValue >= 0 ? "pnl-positive" : "pnl-negative";
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `<span>${record.symbol || "-"} ${side}</span><span class="${pnlClass}">${formatChange(record.pnl)}</span>`;
            item.addEventListener('click', () => openDetail(record.id));
            container.appendChild(item);
        });
    };

    renderList(bestContainer, best);
    renderList(worstContainer, worst);
}
