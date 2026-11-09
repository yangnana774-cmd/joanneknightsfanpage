// Shared connection and validation for the public gallery and private admin page.
export const BUCKET = "gallery-images";
export const MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validatePhoto(file) {
  if (!file || !ALLOWED_TYPES[file.type]) {
    throw new Error(
      "请选择 JPG、PNG 或 WebP 照片。 / Choose JPG, PNG or WebP.",
    );
  }
  if (!file.size || file.size > MAX_BYTES) {
    throw new Error("每张照片须小于或等于 10 MB。 / Maximum 10 MB per photo.");
  }
}

export function getPublicConfig() {
  const config = window.JK_GALLERY_CONFIG || {};
  if (!config.url || !config.publishableKey) return null;
  const url = new URL(config.url);
  if (url.protocol !== "https:") throw new Error("连接地址必须使用 HTTPS。");
  if (config.publishableKey.startsWith("sb_secret_")) {
    throw new Error("请使用 Publishable key，不能使用 Secret key。");
  }
  if (config.publishableKey.startsWith("eyJ")) {
    try {
      const claims = JSON.parse(
        atob(
          config.publishableKey
            .split(".")[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/"),
        ),
      );
      if (claims.role !== "anon")
        throw new Error("请使用 anon / Publishable key。");
    } catch {
      throw new Error("请检查公开连接密钥，不能使用 service_role key。");
    }
  }
  return { url: url.origin, key: config.publishableKey };
}

export async function connectGallery(admin = false) {
  const config = getPublicConfig();
  if (!config) return null;
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
  );
  return createClient(config.url, config.key, {
    auth: {
      persistSession: admin,
      autoRefreshToken: admin,
      detectSessionInUrl: false,
      ...(admin
        ? { storage: window.sessionStorage, storageKey: "jk-gallery-admin" }
        : {}),
    },
  });
}

export async function isGalleryAdmin(client) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return null;
  const { data, error: roleError } = await client
    .from("gallery_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError || !data) return null;
  return user;
}

export function photoUrl(client, path) {
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
