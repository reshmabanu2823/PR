'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import SettingsModal from '@/components/SettingsModal';

export default function SettingsLayout() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') || 'preferences';

  return (
    <div className="w-full h-full min-h-0 overflow-hidden bg-[#14120e]">
      <SettingsModal embedded initialTab={tabParam} />
    </div>
  );
}
