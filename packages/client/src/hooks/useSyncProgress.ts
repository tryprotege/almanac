import { useEffect, useState } from "react";

interface SyncProgress {
  state: "waiting" | "active" | "completed" | "failed";
  progress: number;
  error?: string;
}

export function useSyncProgress(jobId: string | null) {
  const [progress, setProgress] = useState<SyncProgress>({
    state: "waiting",
    progress: 0,
  });

  useEffect(() => {
    if (!jobId) {
      setProgress({ state: "waiting", progress: 0 });
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || "/api";
    const eventSource = new EventSource(`${apiUrl}/sync/${jobId}/progress`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[SSE] Received progress update:", data);

        // Handle error response
        if (data.error) {
          setProgress({
            state: "failed",
            progress: 0,
            error: data.error,
          });
          eventSource.close();
          return;
        }

        // Update progress
        setProgress({
          state: data.state,
          progress: data.progress || 0,
          error: data.error,
        });

        // Close connection when complete or failed
        if (data.state === "completed" || data.state === "failed") {
          eventSource.close();
        }
      } catch (error) {
        console.error("Error parsing SSE data:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      setProgress((prev) => ({
        ...prev,
        state: "failed",
        error: "Connection lost",
      }));
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
    };
  }, [jobId]);

  return progress;
}
