import { LegalDocumentView } from "@/components/legal/legal-document-view";
import type { LegalDocumentResolved } from "@/lib/legal/catalog";

interface LegalModalProps {
  open: boolean;
  document: LegalDocumentResolved | null;
  onClose: () => void;
}

export function LegalModal({ open, document, onClose }: LegalModalProps) {
  if (!open || !document) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold">{document.title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 hover:bg-secondary"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <LegalDocumentView doc={document} />
        </div>
      </div>
    </div>
  );
}
