"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/config-renderers/config-form-renderer";
import { websiteBuilderStudioHref } from "@/components/layout/website-builder-nav.config";
import {
  CmsApiError,
  createSiteRequest,
  listSiteTemplates,
  type CmsTemplateDto,
} from "@/lib/api/site-client";
import {
  createSiteFormConfig,
  siteDraftSchema,
  type SiteDraftValues,
} from "./create-site-wizard.config";

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function problemFieldErrors(error: CmsApiError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const param of error.problem.invalidParams ?? []) {
    fieldErrors[param.name] = param.reason;
  }
  return fieldErrors;
}

function WizardHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-text">Create a website</h1>
        <p className="text-xs text-text-secondary">
          Name it, choose its address and start from a published template or a blank page.
        </p>
      </div>
      <Badge variant="tertiary">Studio opens next</Badge>
    </div>
  );
}

function WizardAlerts(props: {
  readonly templatesError: string | null;
  readonly problem: string | null;
}) {
  return (
    <>
      {props.templatesError !== null ? (
        <p role="alert" className="rounded-lg border border-danger bg-surface p-3 text-xs font-medium text-danger">
          {props.templatesError}
        </p>
      ) : null}
      {props.problem !== null ? (
        <p role="alert" className="rounded-lg border border-danger bg-surface p-3 text-xs font-medium text-danger">
          {props.problem}
        </p>
      ) : null}
    </>
  );
}

function useSiteSubmission() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  const submit = async (values: SiteDraftValues): Promise<void> => {
    setIsSaving(true);
    setProblem(null);
    setServerErrors({});
    try {
      const result = await createSiteRequest(
        {
          title: values.title,
          slug: values.slug,
          templateId: values.templateId.length === 0 ? null : values.templateId,
        },
        idempotencyKey
      );
      router.push(websiteBuilderStudioHref(result.site.id, result.homePage.id));
    } catch (error: unknown) {
      if (error instanceof CmsApiError) {
        setProblem(error.problem.detail);
        setServerErrors(problemFieldErrors(error));
      } else {
        setProblem(readMessage(error));
      }
      setIsSaving(false);
    }
  };

  return { isSaving, serverErrors, problem, submit };
}

export interface CreateSiteWizardProps {
  readonly domainRoot: string;
  readonly templates: readonly CmsTemplateDto[];
  readonly templatesError: string | null;
}

/**
 * One-step, config-driven site creation. Submitting posts once with a stable
 * Idempotency-Key and opens the studio on the new home page; there is no page
 * list or extra setup step in between (FR-078, T164). Server problem details
 * are shown verbatim (RFC 7807).
 */
export function CreateSiteWizard({ domainRoot, templates, templatesError }: CreateSiteWizardProps) {
  const submission = useSiteSubmission();
  const config = useMemo(
    () => createSiteFormConfig(domainRoot, templates),
    [domainRoot, templates]
  );
  // A stable identity: the renderer resets its values whenever initialValues
  // changes, and an inline object would reset the form on every keystroke.
  const initialValues = useMemo<SiteDraftValues>(
    () => ({ title: "", slug: "", templateId: "" }),
    []
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <WizardHeader />
      <WizardAlerts templatesError={templatesError} problem={submission.problem} />
      <ConfigFormRenderer<SiteDraftValues>
        config={config}
        initialValues={initialValues}
        validationSchema={siteDraftSchema}
        isSaving={submission.isSaving}
        serverErrors={submission.serverErrors}
        onSubmit={submission.submit}
      />
    </div>
  );
}

/** Loads the template list once, then renders the form even when it fails. */
export function CreateSiteWizardLoader({ domainRoot }: { readonly domainRoot: string }) {
  const [templates, setTemplates] = useState<CmsTemplateDto[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void listSiteTemplates()
      .then((items) => {
        if (!cancelled) {
          setTemplates(items);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTemplatesError(readMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <CreateSiteWizard domainRoot={domainRoot} templates={templates} templatesError={templatesError} />;
}
