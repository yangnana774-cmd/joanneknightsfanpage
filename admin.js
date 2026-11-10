import { createPhotoManager } from "./admin-photos.js";
import {
  ALLOWED_TYPES,
  BUCKET,
  connectGallery,
  isGalleryAdmin,
  validatePhoto,
} from "./gallery-service.js";

const status = document.querySelector("#connection-status");
const loginPanel = document.querySelector("#login-panel");
const uploadPanel = document.querySelector("#upload-panel");
const loginForm = document.querySelector("#login-form");
const uploadForm = document.querySelector("#upload-form");
const loginButton = document.querySelector("#login-button");
const uploadButton = document.querySelector("#upload-button");
const fileInput = document.querySelector("#photo");
const preview = document.querySelector("#upload-preview");
let client;
let photoManager;
let previewUrl;
let busy = false;

function announce(message, error = false) {
  status.textContent = message;
  status.classList.toggle("is-error", error);
}

function showLogin() {
  photoManager?.hide();
  uploadPanel.hidden = true;
  loginPanel.hidden = false;
  uploadForm.reset();
  preview.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

function showUpload(user) {
  loginPanel.hidden = true;
  uploadPanel.hidden = false;
  document.querySelector("#signed-in-as").textContent = user.email;
}

async function checkAccess() {
  const user = await isGalleryAdmin(client);
  if (!user) {
    showLogin();
    return null;
  }
  showUpload(user);
  await photoManager.show();
  return user;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || busy) return;
  busy = true;
  loginButton.disabled = true;
  announce("正在登录… / Signing in…");
  try {
    const { error } = await client.auth.signInWithPassword({
      email: document.querySelector("#email").value.trim(),
      password: document.querySelector("#password").value,
    });
    document.querySelector("#password").value = "";
    if (error)
      throw new Error(
        "登录失败，请检查邮箱和密码。 / Check your email and password.",
      );
    if (!(await checkAccess())) {
      await client.auth.signOut();
      throw new Error(
        "这个账号尚未获得相册管理权限，请联系负责人。 / This account is not authorized. Contact the team owner.",
      );
    }
    announce("已登录，可以上传照片。 / Signed in. You can upload photos.");
  } catch (error) {
    showLogin();
    announce(
      error.message || "暂时无法登录，请稍后再试。 / Please try again.",
      true,
    );
  } finally {
    busy = false;
    loginButton.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  if (busy) return;
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) {
    announce("退出失败，请重试。 / Could not sign out. Please retry.", true);
    return;
  }
  showLogin();
  announce("已退出登录。 / Signed out.");
});

fileInput.addEventListener("change", () => {
  preview.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  const file = fileInput.files[0];
  if (!file) return;
  try {
    validatePhoto(file);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
    announce(
      "照片已选好，填写说明后即可发布。 / Photo selected. Add a caption and publish.",
    );
  } catch (error) {
    fileInput.value = "";
    announce(error.message, true);
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || busy) return;
  busy = true;
  uploadButton.disabled = true;
  fileInput.disabled = true;
  let uploadedPath = null;
  let published = false;
  try {
    const user = await checkAccess();
    if (!user)
      throw new Error(
        "登录已失效或权限已取消，请重新登录。 / Sign in again or contact the owner.",
      );
    const file = fileInput.files[0];
    validatePhoto(file);
    announce(
      "正在上传，请保持页面打开… / Uploading. Please keep this page open…",
    );
    const id = crypto.randomUUID();
    const path = `${user.id}/${id}.${ALLOWED_TYPES[file.type]}`;
    const { error: storageError } = await client.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (storageError)
      throw new Error(
        "上传失败，请检查网络、照片大小及管理员权限。 / Upload failed. Check your connection and permissions.",
      );
    uploadedPath = path;
    const { error: publishError } = await client.from("gallery_photos").insert({
      id,
      storage_path: path,
      caption_zh:
        document.querySelector("#caption-zh").value.trim() ||
        "Joanne Fu · 珍藏瞬间 ♡",
      caption_en:
        document.querySelector("#caption-en").value.trim() ||
        "Joanne Fu · Treasured moments ♡",
      created_by: user.id,
    });
    if (publishError) {
      // The publish request may have reached the server even if its response was lost.
      // Verify before removing the uploaded file.
      const { data: existing, error: verifyError } = await client
        .from("gallery_photos")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (verifyError) {
        uploadedPath = null;
        throw new Error(
          "暂时无法确认发布结果，请先查看公开相册，避免重复上传。 / Result uncertain. Check the gallery before retrying.",
        );
      }
      if (!existing)
        throw new Error(
          "照片未能发布，请稍后重试。 / Could not publish the photo. Please retry.",
        );
    }
    published = true;
    await photoManager.refresh();
    uploadForm.reset();
    preview.hidden = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    announce(
      "上传成功！照片已发布，刷新公开相册即可看到。 / Published! Refresh the public gallery to see your photo.",
    );
  } catch (error) {
    if (uploadedPath && !published) {
      const { error: cleanupError } = await client.storage
        .from(BUCKET)
        .remove([uploadedPath]);
      if (cleanupError) {
        announce(
          `${error.message} 图片可能仍留在储存空间，请联系负责人检查。 / Ask the owner to check storage.`,
          true,
        );
        return;
      }
    }
    announce(
      error.message || "上传失败，请稍后再试。 / Please try again.",
      true,
    );
  } finally {
    busy = false;
    uploadButton.disabled = false;
    fileInput.disabled = false;
  }
});

async function initialize() {
  try {
    client = await connectGallery(true);
    if (!client) {
      announce(
        "管理员相册尚未连接，请负责人先完成设置。 / Gallery setup is pending. Please contact the team owner.",
      );
      return;
    }
    photoManager = createPhotoManager(client);
    document.querySelector("#email").disabled = false;
    document.querySelector("#password").disabled = false;
    loginButton.disabled = false;
    const {
      data: { session },
    } = await client.auth.getSession();
    if (session && (await checkAccess())) {
      announce("已登录，可以上传照片。 / Signed in. You can upload photos.");
    } else {
      showLogin();
      announce(
        "请使用获授权的账号登录。 / Sign in with an authorized account.",
      );
    }
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        showLogin();
        announce(
          "已退出登录，请重新登录。 / Signed out. Please sign in again.",
        );
      }
    });
  } catch {
    showLogin();
    announce(
      "暂时无法连接相册服务，请联系负责人检查设置或稍后重试。 / Cannot connect. Please contact the owner or retry later.",
      true,
    );
  }
}
initialize();
