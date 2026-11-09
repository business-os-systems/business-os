"use client";

import { useParams } from "next/navigation";
import { isCatalogKey } from "@suite/core";
import { Alert } from "@suite/ui";
import { useCatalogsContext } from "../catalogs-context";
import { CatalogValueEditor } from "./catalog-value-editor";

function CatalogNotFound() {
  return (
    <Alert
      variant="error"
      title="Catalog not found"
      message="This reference catalog is not registered. Choose one from the sidebar."
    />
  );
}

export default function CatalogPage() {
  const params = useParams<{ category: string }>();
  const { catalogs } = useCatalogsContext();
  const category = params.category;

  if (!isCatalogKey(category)) {
    return <CatalogNotFound />;
  }
  const catalog = catalogs.find((item) => item.key === category);
  if (catalog === undefined) {
    return <CatalogNotFound />;
  }
  return <CatalogValueEditor catalog={catalog} />;
}
