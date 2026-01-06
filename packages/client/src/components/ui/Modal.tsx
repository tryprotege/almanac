import { X } from "lucide-react";
import { useEffect, useRef, ReactNode } from "react";
import { createPortal } from "react-dom";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: ModalSize;
  children: ReactNode;
  disableClose?: boolean;
  hideHeader?: boolean;
  className?: string;
  // New props for explicit control
  width?: string;
  minWidth?: string;
  maxWidth?: string;
}

// Size to width mapping with explicit values
const sizeToWidth: Record<ModalSize, { default: string; max: string }> = {
  sm: { default: "100%", max: "28rem" }, // 448px
  md: { default: "100%", max: "32rem" }, // 512px
  lg: { default: "100%", max: "42rem" }, // 672px
  xl: { default: "100%", max: "56rem" }, // 896px
  full: { default: "100%", max: "72rem" }, // 1152px
};

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = "lg",
  children,
  disableClose = false,
  hideHeader = false,
  className = "",
  width,
  minWidth = "320px",
  maxWidth,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Get width values from size or use custom width
  const widthStyle = width || sizeToWidth[size].default;
  const maxWidthStyle = maxWidth || sizeToWidth[size].max;

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || disableClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose, disableClose]);

  // Focus management for accessibility
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus the modal container
      const timer = setTimeout(() => {
        modalRef.current?.focus();
      }, 100);

      return () => clearTimeout(timer);
    } else {
      // Restore focus when modal closes
      previousActiveElement.current?.focus();
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !disableClose) {
      onClose();
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={subtitle ? "modal-subtitle" : undefined}
      style={{
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        ref={modalRef}
        className={`bg-bg-primary rounded-lg shadow-2xl border border-border-secondary flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        style={{
          width: widthStyle,
          minWidth: minWidth,
          maxWidth: maxWidthStyle,
          maxHeight: "90vh",
          animation: "scaleIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        {!hideHeader && (title || subtitle) && (
          <div className="flex items-start justify-between p-6 border-b border-border-secondary flex-shrink-0">
            <div className="flex-1 min-w-0 pr-4">
              {title && (
                <h2
                  id="modal-title"
                  className="text-xl font-semibold text-text-primary"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p
                  id="modal-subtitle"
                  className="text-sm text-text-tertiary mt-1"
                >
                  {subtitle}
                </p>
              )}
            </div>
            {!disableClose && (
              <button
                onClick={onClose}
                className="text-text-quaternary hover:text-text-secondary transition-colors flex-shrink-0"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content - scrollable */}
        <div
          className="overflow-y-auto flex-1"
          style={{
            scrollbarWidth: "thin",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// Modal Header component for custom headers
interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  disableClose?: boolean;
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
  disableClose = false,
}: ModalHeaderProps) {
  return (
    <div className="flex items-start justify-between p-6 border-b border-border-secondary flex-shrink-0">
      <div className="flex-1 min-w-0 pr-4">
        <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
        {subtitle && (
          <p className="text-sm text-text-tertiary mt-1">{subtitle}</p>
        )}
      </div>
      {onClose && !disableClose && (
        <button
          onClick={onClose}
          className="text-text-quaternary hover:text-text-secondary transition-colors flex-shrink-0"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

// Modal Footer component with flexible layout
interface ModalFooterProps {
  children: ReactNode;
  className?: string;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
}

export function ModalFooter({
  children,
  className = "",
  leftContent,
  rightContent,
}: ModalFooterProps) {
  // If leftContent and rightContent are provided, use justify-between
  // Otherwise, if only children provided, use justify-end
  const justifyClass =
    leftContent || rightContent ? "justify-between" : "justify-end";

  return (
    <div
      className={`flex items-center gap-3 p-6 border-t border-border-secondary flex-shrink-0 ${justifyClass} ${className}`}
    >
      {leftContent && (
        <div className="flex items-center gap-3">{leftContent}</div>
      )}
      {children && <div className="flex items-center gap-3">{children}</div>}
      {rightContent && (
        <div className="flex items-center gap-3">{rightContent}</div>
      )}
    </div>
  );
}

// Add keyframe animations to document if not already present
if (typeof document !== "undefined") {
  const styleId = "modal-animations";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
    `;
    document.head.appendChild(style);
  }
}
