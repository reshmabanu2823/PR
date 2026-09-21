"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Demo from "@/components/ui/demo";

export default function InputDemoPage() {
  return (
    <div className="relative min-h-screen">
      <div className="absolute top-4 left-4 z-50">
        <Link
          href="/"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-background/70 hover:bg-background/90 text-foreground text-xs font-medium backdrop-blur-md border border-border shadow-sm transition-all"
        >
          <ArrowLeft size={14} />
          Back to PRAGNA 1-A Chat
        </Link>
      </div>
      <Demo />
    </div>
  );
}
