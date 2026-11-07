import { useEffect, useState } from 'react';

// Only the current loader/revision can produce visible data. Never persist private rows.
export default function useRemoteData(loader) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(loader)
      .then(
        (data) => {
          if (active) setResult({ loader, revision, data, error: null });
        },
        (error) => {
          if (active)
            setResult({
              loader,
              revision,
              data: null,
              error: error.message || 'Please try again.',
            });
        },
      );
    return () => {
      active = false;
    };
  }, [loader, revision]);
  const current = result?.loader === loader && result.revision === revision;
  return {
    data: current ? result.data : null,
    error: current ? result.error : null,
    loading: !current,
    reload: () => setRevision((value) => value + 1),
  };
}
