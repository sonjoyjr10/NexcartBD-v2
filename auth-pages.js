import { registerUser, loginUser, forgotPassword, authErrorMessage, watchAuthState } from "./auth.js";
import { toast, validators, qs } from "./utils.js";

// If already logged in, bounce straight to dashboard.
watchAuthState((user) => {
  if (user && (location.pathname.endsWith("login.html") || location.pathname.endsWith("register.html"))) {
    location.href = "/dashboard.html";
  }
});

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.textContent = loading ? "Please wait…" : label;
}

/* ---------------- Login ---------------- */
const loginForm = qs("#login-form");
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = qs("#email").value.trim();
  const password = qs("#password").value;
  const btn = qs("#login-submit");
  if (!validators.email(email)) return toast("Enter a valid email address.", "error");
  if (!validators.notEmpty(password)) return toast("Enter your password.", "error");
  setLoading(btn, true, "Log In");
  try {
    await loginUser({ email, password });
    toast("Welcome back!", "success");
    location.href = "/dashboard.html";
  } catch (err) {
    toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false, "Log In");
  }
});

/* ---------------- Register ---------------- */
const registerForm = qs("#register-form");
registerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = qs("#name").value.trim();
  const email = qs("#email").value.trim();
  const phone = qs("#phone").value.trim();
  const password = qs("#password").value;
  const confirmPassword = qs("#confirm-password").value;
  const btn = qs("#register-submit");

  if (!validators.notEmpty(name)) return toast("Enter your full name.", "error");
  if (!validators.email(email)) return toast("Enter a valid email address.", "error");
  if (!validators.password(password)) return toast("Password must be at least 8 characters.", "error");
  if (password !== confirmPassword) return toast("Passwords do not match.", "error");

  setLoading(btn, true, "Create Account");
  try {
    await registerUser({ name, email, password, phone });
    location.href = "/dashboard.html";
  } catch (err) {
    toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false, "Create Account");
  }
});

/* ---------------- Forgot password ---------------- */
const forgotForm = qs("#forgot-form");
forgotForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = qs("#email").value.trim();
  const btn = qs("#forgot-submit");
  if (!validators.email(email)) return toast("Enter a valid email address.", "error");
  setLoading(btn, true, "Send Reset Link");
  try {
    await forgotPassword(email);
  } catch (err) {
    toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false, "Send Reset Link");
  }
});
