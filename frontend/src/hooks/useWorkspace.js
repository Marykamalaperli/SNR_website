import { createContext, useContext } from 'react';

export const WorkspaceContext = createContext(null);
export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('Workspace context is required');
  return workspace;
}
