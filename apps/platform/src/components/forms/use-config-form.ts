"use client";

import { useState } from "react";
import type { ConfigFormErrors } from "./config-form.types";

interface ConfigFormStateInput<T extends object> {
  readonly initialValues: T;
  readonly initialErrors?: ConfigFormErrors<T>;
}

/** One values/errors/edit lifecycle for the Platform configuration forms. */
export function useConfigForm<T extends object>(
  input: ConfigFormStateInput<T>
) {
  const [values, setValues] = useState<T>(input.initialValues);
  const [errors, setErrors] = useState<ConfigFormErrors<T>>(
    input.initialErrors ?? {}
  );

  function updateField(name: keyof T & string, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  return { values, setValues, errors, setErrors, updateField };
}
