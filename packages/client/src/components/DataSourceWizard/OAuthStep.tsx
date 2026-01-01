import { Shield, CheckCircle, AlertCircle } from "lucide-react";
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
    "pending" | "authorizing" | "success" | "error"
  >("pending");
  const [serverId, setServerId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch server ID when component mounts
  useEffect(() => {
    const fetchServerId = async () => {
      try {
        const response = await dataSourcesApi.get(serverConfig.name);
        if (response.data.data?._id) {
          setServerId(response.data.data._id);
        } else {
          setErrorMessage("Failed to get server ID");
          setOauthStatus("error");
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to fetch server"
        );
        setOauthStatus("error");
      }
    };

    fetchServerId();
  }, [serverConfig.name]);

  const handleOAuthSuccess = async (returnedServerId: string) => {
    setServerId(returnedServerId);

    // Verify OAuth status
    try {
      const response = await oauthApi.status(returnedServerId);
      if (response.data.data?.connected) {
        setOauthStatus("success");
        toast.success("OAuth authorization complete!");

        // Wait a moment, then proceed
        setTimeout(() => {
          onComplete(returnedServerId);
        }, 1500);
      } else {
        setOauthStatus("error");
        setErrorMessage("OAuth authorization failed - tokens not found");
      }
    } catch (error) {
      setOauthStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to verify OAuth status"
      );
    }
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
            {oauthStatus === "authorizing" && (
              <Shield className="w-6 h-6 text-brand-warning animate-pulse" />
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
                {serverId && (
                  <OAuthConnectButton
                    mcpServerId={serverId}
                    mcpServerName={serverConfig.name}
                    serverType={serverConfig.type}
                    authConfig={serverConfig.oauth}
                    onSuccess={() => handleOAuthSuccess(serverId)}
                  />
                )}
                {!serverId && (
                  <p className="text-text-tertiary text-sm">
                    Preparing authorization...
                  </p>
                )}
              </div>
            )}

            {oauthStatus === "authorizing" && (
              <p className="text-text-secondary">Completing authorization...</p>
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
          disabled={isLoading || oauthStatus === "authorizing"}
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
            onSuccess={() => handleOAuthSuccess(serverId)}
          />
        )}
      </div>
    </div>
  );
}
