"use client";

// Bundled app start: straight to Home (Home sends a signed-out person to sign-in).
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Start() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/today");
  }, [router]);
  return null;
}
