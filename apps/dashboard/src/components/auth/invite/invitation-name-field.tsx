"use client";

import React from "react";
import { Input, Label } from "@suite/ui";

const NAME_FIELD_ID = "invitee-name";

export interface InvitationNameFieldProps {
  name: string;
  disabled: boolean;
  onNameChange: (value: string) => void;
}

/** Optional full-name field; the server derives a fallback from the email. */
export function InvitationNameField({
  name,
  disabled,
  onNameChange,
}: InvitationNameFieldProps) {
  return (
    <div className="space-y-1">
      <Label size="sm" htmlFor={NAME_FIELD_ID}>
        Full Name
      </Label>
      <Input
        id={NAME_FIELD_ID}
        type="text"
        placeholder="Your full name"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        disabled={disabled}
        fullWidth
      />
    </div>
  );
}
