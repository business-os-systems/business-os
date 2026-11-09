"use client";

import { useCallback, useState } from "react";

export interface LinkAccountPasswordState {
  password: string;
  showPassword: boolean;
  setPassword: (value: string) => void;
  togglePasswordVisibility: () => void;
}

/** Password field state for the collision challenge. */
export function useLinkAccountPassword(): LinkAccountPasswordState {
  const [password, setPasswordValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const setPassword = useCallback((value: string): void => {
    setPasswordValue(value);
  }, []);
  const togglePasswordVisibility = useCallback((): void => {
    setShowPassword((current) => !current);
  }, []);

  return { password, showPassword, setPassword, togglePasswordVisibility };
}
