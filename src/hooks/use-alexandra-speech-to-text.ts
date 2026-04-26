"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const EL_LANG = "el-GR";

type SpeechRecInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: Event) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: Event) => void) | null;
  onstart: (() => void) | null;
};

function getConstructor(): (new () => SpeechRecInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecInstance;
    webkitSpeechRecognition?: new () => SpeechRecInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported() {
  return getConstructor() !== null;
}

/**
 * Web Speech API → input. el-GR, interim results into the field.
 * continuous: false → stop after a natural pause (silence); second click calls stop() early.
 */
export function useAlexandraSpeechToText(
  input: string,
  setInput: (v: string | ((prev: string) => string)) => void,
  /** When true (e.g. streaming reply), stop any active recognition */
  inputLocked = false,
) {
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecInstance | null>(null);
  const baseRef = useRef("");
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    setSupported(getConstructor() !== null);
  }, []);

  const stopInternal = useCallback(() => {
    const r = recRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        try {
          r.abort();
        } catch {
          /* ignore */
        }
      }
    }
    recRef.current = null;
    setIsRecording(false);
  }, []);

  const start = useCallback(() => {
    const C = getConstructor();
    if (!C) return;
    if (recRef.current) {
      stopInternal();
      return;
    }
    const r = new C();
    r.continuous = false;
    r.interimResults = true;
    r.lang = EL_LANG;
    r.maxAlternatives = 1;
    baseRef.current = inputRef.current;

    r.onresult = (ev: Event) => {
      const e = ev as unknown as { results: { length: number; [i: number]: { 0: { transcript: string } } } };
      let out = "";
      for (let i = 0; i < e.results.length; i++) {
        out += e.results[i][0].transcript;
      }
      setInput(baseRef.current + out);
    };
    r.onerror = () => {
      setIsRecording(false);
      recRef.current = null;
    };
    r.onend = () => {
      setIsRecording(false);
      recRef.current = null;
    };
    r.onstart = () => {
      setIsRecording(true);
    };
    recRef.current = r;
    try {
      r.start();
    } catch {
      setIsRecording(false);
      recRef.current = null;
    }
  }, [setInput, stopInternal]);

  const toggle = useCallback(() => {
    if (recRef.current) {
      stopInternal();
    } else {
      void start();
    }
  }, [start, stopInternal]);

  useEffect(() => {
    if (inputLocked && recRef.current) {
      stopInternal();
    }
  }, [inputLocked, stopInternal]);

  useEffect(() => {
    return () => {
      if (recRef.current) {
        try {
          recRef.current.abort();
        } catch {
          /* ignore */
        }
        recRef.current = null;
      }
    };
  }, []);

  return {
    supported,
    isRecording,
    toggle,
  };
}
