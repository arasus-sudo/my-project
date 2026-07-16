import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";
const GSI_SRC = "https://accounts.google.com/gsi/client";

/** Loads Google Identity Services once and renders the official button.
 *  On success: verifies server-side via /auth/google, then routes new users
 *  to onboarding and returning users straight into the suite. Renders nothing
 *  if no client ID is configured, so the password form always stands alone
 *  gracefully rather than next to a dead button. */
export default function GoogleSignInButton({ text = "continue_with" }) {
  const { googleAuth } = useAuth();
  const nav = useNavigate();
  const slot = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID || !slot.current) return;

    const init = () => {
      try {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (resp) => {
            try {
              const data = await googleAuth(resp.credential);
              toast.success(data.created ? "Workspace ready — welcome to Innoira" : "Welcome back");
              nav(data.created ? "/onboarding" : "/suite");
            } catch (err) {
              toast.error(err?.response?.data?.detail || "Google sign-in failed");
            }
          },
        });
        window.google.accounts.id.renderButton(slot.current, {
          theme: "outline", size: "large", shape: "pill", text, width: 340, logo_alignment: "left",
        });
      } catch {
        setFailed(true);
      }
    };

    if (window.google?.accounts?.id) { init(); return; }
    let script = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", init);
    script.addEventListener("error", () => setFailed(true));
    return () => script.removeEventListener("load", init);
  }, [googleAuth, nav, text]);

  if (!CLIENT_ID) return null;
  return (
    <div className="space-y-3" data-testid="google-signin">
      <div ref={slot} className="flex justify-center" />
      {failed && <p className="text-xs text-neutral-400 text-center">Google sign-in couldn't load — use email below.</p>}
      <div className="flex items-center gap-3 text-xs text-neutral-400">
        <span className="flex-1 border-t border-line" /> or <span className="flex-1 border-t border-line" />
      </div>
    </div>
  );
}
