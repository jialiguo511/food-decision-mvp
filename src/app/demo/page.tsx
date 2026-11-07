// /demo — public, static, no sign-in. A walkthrough of the product for someone
// who has not signed up (a link from a portfolio or a résumé). It shows fixed,
// clearly-labelled examples; it makes no request, and no account or data of
// anyone is involved. Real suggestions need a real sign-in and run under the
// normal auth and daily limits.

import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import DemoExperience from "./DemoExperience";

export const metadata: Metadata = { title: "Example walkthrough" };

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-[max(2rem,env(safe-area-inset-top))]">
      <Link href="/login" className="text-sm font-semibold text-accent">
        ← {BRAND.name}
      </Link>
      <h1 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight">Say what&apos;s going on. Get three options.</h1>
      <p className="mt-2 mb-6 text-muted">{BRAND.tagline}</p>
      <DemoExperience />
    </div>
  );
}
