'use client';

import * as React from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { DocumentPreviewPanel } from '@/components/nx/blocks';

export interface PreviewTarget {
  id: string;
  title: string;
  mimeType?: string | null;
  fileName?: string | null;
  version?: number;
  subtitle?: React.ReactNode;
}

/** Side drawer that previews the ORIGINAL stored file of a document (auth-gated by the API). */
export function DocumentPreviewSheet({ doc, onClose }: { doc: PreviewTarget | null; onClose: () => void }) {
  return (
    <Sheet open={!!doc} onOpenChange={(o) => !o && onClose()}>
      {doc && (
        <SheetContent eyebrow="Document" title={doc.title} description={doc.subtitle} width="xl">
          <div className="p-5">
            <DocumentPreviewPanel doc={{ id: doc.id, title: doc.title, mimeType: doc.mimeType, fileName: doc.fileName, version: doc.version }} height={680} />
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
