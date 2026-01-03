import { Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { DataSourceConfig, oauthApi, dataSourcesApi } from "../../lib/api";
import { OAuthConnectButton } from "../OAuthConnectButton";
import toast from "react-hot-toast";

interface OAuthStepProps {
  serverConfig: Omit<DataSourceConfig, "_id" | "createdAt" | "updatedAt">;
  onBack: () => void;
  onComplete: (serverId: string) => void;
  isLoading: boolean;
}

export function OAuthStep({
  serverConfig,
  onBack,
  onComplete,
  isLoading,
}: OAuthStepProps) {
  const [oauthStatus, setOauthStatus] = useState<
    "pending" | "success" | "error"
  >("pending");
  const [serverId, setServerId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchingServerId, setFetchingServerId] = useState(true);

  // Fetch server ID when component mounts
  useEffect(() => {
    const fetchServerId = async () => {
      setFetchingServerId(true);
      try {
        const response = await dataSourcesApi.get(serverConfig.name);
        console.log("Fetched server data:", response.data);

        if (response.data.data?._id) {
          setServerId(response.data.data._id);
          setFetchingServerId(false);
        } else {
          setErrorMessage(
            "Server created but no ID returned. Please try refreshing the page."
          );
          setOauthStatus("error");
          setFetchingServerId(false);
        }
      } catch (error) {
        console.error("Failed to fetch server ID:", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to fetch server. The server may not have been created yet."
        );
        setOauthStatus("error");
        setFetchingServerId(false);
      }
    };

    fetchServerId();
  }, [serverConfig.name]);

  const handleOAuthSuccess = () => {
    // Trust the OAuthConnectButton - if it says success, it's success
    setOauthStatus("success");
    toast.success("OAuth authorization complete!");

    // Auto-advance after a brief moment
    setTimeout(() => {
      if (serverId) {
        onComplete(serverId);
      }
    }, 1500);
  };

  const handleOAuthError = (error: string) => {
    setOauthStatus("error");
    setErrorMessage(error);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          OAuth Authorization Required
        </h3>
        <p className="text-sm text-text-tertiary">
          This data source requires OAuth authorization to access your data
          securely.
        </p>
      </div>

      {/* Status Display */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="mt-1">
            {oauthStatus === "pending" && (
              <Shield className="w-6 h-6 text-brand-purple" />
            )}
            {oauthStatus === "success" && (
              <CheckCircle className="w-6 h-6 text-brand-success" />
            )}
            {oauthStatus === "error" && (
              <AlertCircle className="w-6 h-6 text-brand-error" />
            )}
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-medium text-text-primary mb-2">
              {serverConfig.name}
            </h3>

            {oauthStatus === "pending" && (
              <div>
                <p className="text-text-secondary mb-4">
                  Click the button below to authorize {serverConfig.name} to
                  access your data. You'll be redirected to complete the
                  authorization process.
                </p>
                {serverId && !fetchingServerId && (
                  <OAuthConnectButton
                    mcpServerId={serverId}
                    mcpServerName={serverConfig.name}
                    serverType={serverConfig.type}
                    authConfig={serverConfig.oauth}
                    onSuccess={handleOAuthSuccess}
                    onError={handleOAuthError}
                  />
                )}
                {fetchingServerId && (
                  <div className="flex items-center gap-2 text-text-tertiary text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparing authorization...</span>
                  </div>
                )}
                {!serverId && !fetchingServerId && (
                  <div className="text-error-text text-sm">
                    <p className="mb-2">Failed to load server configuration.</p>
                    <button
                      onClick={onBack}
                      className="btn btn-secondary btn-sm"
                    >
                      Go Back and Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {oauthStatus === "success" && (
              <p className="text-brand-success">
                ✓ Authorization successful! Proceeding...
              </p>
            )}

            {oauthStatus === "error" && (
              <div>
                <p className="text-brand-error mb-2">
                  Authorization failed: {errorMessage}
                </p>
                <p className="text-text-secondary text-sm">
                  Please try again or go back to update your configuration.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      {oauthStatus === "pending" && (
        <div className="card">
          <h4 className="text-sm font-medium text-text-primary mb-3">
            What happens next?
          </h4>
          <ol className="space-y-2 text-sm text-text-secondary">
            <li className="flex gap-2">
              <span className="text-brand-purple font-medium">1.</span>
              <span>A popup window will open with the authorization page</span>
            </li>
            <li className="flex gap-2">
              <span className="text-brand-purple font-medium">2.</span>
              <span>Sign in and grant the requested permissions</span>
            </li>
            <li className="flex gap-2">
              <span className="text-brand-purple font-medium">3.</span>
              <span>
                Return here - the wizard will automatically continue once
                authorization is complete
              </span>
            </li>
          </ol>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border-secondary">
        <button
          onClick={onBack}
          disabled={isLoading || oauthStatus === "success"}
          className="btn btn-secondary"
        >
          Back
        </button>

        {oauthStatus === "error" && serverId && (
          <OAuthConnectButton
            mcpServerId={serverId}
            mcpServerName={serverConfig.name}
            serverType={serverConfig.type}
            authConfig={serverConfig.oauth}
            onSuccess={handleOAuthSuccess}
            onError={handleOAuthError}
          />
        )}
      </div>
    </div>
  );
}
