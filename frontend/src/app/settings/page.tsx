import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import SettingsLayout from './components/SettingsLayout';

export default function SettingsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading settings...</div>}>
        <SettingsLayout />
      </Suspense>
    </AppLayout>
  );
}
