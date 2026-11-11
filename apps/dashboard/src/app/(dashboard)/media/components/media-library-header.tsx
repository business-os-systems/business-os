import React from "react";

export interface MediaLibraryHeaderProps {
  readonly total: number;
}

export function MediaLibraryHeader({ total }: MediaLibraryHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-bold tracking-tight text-text">Media library</h1>
      <p className="text-xs text-text-secondary">
        One shared image library for the workspace. Showing {total} loaded asset
        {total === 1 ? "" : "s"} from the tenant library.
      </p>
    </div>
  );
}
