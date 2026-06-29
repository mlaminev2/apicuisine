export function openModal(title, bodyFn, footerFn = null) {
  const root = document.getElementById("modal-root");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const box = document.createElement("div");
  box.className = "modal-box";

  const header = document.createElement("div");
  header.className = "modal-header";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-close";
  closeBtn.textContent = "✕";
  closeBtn.onclick = close;
  header.appendChild(h2);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "modal-body";

  box.appendChild(header);
  box.appendChild(body);

  if (footerFn) {
    const footer = document.createElement("div");
    footer.className = "modal-footer";
    footerFn(footer, close);
    box.appendChild(footer);
  }

  overlay.appendChild(box);
  root.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  bodyFn(body, close);

  function close() { overlay.remove(); }
  return close;
}
