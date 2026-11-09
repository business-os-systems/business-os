"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { catalogsHref } from "@/components/layout/catalogs-nav.config";
import { PlatformViewState } from "@/components/states/view-state";
import { useCatalogsContext } from "./catalogs-context";

/**
 * The hub has no content of its own; it opens the first catalog as a route so
 * the sidebar and the panel URL never disagree (H-3.2).
 */
export default function CatalogsIndexPage() {
  const { catalogs } = useCatalogsContext();
  const router = useRouter();
  const first = catalogs[0];

  useEffect(() => {
    if (first !== undefined) {
      router.replace(catalogsHref(first.key));
    }
  }, [first, router]);

  if (first === undefined) {
    return (
      <PlatformViewState
        state={{
          kind: "empty",
          title: "No reference catalogs",
          description:
            "The reference schema is empty. Seed the approved launch catalogs before editing values.",
        }}
      />
    );
  }
  return (
    <PlatformViewState
      state={{ kind: "loading", label: "Opening the first catalog..." }}
    />
  );
}
