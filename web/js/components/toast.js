export function showToast(msg, type = "info", duration = 3000) {
  const root = document.getElementById("toast-root");
  const t = document.createElement("div");
  t.className = "toast" + (type === "error" ? " error" : "");
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.remove(), duration);
}
