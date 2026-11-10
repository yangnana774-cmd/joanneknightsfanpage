import { BUCKET, isGalleryAdmin, photoUrl } from "./gallery-service.js";

export function createPhotoManager(client) {
  const panel = document.querySelector("#manage-panel");
  const list = document.querySelector("#managed-photos");
  const status = document.querySelector("#manage-status");
  const refreshButton = document.querySelector("#refresh-photos");
  const moreButton = document.querySelector("#more-photos");
  let offset = 0;
  let busy = false;
  let generation = 0;
  function message(text) { status.textContent = text; }
  function hide() {
    generation++;
    panel.hidden = true;
    list.replaceChildren();
  }
  async function load(reset = false) {
    if (busy) return;
    busy = true;
    refreshButton.disabled = moreButton.disabled = true;
    const current = generation;
    try {
      if (reset) { offset = 0; list.replaceChildren(); }
      message("正在读取照片… / Loading photos…");
      const { data, error } = await client.from("gallery_photos")
        .select("id,storage_path,caption_zh,caption_en,created_at")
        .order("created_at", { ascending: false }).order("id")
        .range(offset, offset + 49);
      if (current !== generation) return;
      if (error) throw error;
      for (const photo of data) render(photo);
      offset += data.length;
      moreButton.hidden = data.length < 50;
      message(offset ? "请选择要删除的照片。 / Choose a photo to delete." : "还没有上传照片。 / No uploaded photos yet.");
    } catch {
      if (current === generation) message("无法读取照片，请刷新重试。 / Could not load photos. Try refreshing.");
    } finally {
      busy = false;
      refreshButton.disabled = moreButton.disabled = false;
    }
  }
  function render(photo) {
    const card = document.createElement("article");
    const img = document.createElement("img");
    img.src = photoUrl(client, photo.storage_path);
    img.alt = photo.caption_zh || photo.caption_en || "Joanne";
    img.loading = "lazy";
    const caption = document.createElement("p");
    caption.textContent = photo.caption_zh || photo.caption_en || "Joanne";
    const button = document.createElement("button");
    button.className = "button delete-photo";
    button.type = "button";
    button.textContent = "删除照片 / Delete photo";
    button.addEventListener("click", async () => {
      if (busy || !window.confirm("确定删除这张照片？删除后无法撤销。\nDelete this photo? This cannot be undone.")) return;
      busy = true;
      button.disabled = true;
      const current = generation;
      try {
        if (!(await isGalleryAdmin(client))) throw new Error("登录已失效或没有权限，请重新登录。 / Please sign in again.");
        const { data, error } = await client.from("gallery_photos").delete()
          .eq("id", photo.id).select("id");
        if (error || data?.length !== 1) throw new Error("未能确认删除，请刷新检查；若照片仍在，请检查删除权限。 / Could not confirm deletion. Refresh and check permissions.");
        card.remove();
        offset = Math.max(0, offset - 1);
        const { error: storageError } = await client.storage.from(BUCKET).remove([photo.storage_path]);
        if (current === generation) message(storageError
          ? "照片已从相册移除，但储存文件未能清除，请负责人到 Storage 检查。 / Removed from gallery; storage cleanup failed. Contact the owner."
          : "照片已删除。刷新公开相册即可看到更新。 / Photo deleted. Refresh the public gallery.");
      } catch (error) {
        if (current === generation) message(error.message || "删除失败，请重试。 / Delete failed. Please retry.");
      } finally { busy = false; button.disabled = false; }
    });
    card.append(img, caption, button);
    list.append(card);
  }
  refreshButton.addEventListener("click", () => load(true));
  moreButton.addEventListener("click", () => load());
  return {
    hide,
    async show() { if (panel.hidden) { panel.hidden = false; await load(true); } },
    async refresh() { await load(true); },
  };
}
