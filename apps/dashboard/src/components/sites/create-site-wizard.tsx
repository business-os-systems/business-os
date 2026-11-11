"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@suite/ui";
import { ConfigFormRenderer } from "@/components/config-renderers/config-form-renderer";
import { websiteBuilderStudioHref } from "@/components/layout/website-builder-nav.config";
import {
  CmsApiError,
  createSiteRequest,
  listSiteTemplates,
  type CmsTemplateDto,
} from "@/lib/api/site-client";
import {
  SITE_WIZARD_STEP_LABELS,
  SITE_WIZARD_STEP_ORDER,
  createSiteAddressConfig,
  createSiteTemplateConfig,
  siteAddressSchema,
  siteNameFormConfig,
  siteNameSchema,
  siteTemplateSchema,
  type SiteAddressValues,
  type SiteNameValues,
  type SiteTemplateValues,
  type SiteWizardStep,
} from "./create-site-wizard.config";

interface SiteWizardValues extends SiteNameValues, SiteAddressValues, SiteTemplateValues {}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readSubmitLabel(isSaving: boolean, isLastStep: boolean): string {
  if (isSaving) {
    return "Creating site...";
  }
  return isLastStep ? "Create site and open studio" : "Continue";
}

function problemFieldErrors(error: CmsApiError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const param of error.problem.invalidParams ?? []) {
    fieldErrors[param.name] = param.reason;
  }
  return fieldErrors;
}

function StepTracker(props: { readonly step: SiteWizardStep }) {
  const activeIndex = SITE_WIZARD_STEP_ORDER.indexOf(props.step);
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Create-site steps">
      {SITE_WIZARD_STEP_ORDER.map((step, index) => {
        const isActive = index === activeIndex;
        const isComplete = index < activeIndex;
        const barClass = isActive || isComplete
          ? "h-1.5 rounded-full bg-action"
          : "h-1.5 rounded-full bg-surface-sunken";
        return (
          <li key={step} className="space-y-1.5">
            <div className={barClass} />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-text-muted">{String(index + 1)}</span>
              <span className={isActive ? "text-[11px] font-semibold text-text" : "text-[11px] text-text-muted"}>
                {SITE_WIZARD_STEP_LABELS[step]}
              </span>
              {isComplete ? <Badge variant="secondary" className="text-[9px]">Done</Badge> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface WizardStepFormProps {
  readonly step: SiteWizardStep;
  readonly draft: SiteWizardValues;
  readonly domainRoot: string;
  readonly templates: readonly CmsTemplateDto[];
  readonly isSaving: boolean;
  readonly serverErrors: Record<string, string>;
  readonly onSubmitName: (values: SiteNameValues) => void;
  readonly onSubmitAddress: (values: SiteAddressValues) => void;
  readonly onSubmitTemplate: (values: SiteTemplateValues) => void;
}

function WizardStepForm(props: WizardStepFormProps) {
  const addressConfig = useMemo(
    () => createSiteAddressConfig(props.domainRoot),
    [props.domainRoot]
  );
  const templateConfig = useMemo(
    () => createSiteTemplateConfig(props.templates),
    [props.templates]
  );
  const initialName = useMemo(() => ({ title: props.draft.title }), [props.draft.title]);
  const initialAddress = useMemo(() => ({ slug: props.draft.slug }), [props.draft.slug]);
  const initialTemplate = useMemo(
    () => ({ templateId: props.draft.templateId }),
    [props.draft.templateId]
  );

  if (props.step === "name") {
    return (
      <ConfigFormRenderer<SiteNameValues>
        config={siteNameFormConfig}
        initialValues={initialName}
        validationSchema={siteNameSchema}
        isSaving={props.isSaving}
        serverErrors={props.serverErrors}
        onSubmit={props.onSubmitName}
      />
    );
  }
  if (props.step === "address") {
    return (
      <ConfigFormRenderer<SiteAddressValues>
        config={addressConfig}
        initialValues={initialAddress}
        validationSchema={siteAddressSchema}
        isSaving={props.isSaving}
        serverErrors={props.serverErrors}
        onSubmit={props.onSubmitAddress}
      />
    );
  }
  return (
    <ConfigFormRenderer<SiteTemplateValues>
      config={templateConfig}
      initialValues={initialTemplate}
      validationSchema={siteTemplateSchema}
      isSaving={props.isSaving}
      serverErrors={props.serverErrors}
      onSubmit={props.onSubmitTemplate}
    />
  );
}

function WizardHeader() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Create a website</h1>
          <p className="text-xs text-text-secondary">
            Name it, choose its address and start from a published template or a blank page.
          </p>
        </div>
        <Badge variant="tertiary">Studio opens next</Badge>
      </div>
    </div>
  );
}

function WizardAlerts(props: {
  readonly templatesError: string | null;
  readonly problem: string | null;
  readonly showNoTemplates: boolean;
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
      {props.showNoTemplates ? (
        <p className="rounded-lg border border-dashed border-border bg-surface p-4 text-xs text-text-muted">
          No published templates are available to this workspace yet. Start blank; the studio still opens on the home page.
        </p>
      ) : null}
    </>
  );
}

interface WizardFooterProps {
  readonly step: SiteWizardStep;
  readonly isSaving: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}

function WizardFooter(props: WizardFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={props.onBack}
        disabled={props.step === "name" || props.isSaving}
      >
        Back
      </Button>
      <Button type="button" variant="default" size="sm" onClick={props.onContinue} disabled={props.isSaving}>
        {readSubmitLabel(props.isSaving, props.step === "template")}
      </Button>
    </div>
  );
}

function useSiteWizardState() {
  const [step, setStep] = useState<SiteWizardStep>("name");
  const [draft, setDraft] = useState<SiteWizardValues>({ title: "", slug: "", templateId: "" });

  const goToAddress = (values: SiteNameValues) => {
    setDraft((previous) => ({ ...previous, title: values.title }));
    setStep("address");
  };
  const goToTemplate = (values: SiteAddressValues) => {
    setDraft((previous) => ({ ...previous, slug: values.slug }));
    setStep("template");
  };
  const back = () => {
    if (step === "template") {
      setStep("address");
      return;
    }
    if (step === "address") {
      setStep("name");
    }
  };
  return { step, draft, goToAddress, goToTemplate, back };
}

function useSiteSubmission(draft: SiteWizardValues) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  const reset = () => {
    setProblem(null);
    setServerErrors({});
  };

  const submit = async (templateId: string) => {
    setIsSaving(true);
    reset();
    try {
      const result = await createSiteRequest(
        { title: draft.title, slug: draft.slug, templateId: templateId.length === 0 ? null : templateId },
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

  return { isSaving, serverErrors, problem, reset, submit };
}

export interface CreateSiteWizardProps {
  readonly domainRoot: string;
  readonly templates: readonly CmsTemplateDto[];
  readonly templatesError: string | null;
}

/**
 * Three-step, config-driven site creation. The final step posts once with a
 * stable Idempotency-Key and, on success, opens the studio on the new home page
 * (FR-078). Server problem details are shown verbatim (RFC 7807).
 */
export function CreateSiteWizard({ domainRoot, templates, templatesError }: CreateSiteWizardProps) {
  const wizard = useSiteWizardState();
  const submission = useSiteSubmission(wizard.draft);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const submitCurrentStep = () => {
    wrapperRef.current?.querySelector("form")?.requestSubmit();
  };
  const handleName = (values: SiteNameValues) => {
    submission.reset();
    wizard.goToAddress(values);
  };
  const handleAddress = (values: SiteAddressValues) => {
    submission.reset();
    wizard.goToTemplate(values);
  };
  const handleTemplate = (values: SiteTemplateValues) => {
    void submission.submit(values.templateId);
  };
  const handleBack = () => {
    submission.reset();
    wizard.back();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <WizardHeader />
      <StepTracker step={wizard.step} />
      <WizardAlerts
        templatesError={templatesError}
        problem={submission.problem}
        showNoTemplates={wizard.step === "template" && templates.length === 0}
      />
      <div ref={wrapperRef}>
        <WizardStepForm
          step={wizard.step}
          draft={wizard.draft}
          domainRoot={domainRoot}
          templates={templates}
          isSaving={submission.isSaving}
          serverErrors={submission.serverErrors}
          onSubmitName={handleName}
          onSubmitAddress={handleAddress}
          onSubmitTemplate={handleTemplate}
        />
      </div>
      <WizardFooter
        step={wizard.step}
        isSaving={submission.isSaving}
        onBack={handleBack}
        onContinue={submitCurrentStep}
      />
    </div>
  );
}

/** Loads the template list once, then renders the wizard even when it fails. */
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
