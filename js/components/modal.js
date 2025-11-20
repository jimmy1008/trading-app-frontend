const toElement = target =>
  typeof target === "string" ? document.getElementById(target) : target;

export function showModal(target) {
  const el = toElement(target);
  if (el) el.classList.remove("hidden");
}

export function hideModal(target) {
  const el = toElement(target);
  if (el) el.classList.add("hidden");
}

export function bindOverlayClose(target) {
  const el = toElement(target);
  if (!el) return;
  el.addEventListener("click", e => {
    if (e.target === el) hideModal(el);
  });
}
