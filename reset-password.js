import { connectGallery, isGalleryAdmin } from "./gallery-service.js";
import { readRecoveryLink, validateNewPassword } from "./recovery-utils.js";

// Remove credentials from the address bar BEFORE loading the external SDK.
const incoming = readRecoveryLink(window.location.href);
if (window.location.hash || window.location.search) {
  history.replaceState(null, "", window.location.pathname);
}
const status = document.querySelector("#recovery-status");
const requestPanel = document.querySelector("#request-panel");
const passwordPanel = document.querySelector("#password-panel");
const donePanel = document.querySelector("#done-panel");
const requestForm = document.querySelector("#request-form");
const passwordForm = document.querySelector("#password-form");
const sendButton = document.querySelector("#send-recovery");
const saveButton = document.querySelector("#save-password");
const emailInput = document.querySelector("#recovery-email");
let client;
let verifiedUserId = null;
let sending = false;
let saving = false;
let cooldown;

function announce(text, error = false) {
  status.textContent = text;
  status.classList.toggle("is-error", error);
}
function showRequest(message, error = false) {
  verifiedUserId = null;
  requestPanel.hidden = false;
  passwordPanel.hidden = true;
  donePanel.hidden = true;
  announce(message, error);
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || sending) return;
  sending = true;
  sendButton.disabled = true;
  announce("正在发送邮件… / Sending reset email…");
  try {
    const { error } = await client.auth.resetPasswordForEmail(
      emailInput.value.trim(),
      {
        redirectTo: "https://joanneknightsfanpage.com/reset-password.html",
      },
    );
    if (error) {
      if (error.status === 429 || error.code === "over_email_send_rate_limit") {
        throw new Error(
          "邮件发送过于频繁，请稍后再试。 / Too many requests. Please try again later.",
        );
      }
      throw new Error(
        "暂时无法发送重设邮件，请联系负责人检查邮件服务与跳转地址。 / Unable to send. Contact the owner to check email and redirect settings.",
      );
    }
    announce(
      "若此邮箱有可重设的账号，你会收到邮件。请检查收件箱和垃圾邮件，并使用最新链接。 / If this email has an eligible account, a reset email will arrive. Check your inbox and spam folder and use the latest link.",
    );
  } catch (error) {
    announce(
      error.message || "无法发送邮件，请稍后再试。 / Please try again later.",
      true,
    );
  } finally {
    // Local cooldown supplements the server's rate limits.
    cooldown = setTimeout(() => {
      sending = false;
      sendButton.disabled = false;
    }, 60000);
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || !verifiedUserId || saving) return;
  const password = document.querySelector("#new-password").value;
  const confirmation = document.querySelector("#confirm-password").value;
  try {
    validateNewPassword(password, confirmation);
  } catch (error) {
    announce(error.message, true);
    return;
  }
  saving = true;
  saveButton.disabled = true;
  try {
    const user = await isGalleryAdmin(client);
    if (!user || user.id !== verifiedUserId) {
      showRequest(
        "链接已失效或账号权限已变更，请重新申请。 / Link expired or access changed. Request a new link.",
        true,
      );
      return;
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      const message =
        error.code === "same_password"
          ? "新密码不能与旧密码相同。 / Choose a different password."
          : "密码未能更新。请检查密码要求；若链接过期，请重新申请邮件。 / Update failed. Check password requirements or request a fresh link.";
      throw new Error(message);
    }
    passwordForm.reset();
    verifiedUserId = null;
    passwordPanel.hidden = true;
    requestPanel.hidden = true;
    donePanel.hidden = false;
    announce(
      "密码已成功更新，请返回登录页面。 / Password updated. Please sign in again.",
    );
    // Clear this browser session; changing the password is already complete.
    const { error: signOutError } = await client.auth.signOut({
      scope: "local",
    });
    if (signOutError)
      announce(
        "密码已更新。请关闭此标签页后重新登录。 / Password updated. Close this tab and sign in again.",
      );
  } catch (error) {
    passwordForm.reset();
    announce(
      error.message ||
        "暂时无法更新密码，请稍后再试。 / Please try again later.",
      true,
    );
  } finally {
    saving = false;
    saveButton.disabled = false;
  }
});

async function initialize() {
  try {
    client = await connectGallery(true);
    if (!client) {
      showRequest(
        "相册服务尚未设置，请联系负责人。 / Setup is incomplete. Contact the owner.",
        true,
      );
      return;
    }
    emailInput.disabled = false;
    sendButton.disabled = false;
    if (incoming.kind === "none") {
      showRequest(
        "请输入管理员邮箱，申请重设密码。 / Enter your administrator email to request a reset.",
      );
      return;
    }
    if (incoming.kind === "expired") {
      showRequest(
        "邮件链接已过期或失效，请重新发送。 / Link expired or invalid. Request a new email.",
        true,
      );
      return;
    }
    announce("正在验证重设链接… / Verifying your reset link…");
    const result =
      incoming.kind === "session"
        ? await client.auth.setSession({
            access_token: incoming.accessToken,
            refresh_token: incoming.refreshToken,
          })
        : await client.auth.verifyOtp({
            token_hash: incoming.tokenHash,
            type: "recovery",
          });
    // Do not retain recovery credentials in module state.
    delete incoming.accessToken;
    delete incoming.refreshToken;
    delete incoming.tokenHash;
    if (result.error) {
      showRequest(
        "邮件链接已过期或失效，请重新发送。 / Link expired or invalid. Request a new email.",
        true,
      );
      return;
    }
    const user = await isGalleryAdmin(client);
    if (!user) {
      await client.auth.signOut({ scope: "local" });
      showRequest(
        "此账号没有相册管理权限，请联系负责人。 / This account is not authorized. Contact the team owner.",
        true,
      );
      return;
    }
    verifiedUserId = user.id;
    requestPanel.hidden = true;
    passwordPanel.hidden = false;
    announce(
      "验证通过，请设置新密码。 / Link verified. Choose your new password.",
    );
  } catch {
    showRequest(
      "暂时无法连接服务，请稍后刷新。 / Cannot connect. Please refresh later.",
      true,
    );
  }
}
initialize();
