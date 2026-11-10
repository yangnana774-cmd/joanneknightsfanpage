// Recovery links must establish a verified session; an existing browser session
// alone never unlocks the password form.
export function readRecoveryLink(href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const error = hash.get("error") || url.searchParams.get("error");
  if (error) return { kind: "expired" };
  if (
    hash.get("type") === "recovery" &&
    hash.get("access_token") &&
    hash.get("refresh_token")
  ) {
    return {
      kind: "session",
      accessToken: hash.get("access_token"),
      refreshToken: hash.get("refresh_token"),
    };
  }
  if (
    url.searchParams.get("type") === "recovery" &&
    url.searchParams.get("token_hash")
  ) {
    return { kind: "otp", tokenHash: url.searchParams.get("token_hash") };
  }
  return { kind: "none" };
}

export function validateNewPassword(password, confirmation) {
  if (password.length < 12)
    throw new Error(
      "请使用至少 12 个字符的新密码。 / Use at least 12 characters.",
    );
  if (password !== confirmation)
    throw new Error("两次密码不一致，请重新输入。 / Passwords do not match.");
}
