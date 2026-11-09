"use client";

import { useCallback, useState } from "react";

export interface InvitationFieldValues {
  name: string;
  password: string;
  confirmPassword: string;
  setName: (value: string) => void;
  setPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
}

/** Raw credential values for the invitation acceptance form. */
export function useInvitationFieldValues(): InvitationFieldValues {
  const [name, setNameValue] = useState("");
  const [password, setPasswordValue] = useState("");
  const [confirmPassword, setConfirmPasswordValue] = useState("");

  const setName = useCallback((value: string): void => {
    setNameValue(value);
  }, []);
  const setPassword = useCallback((value: string): void => {
    setPasswordValue(value);
  }, []);
  const setConfirmPassword = useCallback((value: string): void => {
    setConfirmPasswordValue(value);
  }, []);

  return { name, password, confirmPassword, setName, setPassword, setConfirmPassword };
}
