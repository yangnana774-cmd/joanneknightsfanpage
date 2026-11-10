const translations = document.querySelectorAll("[data-zh][data-en]");
let language = "zh";
try {
  language = localStorage.getItem("jk-language") === "en" ? "en" : "zh";
} catch {}
function setLanguage(lang) {
  language = lang;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  translations.forEach((el) => {
    el.innerHTML = el.dataset[lang];
  });
  document
    .querySelectorAll("[data-lang]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.lang === lang)),
    );
  const active = document.querySelector("nav [aria-current] span");
  if (active) document.title = active.textContent + " | Joanne Knights";
  document.dispatchEvent(new CustomEvent("jk-language-change"));
  try {
    localStorage.setItem("jk-language", lang);
  } catch {}
}
document
  .querySelectorAll("[data-lang]")
  .forEach((button) =>
    button.addEventListener("click", () => setLanguage(button.dataset.lang)),
  );
setLanguage(language);
const menu = document.querySelector(".menu-toggle");
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  document.querySelector("nav").classList.toggle("open", open);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    menu.setAttribute("aria-expanded", "false");
    document.querySelector("nav").classList.remove("open");
  }
});
const dialog = document.querySelector("#lightbox");
if (dialog) {
  document.addEventListener("click", (event) => {
    const item = event.target.closest(".gallery-item");
    if (!item) return;
    const source = item.querySelector("img");
    const full = dialog.querySelector("img");
    full.src = source.src;
    full.alt = source.alt;
    if (!dialog.open) dialog.showModal();
  });
  dialog
    .querySelector(".close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
