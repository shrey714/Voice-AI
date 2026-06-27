import React from 'react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react-native';
import { shopAdapter, setAiRuntime } from '../services/aiRuntime';

// Mounts the Ask-AI runtime once, app-wide, so the conversation persists across
// navigation (created per-screen, it would reset every time you leave Ask AI).
export default function AiProvider({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime(shopAdapter);
  setAiRuntime(runtime);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
