import { connectGallery, photoUrl } from "./gallery-service.js";

const grid = document.querySelector("#public-gallery");
const status = document.querySelector("#gallery-status");
const more = document.querySelector("#gallery-more");
const rows = [];
let client;
let offset = 0;
let loading = false;
const PAGE_SIZE = 24;
const english = () => document.documentElement.lang === "en";

function updateCaptions() {
  for (const item of rows) {
    const caption = english() ? item.photo.caption_en : item.photo.caption_zh;
    item.caption.textContent = caption;
    item.image.alt = caption;
    item.button.setAttribute(
      "aria-label",
      `${english() ? "View photo" : "查看照片"}: ${caption}`,
    );
  }
}
document.addEventListener("jk-language-change", updateCaptions);

function addPhoto(photo) {
  const button = document.createElement("button");
  button.className = "gallery-item";
  button.type = "button";
  const image = document.createElement("img");
  image.src = photoUrl(client, photo.storage_path);
  image.loading = "lazy";
  image.decoding = "async";
  const caption = document.createElement("span");
  button.append(image, caption);
  grid.append(button);
  rows.push({ photo, button, image, caption });
}

async function loadPage() {
  if (!client || loading) return;
  loading = true;
  more.disabled = true;
  try {
    const { data, error } = await client
      .from("gallery_photos")
      .select("id,storage_path,caption_zh,caption_en")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    data.forEach(addPhoto);
    offset += data.length;
    more.hidden = data.length < PAGE_SIZE;
    status.hidden = true;
    updateCaptions();
  } catch {
    status.textContent =
      "暂时无法加载新照片，请稍后刷新。 / New photos are temporarily unavailable. Please refresh later.";
    status.hidden = false;
  } finally {
    loading = false;
    more.disabled = false;
  }
}
more.addEventListener("click", loadPage);

async function initialize() {
  try {
    client = await connectGallery(false);
    if (!client) return; // Keep the existing photo visible before cloud setup.
    await loadPage();
  } catch {
    status.textContent =
      "暂时无法加载新照片，请稍后刷新。 / New photos are temporarily unavailable. Please refresh later.";
    status.hidden = false;
  }
}
initialize();
