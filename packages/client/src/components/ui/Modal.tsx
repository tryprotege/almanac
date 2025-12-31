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
}

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-6xl",
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
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

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
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={subtitle ? "modal-subtitle" : undefined}
    >
      <div
        ref={modalRef}
        className={`modal-container ${sizeClasses[size]} ${className}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Header */}
        {!hideHeader && (title || subtitle) && (
          <div className="modal-header">
            <div className="modal-header-content">
              {title && (
                <h2 id="modal-title" className="modal-title">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p id="modal-subtitle" className="modal-subtitle">
                  {subtitle}
                </p>
              )}
            </div>
            {!disableClose && (
              <button
                onClick={onClose}
                className="modal-close-button"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// Optional: Modal Header component for custom headers
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
    <div className="modal-header">
      <div className="modal-header-content">
        <h2 className="modal-title">{title}</h2>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
      </div>
      {onClose && !disableClose && (
        <button
          onClick={onClose}
          className="modal-close-button"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

// Optional: Modal Footer component for consistent button layouts
interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className = "" }: ModalFooterProps) {
  return <div className={`modal-footer ${className}`}>{children}</div>;
}
