"use client";

import React, { useMemo } from "react";
import type {
  AppearanceTokenPatch,
  AppearanceTokens,
} from "@suite/website-builder/appearance";
import { ConfigFormRenderer } from "../config-renderers/config-form-renderer";
import {
  CUSTOM_FONT_PAIRING_ID,
  appearanceFormConfig,
  appearanceFormSchema,
  findFontPairing,
  initialAppearanceFormValues,
  type AppearanceFormValues,
} from "./appearance-form.config";

export interface AppearanceDraftUpdate {
  readonly brandName: string;
  readonly brandLogoUrl: string | null;
  readonly tokens: AppearanceTokenPatch;
}

export interface AppearanceFormProps {
  readonly brandName: string;
  readonly brandLogoUrl: string | null;
  readonly tokens: AppearanceTokens;
  readonly permissions: readonly string[];
  readonly isSaving: boolean;
  readonly onSubmit: (update: AppearanceDraftUpdate) => Promise<void>;
}

function toDraftUpdate(values: AppearanceFormValues): AppearanceDraftUpdate {
  const tokensPatch: AppearanceTokenPatch = {
    colorPrimary: values.primaryColor.trim(),
  };
  if (values.fontPairing !== CUSTOM_FONT_PAIRING_ID) {
    const pairing = findFontPairing(values.fontPairing);
    if (pairing !== null) {
      tokensPatch.fontHeading = pairing.heading;
      tokensPatch.fontBody = pairing.body;
    }
  }
  const logo = values.brandLogoUrl.trim();
  return {
    brandName: values.brandName.trim(),
    brandLogoUrl: logo.length === 0 ? null : logo,
    tokens: tokensPatch,
  };
}

/**
 * The appearance panel's schema-driven form. The renderer owns the inputs,
 * validation and sticky save bar; this component only maps valid values into
 * the site's draft update.
 */
export function AppearanceForm(props: AppearanceFormProps) {
  const initialValues = useMemo(
    () =>
      initialAppearanceFormValues({
        brandName: props.brandName,
        brandLogoUrl: props.brandLogoUrl,
        tokens: props.tokens,
      }),
    [props.brandName, props.brandLogoUrl, props.tokens]
  );
  const config = useMemo(() => appearanceFormConfig(props.tokens), [props.tokens]);

  return (
    <ConfigFormRenderer<AppearanceFormValues>
      config={config}
      initialValues={initialValues}
      validationSchema={appearanceFormSchema}
      userPermissions={props.permissions}
      isSaving={props.isSaving}
      onSubmit={(values) => props.onSubmit(toDraftUpdate(values))}
    />
  );
}
