import { useEffect, useState } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function OAuthCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing"
  );
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    const description = params.get("description");

    if (success) {
      setStatus("success");
      // Notify parent window (popup opener)
      if (window.opener) {
        window.opener.postMessage(
          { type: "oauth-success" },
          window.location.origin
        );
        // Close popup after short delay
        setTimeout(() => {
          window.close();
        }, 2000);
      }
    } else if (error) {
      setStatus("error");
      setError(description || error);
      // Notify parent window
      if (window.opener) {
        window.opener.postMessage(
          { type: "oauth-error", error, description },
          window.location.origin
        );
        // Close popup after delay to show error
        setTimeout(() => {
          window.close();
        }, 5000);
      }
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background-primary">
      <div className="text-center p-8 max-w-md">
        {status === "processing" && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 text-brand-purple animate-spin" />
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Processing OAuth...
            </h1>
            <p className="text-text-secondary">
              This window will close automatically.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-brand-success" />
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Authentication Successful!
            </h1>
            <p className="text-text-secondary">
              You can now close this window.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-16 h-16 mx-auto mb-4 text-brand-error" />
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Authentication Failed
            </h1>
            <p className="text-text-secondary mb-4">
              {error || "An error occurred during authentication."}
            </p>
            <button
              onClick={() => window.close()}
              className="btn btn-secondary"
            >
              Close Window
            </button>
          </>
        )}
      </div>
    </div>
  );
}
