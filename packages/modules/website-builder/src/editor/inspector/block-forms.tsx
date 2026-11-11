import React, { useEffect, useState } from "react";
import { Button, Input, Label, Select, Textarea } from "@suite/ui";
import { PERMISSIONS, hasPermission } from "@suite/core";
import {
  MediaPicker,
  type MediaAssetView,
} from "@suite/media/react";
import type { BlockAst, MediaReference } from "../../ast/types.js";
import {
  resolveMediaImage,
  type ResolvedMediaImage,
} from "../../render/media-resolution.js";
import {
  BLOCK_FORM_CONFIGS,
  blockFormErrors,
  clearMediaReference,
  fieldError,
  readFieldValue,
  readMediaReference,
  readOptionalString,
  readProps,
  writeFieldValue,
  writeMediaReference,
  type BlockFormField,
  type BlockProps,
  type MediaFieldConfig,
} from "./block-form-config.js";
import type { MediaPickerControls } from "./types.js";

export type BlockPropsChange = (nextProps: BlockProps) => void;

export interface BlockFormProps {
  readonly block: BlockAst;
  readonly media: MediaPickerControls | null;
  readonly onChange: BlockPropsChange;
}

export interface BlockFieldProps {
  readonly field: BlockFormField;
  readonly value: string;
  readonly error: string | null;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

const MEDIA_DENIED_MESSAGE = `Choosing an image requires the ${PERMISSIONS.MEDIA.READ} capability.`;

function fieldId(field: BlockFormField): string {
  return "block-field-" + field.path.join("-");
}

function SelectControl(props: BlockFieldProps & { readonly field: Extract<BlockFormField, { kind: "select" }> }) {
  return (
    <Select
      id={fieldId(props.field)}
      options={props.field.options.map((option) => ({ label: option.label, value: option.value }))}
      value={props.value}
      disabled={props.disabled}
      onChange={props.onChange}
      aria-label={props.field.label}
      hasError={props.error !== null}
    />
  );
}

function TextControl(props: BlockFieldProps) {
  const field = props.field;
  if (field.kind === "textarea") {
    return (
      <Textarea
        id={fieldId(field)}
        value={props.value}
        rows={field.rows}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className={props.error === null ? "text-xs" : "text-xs border-danger"}
      />
    );
  }
  if (field.kind === "text" || field.kind === "url") {
    const maxLength = field.kind === "text" ? field.maxLength : undefined;
    return (
      <Input
        id={fieldId(field)}
        type={field.kind === "url" ? "url" : "text"}
        value={props.value}
        maxLength={maxLength}
        placeholder={field.placeholder}
        disabled={props.disabled}
        aria-invalid={props.error !== null}
        onChange={(event) => props.onChange(event.target.value)}
        className={props.error === null ? "h-8 text-xs" : "h-8 text-xs border-danger"}
      />
    );
  }
  if (field.kind === "select") {
    return <SelectControl {...props} field={field} />;
  }
  return null;
}

function nextAssetReference(
  asset: MediaAssetView,
  previous: MediaReference | null
): MediaReference {
  if (previous?.kind !== "asset") {
    return { kind: "asset", assetId: asset.id };
  }
  return {
    kind: "asset",
    assetId: asset.id,
    ...(previous.subKey === undefined ? {} : { subKey: previous.subKey }),
    ...(previous.alt === undefined ? {} : { alt: previous.alt }),
  };
}

function MediaPreview(props: { readonly src: string; readonly alt: string; readonly fileName: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-muted p-2">
      <img src={props.src} alt={props.alt} className="h-10 w-14 rounded object-cover" loading="lazy" />
      <span className="truncate text-[11px] text-text-secondary" title={props.fileName}>
        {props.fileName}
      </span>
    </div>
  );
}

interface MediaFieldActionsProps {
  readonly field: MediaFieldConfig;
  readonly draft: BlockProps;
  readonly reference: MediaReference | null;
  readonly image: ResolvedMediaImage | null;
  readonly controls: MediaPickerControls;
  readonly disabled: boolean;
  readonly onChange: (next: BlockProps) => void;
}

function MediaFieldActions(props: MediaFieldActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectAsset = (asset: MediaAssetView) => {
    props.controls.onAssetSelected(asset);
    props.onChange(
      writeMediaReference({
        props: props.draft,
        path: props.field.path,
        legacyPath: props.field.legacyPath,
        reference: nextAssetReference(asset, props.reference),
      })
    );
    setIsOpen(false);
  };
  const remove = () =>
    props.onChange(
      clearMediaReference({
        props: props.draft,
        path: props.field.path,
        legacyPath: props.field.legacyPath,
      })
    );
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button
          id={fieldId(props.field)}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={props.disabled}
          onClick={() => setIsOpen(true)}
        >
          {props.image === null ? "Choose image" : "Replace image"}
        </Button>
        {props.image === null ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={props.disabled}
            onClick={remove}
          >
            Remove
          </Button>
        )}
      </div>
      <MediaPicker
        client={props.controls.client}
        userPermissions={props.controls.userPermissions}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={selectAsset}
      />
    </>
  );
}

function MediaFieldPreview(props: {
  readonly image: ResolvedMediaImage | null;
  readonly label: string;
}) {
  if (props.image === null) {
    return (
      <p className="rounded-md border border-dashed border-border p-2 text-[11px] text-text-muted">
        No image selected.
      </p>
    );
  }
  return (
    <MediaPreview
      src={props.image.url}
      alt={props.image.alt ?? props.label}
      fileName={props.image.fileName ?? props.label}
    />
  );
}

function MediaFieldControl(props: {
  readonly field: MediaFieldConfig;
  readonly draft: BlockProps;
  readonly controls: MediaPickerControls | null;
  readonly disabled: boolean;
  readonly onChange: (next: BlockProps) => void;
}) {
  const reference = readMediaReference(props.draft, props.field.path);
  const legacyUrl =
    props.field.legacyPath === undefined
      ? null
      : readOptionalString(props.draft, props.field.legacyPath);
  const legacyAlt =
    props.field.altPath === undefined
      ? null
      : readOptionalString(props.draft, props.field.altPath);
  const controls = props.controls;
  if (
    controls === null ||
    !hasPermission(controls.userPermissions, PERMISSIONS.MEDIA.READ)
  ) {
    return <MediaDeniedNotice description={props.field.description} />;
  }
  const image = resolveMediaImage({
    reference: reference ?? undefined,
    legacyUrl: legacyUrl ?? undefined,
    legacyAlt: legacyAlt ?? undefined,
    media: controls.assets,
  });
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-text-muted">{props.field.description}</p>
      <MediaFieldPreview image={image} label={props.field.label} />
      <MediaFieldActions
        field={props.field}
        draft={props.draft}
        reference={reference}
        image={image}
        controls={controls}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </div>
  );
}

function MediaDeniedNotice(props: { readonly description: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-text-muted">{props.description}</p>
      <p role="status" className="rounded-md border border-border bg-surface-muted p-2 text-[11px] text-text-muted">
        {MEDIA_DENIED_MESSAGE}
      </p>
    </div>
  );
}

function FieldLabel(props: { readonly field: BlockFormField }) {
  const className = "text-[11px] font-medium text-text";
  if (props.field.kind === "media") {
    return <span className={className}>{props.field.label}</span>;
  }
  return (
    <Label htmlFor={fieldId(props.field)} className={className}>
      {props.field.label}
    </Label>
  );
}

function FieldControl(props: {
  readonly field: BlockFormField;
  readonly draft: BlockProps;
  readonly controls: MediaPickerControls | null;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly value: string;
  readonly onChangeValue: (value: string) => void;
  readonly onChangeProps: (next: BlockProps) => void;
}) {
  if (props.field.kind === "media") {
    return (
      <MediaFieldControl
        field={props.field}
        draft={props.draft}
        controls={props.controls}
        disabled={props.disabled}
        onChange={props.onChangeProps}
      />
    );
  }
  return (
    <TextControl
      field={props.field}
      value={props.value}
      error={props.error}
      disabled={props.disabled}
      onChange={props.onChangeValue}
    />
  );
}

function BlockField(props: {
  readonly field: BlockFormField;
  readonly draft: BlockProps;
  readonly controls: MediaPickerControls | null;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly value: string;
  readonly onChangeValue: (value: string) => void;
  readonly onChangeProps: (next: BlockProps) => void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel field={props.field} />
      <FieldControl
        field={props.field}
        draft={props.draft}
        controls={props.controls}
        disabled={props.disabled}
        error={props.error}
        value={props.value}
        onChangeValue={props.onChangeValue}
        onChangeProps={props.onChangeProps}
      />
      {props.error === null ? null : (
        <p role="alert" className="text-[11px] font-medium text-danger">
          {props.error}
        </p>
      )}
    </div>
  );
}

/**
 * One config-driven form for every block type. Field layout and constraints are
 * declared in BLOCK_FORM_CONFIGS; this component only renders the schema.
 */
export function BlockForm(props: BlockFormProps) {
  const formConfig = BLOCK_FORM_CONFIGS[props.block.type];
  const [draft, setDraft] = useState<BlockProps>(() => readProps(props.block));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft(readProps(props.block));
    setErrors({});
  }, [props.block]);

  const applyProps = (next: BlockProps) => {
    const nextErrors = blockFormErrors(props.block, next);
    setDraft(next);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      props.onChange(next);
    }
  };

  const changeField = (path: readonly string[], value: string) => {
    applyProps(writeFieldValue({ props: draft, path, raw: value }));
  };

  return (
    <form
      aria-label={"Edit " + props.block.type + " block"}
      className="space-y-3"
      onSubmit={(event) => event.preventDefault()}
    >
      {errors._form === undefined ? null : (
        <p role="alert" className="rounded-md border border-danger bg-surface p-2 text-[11px] text-danger">
          {errors._form}
        </p>
      )}
      {formConfig.fields.map((field) => (
        <BlockField
          key={field.path.join(".")}
          field={field}
          draft={draft}
          controls={props.media}
          disabled={false}
          error={fieldError(errors, field.path)}
          value={readFieldValue(draft, field.path)}
          onChangeValue={(value) => changeField(field.path, value)}
          onChangeProps={applyProps}
        />
      ))}
    </form>
  );
}

export function renderBlockPropertiesForm(
  block: BlockAst,
  media: MediaPickerControls | null,
  onChange: BlockPropsChange
): React.ReactNode {
  return <BlockForm key={block.id} block={block} media={media} onChange={onChange} />;
}
