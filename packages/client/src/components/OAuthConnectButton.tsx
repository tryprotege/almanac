import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface OAuthConnectButtonProps {
  mcpServerId: string;
  mcpServerName: string;
  serverType?: 'stdio' | 'sse' | 'streamable-http';
  authConfig?: {
    authorizationUrl?: string;
    tokenUrl?: string;
    clientId?: string;
    scopes?: string[];
  };
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function OAuthConnectButton({
  mcpServerId,
  mcpServerName,
  serverType,
  authConfig,
  onSuccess,
  onError,
}: OAuthConnectButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connected' | 'expired'>('disconnected');

  // Check connection status on mount and when mcpServerId changes
  useEffect(() => {
    checkStatus();
  }, [mcpServerId]);

  // Listen for OAuth callback messages from popup window
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data.type === 'oauth-success') {
        setIsConnecting(false);
        // Refresh status from server to get latest state
        await checkStatus();
        onSuccess?.();
      } else if (event.data.type === 'oauth-error') {
        onError?.(event.data.error || 'OAuth authentication failed');
        setIsConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess, onError]);

  const checkStatus = async () => {
    try {
      const response = await fetch(`/api/oauth/status/${mcpServerId}`);
      if (!response.ok) {
        throw new Error('Failed to check OAuth status');
      }
      const data = await response.json();
      setStatus(data.connected ? 'connected' : 'disconnected');
    } catch (err) {
      console.error('Failed to check OAuth status:', err);
      setStatus('disconnected');
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      let authorizationUrl: string;

      // Use auto-discovery OAuth flow for remote MCP servers (SSE and streamable-http)
      if (serverType === 'sse' || serverType === 'streamable-http') {
        toast.loading('Discovering OAuth configuration...', {
          id: 'oauth-discovery',
        });
        const response = await fetch(`/api/oauth/start-remote/${mcpServerId}`, {
          method: 'POST',
        });
        if (!response.ok) {
          toast.error('Failed to discover OAuth configuration', {
            id: 'oauth-discovery',
          });
          throw new Error('Failed to start OAuth flow with auto-discovery');
        }
        const data = await response.json();

        if (!data.requiresAuth) {
          // Server doesn't require OAuth
          toast.success('No OAuth required for this server', {
            id: 'oauth-discovery',
          });
          onSuccess?.();
          setIsConnecting(false);
          return;
        }

        if (!data.authorizationUrl) {
          toast.error('No authorization URL received', {
            id: 'oauth-discovery',
          });
          throw new Error('No authorization URL received');
        }

        toast.success('OAuth configuration discovered', {
          id: 'oauth-discovery',
        });
        authorizationUrl = data.authorizationUrl;
      } else {
        // Standard OAuth flow for other server types
        const response = await fetch(`/api/oauth/start/${mcpServerId}`);
        if (!response.ok) {
          throw new Error('Failed to start OAuth flow');
        }
        const data = await response.json();
        authorizationUrl = data.authorizationUrl;
      }

      // Open authorization URL in popup window
      toast.loading('Redirecting to authorization...', {
        id: 'oauth-redirect',
      });

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        authorizationUrl,
        'oauth',
        `width=${width},height=${height},left=${left},top=${top}`,
      );

      if (!popup) {
        toast.error('Failed to open authorization window', {
          id: 'oauth-redirect',
        });
        throw new Error('Failed to open OAuth popup window');
      }

      toast.success('Authorization window opened', { id: 'oauth-redirect' });

      // Check if popup was closed manually
      // Wrap in try-catch to handle COOP errors
      const startTime = Date.now();
      const checkPopupClosed = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(checkPopupClosed);
            setIsConnecting(false);
          }
        } catch (error) {
          // COOP policy may block access to popup.closed
          // In this case, we rely on the postMessage callback instead
          // Clear interval after a reasonable timeout (2 minutes)
          if (Date.now() - startTime > 120000) {
            clearInterval(checkPopupClosed);
            setIsConnecting(false);
          }
        }
      }, 500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(errorMessage);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const response = await fetch(`/api/oauth/revoke/${mcpServerId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to revoke OAuth tokens');
      }
      setStatus('disconnected');
      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(errorMessage);
    }
  };

  const handleRefresh = async () => {
    try {
      const response = await fetch(`/api/oauth/refresh/${mcpServerId}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to refresh OAuth tokens');
      }
      await checkStatus();
      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      onError?.(errorMessage);
    }
  };

  // For SSE and streamable-http servers, we don't need pre-configured OAuth (it's auto-discovered)
  // For other servers, we need the authConfig
  if (
    serverType !== 'sse' &&
    serverType !== 'streamable-http' &&
    (!authConfig || !authConfig.authorizationUrl)
  ) {
    return null; // Don't show button if OAuth is not configured
  }

  return (
    <div className="flex items-center gap-3">
      {status === 'connected' ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">
              Connected
            </span>
          </div>
          <button onClick={handleDisconnect} className="btn btn-secondary text-sm">
            Disconnect
          </button>
          <button onClick={handleRefresh} className="btn btn-secondary text-sm">
            Refresh Token
          </button>
        </>
      ) : (
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            `Connect ${mcpServerName}`
          )}
        </button>
      )}
    </div>
  );
}
