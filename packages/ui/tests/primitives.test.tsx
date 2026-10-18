import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  Button,
  Input,
  Label,
  Spinner,
  Alert,
  Toast,
  Modal,
  Select,
  AsyncSelect,
  StickyActionBar,
  AlertTriangleIcon,
  AlertCircleIcon,
  XIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  MailIcon,
  WifiOffIcon,
  PasskeyIcon,
  ClockIcon,
  UserIcon,
  RocketIcon,
  GoogleIcon,
  MicrosoftIcon,
  GitHubIcon,
  KeyIcon,
} from "../src/index.js";

describe("@suite/ui Standardized Primitives (SPEC-UI-001)", () => {
  describe("Button Primitive", () => {
    it("renders primary button with token classes and type", () => {
      const html = renderToString(<Button variant="primary">Submit</Button>);
      expect(html).toContain("Submit");
      expect(html).toContain("bg-action");
      expect(html).toContain("text-on-action");
      expect(html).toContain("type=\"button\"");
    });

    it("renders fullWidth button", () => {
      const html = renderToString(<Button fullWidth>Wide Button</Button>);
      expect(html).toContain("w-full");
    });

    it("renders startIcon and endIcon slots", () => {
      const html = renderToString(
        <Button
          startIcon={<span data-testid="start-icon">→</span>}
          endIcon={<span data-testid="end-icon">←</span>}
        >
          Nav Button
        </Button>,
      );
      expect(html).toContain("data-testid=\"start-icon\"");
      expect(html).toContain("data-testid=\"end-icon\"");
      expect(html).toContain("Nav Button");
    });

    it("renders Spinner when isLoading is true and sets aria-busy and disabled", () => {
      const html = renderToString(
        <Button isLoading startIcon={<span>Icon</span>}>
          Saving
        </Button>,
      );
      expect(html).toContain("animate-spin");
      expect(html).toContain("aria-busy=\"true\"");
      expect(html).toContain("disabled=\"\"");
      // startIcon is replaced by spinner during loading
      expect(html).not.toContain("<span>Icon</span>");
    });

    it("renders button variants adhering to DESIGN.md", () => {
      const ghostHtml = renderToString(<Button variant="ghost">Dismiss</Button>);
      expect(htmlTokens(ghostHtml)).toContain("bg-transparent");

      const outlineHtml = renderToString(<Button variant="outline">Options</Button>);
      expect(htmlTokens(outlineHtml)).toContain("border-border-strong");

      const destructiveHtml = renderToString(<Button variant="destructive">Remove</Button>);
      expect(htmlTokens(destructiveHtml)).toContain("bg-danger");
    });
  });

  describe("Input Primitive", () => {
    it("renders standard input with default styling and fullWidth", () => {
      const html = renderToString(<Input placeholder="Enter username" />);
      expect(html).toContain("placeholder=\"Enter username\"");
      expect(html).toContain("w-full");
      expect(html).toContain("border-border-strong");
      expect(html).toContain("bg-surface");
    });

    it("renders error state with aria-invalid and danger borders", () => {
      const html = renderToString(<Input hasError />);
      expect(html).toContain("border-danger");
      expect(html).toContain("aria-invalid=\"true\"");
    });

    it("renders startIcon and endIcon in relative wrapper with proper padding", () => {
      const html = renderToString(
        <Input
          startIcon={<span id="icon-search">🔍</span>}
          endIcon={<span id="icon-clear">✕</span>}
        />,
      );
      expect(html).toContain("id=\"icon-search\"");
      expect(html).toContain("id=\"icon-clear\"");
      expect(html).toContain("relative flex items-center");
      expect(html).toContain("pl-9");
      expect(html).toContain("pr-9");
    });

    it("supports sm and lg input sizes", () => {
      const smHtml = renderToString(<Input inputSize="sm" />);
      expect(smHtml).toContain("h-8");
      expect(smHtml).toContain("text-xs");

      const lgHtml = renderToString(<Input inputSize="lg" />);
      expect(lgHtml).toContain("h-11");
      expect(lgHtml).toContain("text-base");
    });
  });

  describe("Label Primitive", () => {
    it("renders label with typography label-sm and htmlFor association", () => {
      const html = renderToString(<Label htmlFor="user-email">Email Address</Label>);
      expect(html).toContain("for=\"user-email\"");
      expect(html).toContain("text-xs");
      expect(html).toContain("text-text-secondary");
      expect(html).toContain("Email Address");
    });

    it("renders required indicator when required is true", () => {
      const html = renderToString(<Label required>Password</Label>);
      expect(html).toContain("Password");
      expect(html).toContain("text-danger");
      expect(html).toContain("*");
    });
  });

  describe("Spinner Primitive", () => {
    it("renders SVG spinner with animate-spin", () => {
      const html = renderToString(<Spinner size="md" color="action" />);
      expect(html).toContain("<svg");
      expect(html).toContain("animate-spin");
      expect(html).toContain("h-5 w-5");
      expect(html).toContain("text-action");
    });
  });

  describe("Icon Primitives", () => {
    it("renders AlertTriangleIcon and AlertCircleIcon with default and custom sizes", () => {
      const triangleHtml = renderToString(<AlertTriangleIcon size={16} className="text-danger" />);
      expect(triangleHtml).toContain("<svg");
      expect(triangleHtml).toContain('width="16"');
      expect(triangleHtml).toContain('height="16"');
      expect(triangleHtml).toContain("text-danger");

      const circleHtml = renderToString(<AlertCircleIcon size={24} className="text-warning" />);
      expect(circleHtml).toContain("<svg");
      expect(circleHtml).toContain('width="24"');
      expect(circleHtml).toContain('height="24"');
      expect(circleHtml).toContain("text-warning");
    });

    it("renders XIcon / CloseIcon and navigation arrows", () => {
      const xHtml = renderToString(<XIcon size={14} className="text-text-muted" />);
      expect(xHtml).toContain("<svg");
      expect(xHtml).toContain('width="14"');

      const arrowLeftHtml = renderToString(<ArrowLeftIcon size={16} />);
      expect(arrowLeftHtml).toContain("<svg");
      expect(arrowLeftHtml).toContain('width="16"');

      const chevronRightHtml = renderToString(<ChevronRightIcon size={16} />);
      expect(chevronRightHtml).toContain("<svg");
      expect(chevronRightHtml).toContain('width="16"');
    });

    it("renders domain icons (MailIcon, WifiOffIcon, PasskeyIcon, ClockIcon, UserIcon, RocketIcon)", () => {
      const mailHtml = renderToString(<MailIcon size={18} />);
      expect(mailHtml).toContain("<svg");
      expect(mailHtml).toContain('width="18"');

      const wifiHtml = renderToString(<WifiOffIcon size={24} />);
      expect(wifiHtml).toContain("<svg");
      expect(wifiHtml).toContain('width="24"');

      const passkeyHtml = renderToString(<PasskeyIcon size={20} />);
      expect(passkeyHtml).toContain("<svg");
      expect(passkeyHtml).toContain('width="20"');

      const clockHtml = renderToString(<ClockIcon size={20} />);
      expect(clockHtml).toContain("<svg");

      const userHtml = renderToString(<UserIcon size={20} />);
      expect(userHtml).toContain("<svg");

      const rocketHtml = renderToString(<RocketIcon size={24} />);
      expect(rocketHtml).toContain("<svg");
    });

    it("renders OAuth brand and provider icons (GoogleIcon, MicrosoftIcon, GitHubIcon, KeyIcon)", () => {
      const googleHtml = renderToString(<GoogleIcon size={16} />);
      expect(googleHtml).toContain("<svg");
      expect(googleHtml).toContain('width="16"');
      expect(googleHtml).toContain("#4285F4");

      const msHtml = renderToString(<MicrosoftIcon size={16} />);
      expect(msHtml).toContain("<svg");
      expect(msHtml).toContain('width="16"');
      expect(msHtml).toContain("#f35325");

      const ghHtml = renderToString(<GitHubIcon size={16} />);
      expect(ghHtml).toContain("<svg");
      expect(ghHtml).toContain('width="16"');

      const keyHtml = renderToString(<KeyIcon size={16} />);
      expect(keyHtml).toContain("<svg");
      expect(keyHtml).toContain('width="16"');
    });
  });

  describe("Alert Component (DESIGN.md Status Tokens)", () => {
    it("renders success alert with token classes and check icon", () => {
      const html = renderToString(
        <Alert variant="success" message="Changes saved successfully" />
      );
      expect(html).toContain("Changes saved successfully");
      expect(html).toContain("border-success/40");
      expect(html).toContain("bg-success/10");
      expect(html).toContain("<svg");
    });

    it("renders error alert with danger tokens and dismiss button", () => {
      const html = renderToString(
        <Alert
          variant="error"
          title="Validation Error"
          message="Invalid input provided"
          dismissible
        />
      );
      expect(html).toContain("Validation Error");
      expect(html).toContain("Invalid input provided");
      expect(html).toContain("border-danger/40");
      expect(html).toContain("aria-label=\"Dismiss alert\"");
    });
  });

  describe("Select & AsyncSelect Dropdowns (DESIGN.md Tokens)", () => {
    it("renders Select dropdown trigger with options and rotating chevron", () => {
      const options = [
        { label: "Option 1", value: "opt-1" },
        { label: "Option 2", value: "opt-2" },
      ];
      const html = renderToString(
        <Select
          id="test-select"
          options={options}
          value="opt-1"
          placeholder="Choose an option"
        />
      );
      expect(html).toContain("Option 1");
      expect(html).toContain("<svg");
      expect(html).toContain("type=\"button\"");
    });

    it("renders AsyncSelect in loading state initially", () => {
      const html = renderToString(
        <AsyncSelect
          loadOptions={async () => []}
          loadingMessage="Fetching workspaces..."
        />
      );
      expect(html).toContain("Fetching workspaces...");
    });
  });

  describe("StickyActionBar Component", () => {
    it("renders sticky action bar with status prompt and action buttons", () => {
      const html = renderToString(
        <StickyActionBar
          isDirty={true}
          statusPrompt="Unsaved modifications"
          saveLabel="Commit Changes"
          discardLabel="Revert"
        />
      );
      expect(html).toContain("Unsaved modifications");
      expect(html).toContain("Commit Changes");
      expect(html).toContain("Revert");
      expect(html).toContain("sticky bottom-0");
    });
  });

  describe("Modal Component (DESIGN.md Modal Wrapper)", () => {
    it("returns null when isOpen is false", () => {
      const html = renderToString(
        <Modal isOpen={false} onClose={() => {}} title="Test Modal">
          <p>Modal body content</p>
        </Modal>
      );
      expect(html).toBe("");
    });
  });

  describe("Toast Floating Component", () => {
    it("renders inline alert or toast content properly", () => {
      const html = renderToString(
        <Toast
          position="inline"
          variant="success"
          message="Toast message verified"
        />
      );
      expect(html).toContain("Toast message verified");
      expect(html).toContain("border-success/40");
    });
  });
});


function htmlTokens(html: string): string {
  return html;
}
