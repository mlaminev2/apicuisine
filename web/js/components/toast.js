const ICONS = { info: "ℹ️", success: "✅", error: "⚠️" };

export function showToast(msg, type = "info", duration = 3000) {
  const root = document.getElementById("toast-root");
  // Les messages de succès existants se terminent par "✓" — on les détecte
  const kind = type === "info" && /✓\s*$/.test(msg) ? "success" : type;
  const t = document.createElement("div");
  t.className = "toast" + (kind !== "info" ? ` ${kind}` : "");
  t.setAttribute("role", kind === "error" ? "alert" : "status");
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = ICONS[kind] || ICONS.info;
  const text = document.createElement("span");
  text.textContent = msg;
  t.append(icon, text);
  root.appendChild(t);

  const dismiss = () => {
    if (!t.isConnected) return;
    t.classList.add("toast-out");
    t.addEventListener("animationend", () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 400); // filet si animationend ne part pas
  };
  t.onclick = dismiss;
  setTimeout(dismiss, duration);
}
