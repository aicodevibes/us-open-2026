// app/loading.tsx

import { Loader2 } from 'lucide-react';

/**
 * Standard Next.js Loading boundary.
 * Renders a spinner while server-rendering pages.
 */
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#E4E3E0]">
      <Loader2 className="w-8 h-8 animate-spin text-[#141414]" />
    </div>
  );
}
